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
    public static string ConversionDefinition => Loc.T(
        "Abschlussquote = angenommene Angebote ÷ (angenommene + abgelehnte + abgelaufene Angebote) mit Angebotsdatum im gewählten Zeitraum. "
        + "Offene, stornierte und Entwurfs-Angebote zählen nicht. Revisionen werden einzeln gezählt.",
        "Conversion rate = accepted quotations ÷ (accepted + rejected + expired quotations) with a quotation date in the selected period. "
        + "Open, cancelled and draft quotations do not count. Revisions are counted individually.");

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

        // Invoices: open/overdue are current state; invoiced and received amounts refer to the period.
        var openInvoices = db.Invoices.AsNoTracking().Where(i => i.Kind == InvoiceKind.Invoice && (i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.PartiallyPaid));
        var openStats = await openInvoices.GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Amount = g.Sum(i => i.GrossTotal - i.PaidAmount) }).FirstOrDefaultAsync(ct);
        var overdueQuery = openInvoices.Where(i => i.DueDate < today);
        var overdueStats = await overdueQuery.GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Amount = g.Sum(i => i.GrossTotal - i.PaidAmount) }).FirstOrDefaultAsync(ct);
        var overdueList = await overdueQuery.OrderBy(i => i.DueDate).Take(8)
            .Select(x => new InvoiceListItemDto(x.Id, x.Number, x.Kind, x.Status, x.Title, x.CustomerId, x.RecipientName, x.IssueDate, x.DueDate, x.NetTotal, x.GrossTotal,
                x.PaidAmount, x.GrossTotal - x.PaidAmount, true, today.DayNumber - x.DueDate.DayNumber, x.SentAt, x.UpdatedAt))
            .ToListAsync(ct);
        var invoicedNet = await db.Invoices.AsNoTracking()
            .Where(i => i.Number != null && i.IssueDate >= periodFrom && i.IssueDate <= periodTo)
            .SumAsync(i => i.Kind == InvoiceKind.Cancellation ? -i.NetTotal : i.NetTotal, ct);
        var received = await db.InvoicePayments.AsNoTracking().Where(p => p.PaidOn >= periodFrom && p.PaidOn <= periodTo).SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var activity = await ActivityAsync(member, 1, 8, ct);

        return new DashboardDto(
            periodFrom, periodTo, Count(QuotationStatus.Draft), Count(QuotationStatus.Sent), accepted, Count(QuotationStatus.Rejected), Count(QuotationStatus.Expired),
            expiringSoonCount, followUpsDue, quotedValue, Net(QuotationStatus.Accepted), conversion, ConversionDefinition,
            awaiting, expiringSoon, upcoming, activity.Items, openJobs,
            openStats?.Count ?? 0, openStats?.Amount ?? 0m, overdueStats?.Count ?? 0, overdueStats?.Amount ?? 0m, invoicedNet, received, overdueList);
    }

    public async Task<PagedResult<ActivityDto>> ActivityAsync(CurrentMember member, int page, int pageSize, CancellationToken ct)
    {
        var (p, size) = Paging.Normalize(page, pageSize);
        var q = db.AuditEvents.AsNoTracking().Where(a => a.CompanyId == member.CompanyId && LabelKeys.Contains(a.Action));
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(a => a.OccurredAt).Skip((p - 1) * size).Take(size).ToListAsync(ct);
        var userIds = rows.Where(r => r.UserId != null).Select(r => r.UserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        var items = rows.Select(a =>
        {
            var label = Loc.T(Labels[a.Action].De, Labels[a.Action].En);
            var summary = StoredText.ActivitySummary(a.Action, a.Summary);
            return new ActivityDto(
                a.Id, a.Action, a.OccurredAt,
                a.UserId is { } uid ? names.GetValueOrDefault(uid, Loc.T("Gelöschter Benutzer", "Deleted user"))
                    : a.Action.EndsWith("_by_customer", StringComparison.Ordinal) || a.Action == "customer.opted_out" ? Loc.T("Kunde", "Customer") : "System",
                string.IsNullOrWhiteSpace(summary) ? label : $"{label}: {summary}",
                a.EntityType, a.EntityId);
        }).ToList();
        return new PagedResult<ActivityDto>(items, p, size, total);
    }

    private static readonly Dictionary<string, (string De, string En)> Labels = new()
    {
        ["company.created"] = ("Firma angelegt", "Company created"),
        ["company.updated"] = ("Firmendaten geändert", "Company details changed"),
        ["company.settings_updated"] = ("Einstellungen geändert", "Settings changed"),
        ["company.logo_uploaded"] = ("Logo hochgeladen", "Logo uploaded"),
        ["customer.created"] = ("Kunde angelegt", "Customer created"),
        ["customer.updated"] = ("Kunde bearbeitet", "Customer edited"),
        ["customer.archived"] = ("Kunde archiviert", "Customer archived"),
        ["customer.anonymized"] = ("Kunde anonymisiert", "Customer anonymised"),
        ["customer.deleted"] = ("Kunde gelöscht", "Customer deleted"),
        ["customer.opted_out"] = ("Kunde hat Erinnerungen abbestellt", "Customer unsubscribed from reminders"),
        ["quotation.created"] = ("Angebot erstellt", "Quotation created"),
        ["quotation.duplicated"] = ("Angebot dupliziert", "Quotation duplicated"),
        ["quotation.revised"] = ("Revision erstellt", "Revision created"),
        ["quotation.sent"] = ("Angebot per E-Mail versendet", "Quotation sent by email"),
        ["quotation.marked_sent"] = ("Angebot als versendet markiert", "Quotation marked as sent"),
        ["quotation.accepted"] = ("Annahme erfasst", "Acceptance recorded"),
        ["quotation.rejected"] = ("Ablehnung erfasst", "Rejection recorded"),
        ["quotation.accepted_by_customer"] = ("Angebot vom Kunden angenommen", "Quotation accepted by the customer"),
        ["quotation.rejected_by_customer"] = ("Angebot vom Kunden abgelehnt", "Quotation rejected by the customer"),
        ["quotation.cancelled"] = ("Angebot storniert", "Quotation cancelled"),
        ["quotation.expired"] = ("Angebot abgelaufen", "Quotation expired"),
        ["quotation.deleted"] = ("Entwurf gelöscht", "Draft deleted"),
        ["job.created"] = ("Auftrag erstellt", "Job created"),
        ["invoice.created"] = ("Rechnungsentwurf erstellt", "Invoice draft created"),
        ["invoice.issued"] = ("Rechnung gestellt", "Invoice issued"),
        ["invoice.sent"] = ("Rechnung per E-Mail versendet", "Invoice sent by email"),
        ["invoice.marked_sent"] = ("Rechnung als versendet markiert", "Invoice marked as sent"),
        ["invoice.payment_recorded"] = ("Teilzahlung erfasst", "Partial payment recorded"),
        ["invoice.paid"] = ("Rechnung bezahlt", "Invoice paid"),
        ["invoice.payment_removed"] = ("Zahlung entfernt", "Payment removed"),
        ["invoice.reminder_sent"] = ("Zahlungserinnerung versendet", "Payment reminder sent"),
        ["invoice.cancelled"] = ("Rechnung storniert", "Invoice cancelled"),
        ["invoice.deleted"] = ("Rechnungsentwurf gelöscht", "Invoice draft deleted"),
        ["job.status_changed"] = ("Auftragsstatus geändert", "Job status changed"),
        ["template.created"] = ("Vorlage erstellt", "Template created"),
        ["member.invited"] = ("Teammitglied eingeladen", "Team member invited"),
        ["member.joined"] = ("Teammitglied beigetreten", "Team member joined"),
        ["member.deactivated"] = ("Teammitglied deaktiviert", "Team member deactivated"),
        ["member.role_changed"] = ("Rolle geändert", "Role changed"),
    };

    private static readonly string[] LabelKeys = [.. Labels.Keys];

    private IQueryable<QuotationListItemDto> Project(IQueryable<Quotation> q) =>
        q.Select(x => new QuotationListItemDto(x.Id, x.Number, x.Title, x.Status, x.CustomerId, x.RecipientName, x.IssueDate, x.ValidUntil, x.NetTotal, x.GrossTotal,
            x.SentAt, x.UpdatedAt, x.RevisionNumber, db.Jobs.Any(j => j.QuotationId == x.Id)));
}
