using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Customers;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Dashboard;

public sealed class DashboardService(IAppDbContext db, TimeProvider clock)
{
    public const string ConversionDefinition =
        "Abschlussquote = angenommene Angebote ÷ (angenommene + abgelehnte + abgelaufene Angebote) mit Angebotsdatum im gewählten Zeitraum. "
        + "Offene, stornierte und Entwurfs-Angebote zählen nicht. Revisionen werden einzeln gezählt.";

    public async Task<DashboardDto> GetAsync(CurrentMember member, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var periodFrom = from ?? new DateOnly(today.Year, today.Month, 1);
        var periodTo = to ?? today;
        if (periodTo < periodFrom)
        {
            (periodFrom, periodTo) = (periodTo, periodFrom);
        }

        var inPeriod = db.Quotations.AsNoTracking().Where(q => q.IssueDate >= periodFrom && q.IssueDate <= periodTo);
        var byStatus = await inPeriod.GroupBy(q => q.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Net = g.Sum(q => q.NetTotal) })
            .ToListAsync(ct);
        int Count(QuotationStatus s) => byStatus.FirstOrDefault(x => x.Status == s)?.Count ?? 0;
        decimal Net(QuotationStatus s) => byStatus.FirstOrDefault(x => x.Status == s)?.Net ?? 0m;

        var accepted = Count(QuotationStatus.Accepted);
        var decided = accepted + Count(QuotationStatus.Rejected) + Count(QuotationStatus.Expired);
        decimal? conversion = decided == 0 ? null : Math.Round(accepted * 100m / decided, 1, MidpointRounding.AwayFromZero);
        var quotedValue = byStatus.Where(x => x.Status is not (QuotationStatus.Draft or QuotationStatus.Cancelled)).Sum(x => x.Net);

        var soon = today.AddDays(7);
        var openQuery = db.Quotations.AsNoTracking().Where(q => q.Status == QuotationStatus.Sent);
        var awaiting = await Project(openQuery.OrderBy(q => q.ValidUntil).Take(8)).ToListAsync(ct);
        var expiringQuery = openQuery.Where(q => q.ValidUntil <= soon);
        var expiringSoonCount = await expiringQuery.CountAsync(ct);
        var expiringSoon = await Project(expiringQuery.OrderBy(q => q.ValidUntil).Take(8)).ToListAsync(ct);

        var followUpHorizon = now.AddDays(7);
        var followUpsQuery = db.FollowUpSchedules.AsNoTracking().Where(f => f.Status == FollowUpStatus.Scheduled && f.DueAt <= followUpHorizon);
        var followUpsDue = await followUpsQuery.CountAsync(ct);
        var upcoming = await followUpsQuery.OrderBy(f => f.DueAt).Take(8)
            .Join(db.Quotations, f => f.QuotationId, q => q.Id, (f, q) => new FollowUpDueDto(q.Id, q.Number, q.RecipientName, f.Kind, f.DueAt))
            .ToListAsync(ct);

        var openJobs = await db.Jobs.CountAsync(j => j.Status == JobStatus.Open || j.Status == JobStatus.InProgress, ct);
        var activity = await ActivityAsync(member, 1, 8, ct);

        return new DashboardDto(
            periodFrom, periodTo, Count(QuotationStatus.Draft), Count(QuotationStatus.Sent), accepted, Count(QuotationStatus.Rejected), Count(QuotationStatus.Expired),
            expiringSoonCount, followUpsDue, quotedValue, Net(QuotationStatus.Accepted), conversion, ConversionDefinition,
            awaiting, expiringSoon, upcoming, activity.Items, openJobs);
    }

    public async Task<PagedResult<ActivityDto>> ActivityAsync(CurrentMember member, int page, int pageSize, CancellationToken ct)
    {
        var (p, size) = Paging.Normalize(page, pageSize);
        var q = db.AuditEvents.AsNoTracking().Where(a => a.CompanyId == member.CompanyId && LabelKeys.Contains(a.Action));
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(a => a.OccurredAt).Skip((p - 1) * size).Take(size).ToListAsync(ct);
        var userIds = rows.Where(r => r.UserId != null).Select(r => r.UserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        var items = rows.Select(a => new ActivityDto(
            a.Id, a.Action, a.OccurredAt,
            a.UserId is { } uid ? names.GetValueOrDefault(uid, "Gelöschter Benutzer") : a.Action.EndsWith("_by_customer", StringComparison.Ordinal) || a.Action == "customer.opted_out" ? "Kunde" : "System",
            string.IsNullOrWhiteSpace(a.Summary) ? Labels[a.Action] : $"{Labels[a.Action]}: {a.Summary}",
            a.EntityType, a.EntityId)).ToList();
        return new PagedResult<ActivityDto>(items, p, size, total);
    }

    private static readonly Dictionary<string, string> Labels = new()
    {
        ["company.created"] = "Firma angelegt",
        ["company.updated"] = "Firmendaten geändert",
        ["company.settings_updated"] = "Einstellungen geändert",
        ["company.logo_uploaded"] = "Logo hochgeladen",
        ["customer.created"] = "Kunde angelegt",
        ["customer.updated"] = "Kunde bearbeitet",
        ["customer.archived"] = "Kunde archiviert",
        ["customer.anonymized"] = "Kunde anonymisiert",
        ["customer.deleted"] = "Kunde gelöscht",
        ["customer.opted_out"] = "Kunde hat Erinnerungen abbestellt",
        ["quotation.created"] = "Angebot erstellt",
        ["quotation.duplicated"] = "Angebot dupliziert",
        ["quotation.revised"] = "Revision erstellt",
        ["quotation.sent"] = "Angebot per E-Mail versendet",
        ["quotation.marked_sent"] = "Angebot als versendet markiert",
        ["quotation.accepted"] = "Annahme erfasst",
        ["quotation.rejected"] = "Ablehnung erfasst",
        ["quotation.accepted_by_customer"] = "Angebot vom Kunden angenommen",
        ["quotation.rejected_by_customer"] = "Angebot vom Kunden abgelehnt",
        ["quotation.cancelled"] = "Angebot storniert",
        ["quotation.expired"] = "Angebot abgelaufen",
        ["quotation.deleted"] = "Entwurf gelöscht",
        ["job.created"] = "Auftrag erstellt",
        ["job.status_changed"] = "Auftragsstatus geändert",
        ["template.created"] = "Vorlage erstellt",
        ["member.invited"] = "Teammitglied eingeladen",
        ["member.joined"] = "Teammitglied beigetreten",
        ["member.deactivated"] = "Teammitglied deaktiviert",
        ["member.role_changed"] = "Rolle geändert",
    };

    private static readonly string[] LabelKeys = [.. Labels.Keys];

    private IQueryable<QuotationListItemDto> Project(IQueryable<Quotation> q) =>
        q.Select(x => new QuotationListItemDto(x.Id, x.Number, x.Title, x.Status, x.CustomerId, x.RecipientName, x.IssueDate, x.ValidUntil, x.NetTotal, x.GrossTotal,
            x.SentAt, x.UpdatedAt, x.RevisionNumber, db.Jobs.Any(j => j.QuotationId == x.Id)));
}
