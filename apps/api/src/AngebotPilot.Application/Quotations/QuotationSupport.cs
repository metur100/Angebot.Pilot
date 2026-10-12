using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Files;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.Notifications;
using AngebotPilot.Domain.Quotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AngebotPilot.Application.Quotations;

public sealed class DocumentNumbering(IAppDbContext db)
{
    /// <summary>Reserves the next number, e.g. AN-2026-0042. Safe under concurrent requests; numbers are never reused.</summary>
    public async Task<string> NextAsync(Guid companyId, DocumentSequenceKind kind, string prefix, int year, CancellationToken ct)
    {
        var value = await db.NextSequenceValueAsync(companyId, kind, year, ct);
        return $"{prefix}-{year}-{value:0000}";
    }
}

public static class FollowUpCanceller
{
    /// <summary>Cancels scheduled reminders and reminder emails not yet handed to the mail server.</summary>
    public static async Task<int> CancelForQuotationAsync(IAppDbContext db, Guid quotationId, DateTimeOffset now, string reason, CancellationToken ct)
    {
        var cancelled = await db.FollowUpSchedules.IgnoreQueryFilters()
            .Where(f => f.QuotationId == quotationId && f.Status == FollowUpStatus.Scheduled)
            .ExecuteUpdateAsync(s => s.SetProperty(f => f.Status, FollowUpStatus.Cancelled).SetProperty(f => f.ProcessedAt, now).SetProperty(f => f.StatusReason, reason), ct);
        await db.EmailDeliveries
            .Where(e => e.QuotationId == quotationId
                && (e.Kind == EmailKind.FirstReminder || e.Kind == EmailKind.SecondReminder || e.Kind == EmailKind.ExpiryReminder)
                && (e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EmailStatus.Cancelled).SetProperty(e => e.LastError, reason), ct);
        return cancelled;
    }

    public static async Task CancelForCustomerAsync(IAppDbContext db, Guid customerId, DateTimeOffset now, string reason, CancellationToken ct)
    {
        var quotationIds = await db.Quotations.IgnoreQueryFilters().Where(q => q.CustomerId == customerId).Select(q => q.Id).ToListAsync(ct);
        foreach (var id in quotationIds)
        {
            await CancelForQuotationAsync(db, id, now, reason, ct);
        }
    }
}

public sealed class PublicLinks(IAppDbContext db, TimeProvider clock, IOptions<AppOptions> options)
{
    private readonly AppOptions _app = options.Value;

    /// <summary>Creates an additional access token. Returns the raw token, which is never stored.</summary>
    public (string Token, PublicQuotationAccess Access) Create(Quotation q)
    {
        var token = SecureTokens.Create();
        var now = clock.GetUtcNow();
        var validUntilEnd = new DateTimeOffset(q.ValidUntil.ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero);
        var access = new PublicQuotationAccess
        {
            CompanyId = q.CompanyId,
            QuotationId = q.Id,
            TokenHash = SecureTokens.Hash(token),
            CreatedAt = now,
            ExpiresAt = validUntilEnd.AddDays(_app.PublicLinkGraceDays),
        };
        db.PublicQuotationAccesses.Add(access);
        return (token, access);
    }

    public Task<int> RevokeAllAsync(Guid quotationId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return db.PublicQuotationAccesses.IgnoreQueryFilters().Where(a => a.QuotationId == quotationId && a.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.RevokedAt, now), ct);
    }

    public string Url(string token) => _app.PublicQuotationUrl(token);

    public string OptOutUrl(string token) => _app.PublicQuotationUrl(token) + "?abmelden=1";
}

public sealed class QuotationPdfFactory(IAppDbContext db, FileService files, IQuotationPdfRenderer renderer)
{
    public async Task<byte[]> RenderAsync(Quotation q, string? publicUrl, bool draftPreview, CancellationToken ct)
    {
        var company = await db.Companies.AsNoTracking().Include(c => c.Settings).FirstAsync(c => c.Id == q.CompanyId, ct);
        var logo = company.LogoFileId is { } logoId ? await files.ReadAllAsync(company.Id, logoId, ct) : null;
        var s = company.Settings!;
        var model = new PdfQuotation(
            q,
            new PdfCompany(
                company.Name, company.AddressLine1, company.AddressLine2, company.PostalCode, company.City, company.Country, company.Email, company.Phone,
                company.Website, company.VatId, company.TaxNumber, company.BrandColor, logo,
                s.ShowBankDetails ? s.BankAccountHolder ?? company.Name : null, s.ShowBankDetails ? s.Iban : null, s.ShowBankDetails ? s.Bic : null, s.ShowBankDetails ? s.BankName : null),
            publicUrl,
            draftPreview);
        return renderer.Render(model);
    }

    public static string FileName(Quotation q) => $"Angebot_{q.Number}.pdf";
}

public sealed class NotificationService(IAppDbContext db, TimeProvider clock)
{
    /// <summary>Notifies owners/admins and the quotation's sender/creator.</summary>
    public async Task NotifyAsync(Guid companyId, IEnumerable<Guid> extraRecipients, string type, string title, string? body, string? entityType, Guid? entityId, CancellationToken ct)
    {
        var recipients = await db.Memberships.Where(m => m.CompanyId == companyId && m.Status == MembershipStatus.Active && m.Role >= MembershipRole.Admin)
            .Select(m => m.UserId).ToListAsync(ct);
        var activeExtras = await db.Memberships.Where(m => m.CompanyId == companyId && m.Status == MembershipStatus.Active && extraRecipients.Contains(m.UserId))
            .Select(m => m.UserId).ToListAsync(ct);
        var now = clock.GetUtcNow();
        foreach (var userId in recipients.Concat(activeExtras).Distinct())
        {
            db.Notifications.Add(new Notification { CompanyId = companyId, UserId = userId, Type = type, Title = title, Body = body, EntityType = entityType, EntityId = entityId, CreatedAt = now });
        }
    }

    public async Task<PagedResult<NotificationDto>> ListAsync(CurrentMember member, bool unreadOnly, int page, int pageSize, CancellationToken ct)
    {
        var (p, size) = Customers.Paging.Normalize(page, pageSize);
        var q = db.Notifications.AsNoTracking().Where(n => n.UserId == member.UserId);
        if (unreadOnly)
        {
            q = q.Where(n => n.ReadAt == null);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(n => n.CreatedAt).Skip((p - 1) * size).Take(size)
            .Select(n => new NotificationDto(n.Id, n.Type, n.Title, n.Body, n.EntityType, n.EntityId, n.CreatedAt, n.ReadAt != null)).ToListAsync(ct);
        return new PagedResult<NotificationDto>(items, p, size, total);
    }

    public Task<int> UnreadCountAsync(CurrentMember member, CancellationToken ct) =>
        db.Notifications.CountAsync(n => n.UserId == member.UserId && n.ReadAt == null, ct);

    public async Task MarkReadAsync(CurrentMember member, Guid? id, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var q = db.Notifications.Where(n => n.UserId == member.UserId && n.ReadAt == null);
        if (id is not null)
        {
            q = q.Where(n => n.Id == id);
        }

        await q.ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), ct);
    }
}

public static class QuotationMapping
{
    public static LineItemDto ToDto(QuotationLineItem i) => new(
        i.Id, i.Position, i.Title, i.Description, i.Quantity, i.Unit, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent, i.LineTotalBeforeDiscount, i.LineDiscount, i.LineNet);

    public static TotalsDto ToDto(QuotationTotals t) => new(
        t.SubtotalBeforeDiscount, t.DiscountTotal, t.NetTotal, t.TaxGroups.Select(g => new TaxGroupDto(g.RatePercent, g.NetAmount, g.TaxAmount)).ToList(), t.TaxTotal, t.GrossTotal);

    public static QuotationListItemDto ToListItem(Quotation q, string customerName, bool hasJob) => new(
        q.Id, q.Number, q.Title, q.Status, q.CustomerId, customerName, q.IssueDate, q.ValidUntil, q.NetTotal, q.GrossTotal, q.SentAt, q.UpdatedAt, q.RevisionNumber, hasJob);

    public static QuotationLineItem ToEntity(LineItemInput i) => new()
    {
        Title = i.Title.Trim(),
        Description = Text.Clean(i.Description),
        Quantity = i.Quantity,
        Unit = i.Unit.Trim(),
        UnitPriceNet = i.UnitPriceNet,
        DiscountPercent = i.DiscountPercent,
        TaxRatePercent = i.TaxRatePercent,
    };

    public static QuotationLineItem Copy(QuotationLineItem i) => new()
    {
        Title = i.Title,
        Description = i.Description,
        Quantity = i.Quantity,
        Unit = i.Unit,
        UnitPriceNet = i.UnitPriceNet,
        DiscountPercent = i.DiscountPercent,
        TaxRatePercent = i.TaxRatePercent,
    };

    public static void SnapshotRecipient(Quotation q, Domain.Customers.Customer c)
    {
        var withSalutation = string.Join(' ', new[] { c.Salutation, c.FirstName, c.LastName }.Where(s => !string.IsNullOrWhiteSpace(s)));
        if (c.Type == CustomerType.Business && !string.IsNullOrWhiteSpace(c.CompanyName))
        {
            // Business: company as recipient, contact person as "z. Hd." line.
            q.RecipientName = c.CompanyName!;
            q.RecipientContact = string.IsNullOrWhiteSpace(withSalutation) ? null : withSalutation;
        }
        else
        {
            q.RecipientName = string.IsNullOrWhiteSpace(withSalutation) ? c.DisplayName : withSalutation;
            q.RecipientContact = c.ContactPerson;
        }

        q.RecipientAddress = Text.FormatAddress(
            c.BillingStreet,
            string.Join(' ', new[] { c.BillingPostalCode, c.BillingCity }.Where(s => !string.IsNullOrWhiteSpace(s))),
            c.BillingCountry is "DE" or null ? null : c.BillingCountry);
        q.RecipientEmail = c.Email;
        q.RecipientVatId = c.VatId;
    }

    public static IReadOnlyList<QuotationStatus> AllowedActions(Quotation q, bool hasJob)
    {
        var list = QuotationTransitions.AllowedTargets(q.Status).ToList();
        if (q.Status == QuotationStatus.Expired)
        {
            list.Add(QuotationStatus.Accepted);
        }

        return list;
    }
}
