using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Files;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AngebotPilot.Application.Public;

/// <summary>
/// Unauthenticated customer access via an unguessable token. Only data intended for the recipient is returned;
/// every query explicitly targets the quotation behind the token (tenant filters are bypassed deliberately).
/// </summary>
public sealed class PublicQuotationService(
    IAppDbContext db,
    FileService files,
    QuotationPdfFactory pdfFactory,
    NotificationService notifications,
    IEmailOutbox outbox,
    IEmailDispatchSignal dispatchSignal,
    IAuditLog audit,
    TimeProvider clock,
    IOptions<AppOptions> appOptions)
{
    private static readonly TimeSpan OpenRecordInterval = TimeSpan.FromMinutes(10);
    private readonly AppOptions _app = appOptions.Value;

    public async Task<PublicQuotationDto> GetAsync(string token, CancellationToken ct)
    {
        var (access, q) = await ResolveAsync(token, tracking: true, ct);
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == q.CompanyId, ct);
        var customer = await db.Customers.IgnoreQueryFilters().AsNoTracking().FirstAsync(c => c.Id == q.CustomerId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);

        await ExpireIfDueAsync(q, now, today, ct);

        // Opening the page is recorded (disclosed on the page). Throttled to avoid a write per refresh.
        if (access.LastOpenedAt is null || now - access.LastOpenedAt > OpenRecordInterval)
        {
            if (access.FirstOpenedAt is null)
            {
                access.FirstOpenedAt = now;
                q.AddEvent(QuotationEventType.PublicLinkOpened, now, ActorType.Customer, null);
            }

            access.LastOpenedAt = now;
            access.OpenCount++;
        }

        await db.SaveChangesAsync(ct);
        return new PublicQuotationDto(
            q.Number, q.Title, q.Status, q.IssueDate, q.ValidUntil, q.Status == QuotationStatus.Sent && !q.IsPastValidity(today), q.IsPastValidity(today),
            company.Name, Text.CompanyAddress(company), company.Email, company.Phone, company.BrandColor, company.LogoFileId is not null,
            q.RecipientName, q.RecipientAddress, q.TaxMode, q.IntroText, q.ClosingText, q.Terms, q.PaymentTerms,
            q.LineItems.OrderBy(i => i.Position).Select(i => new PublicLineItemDto(i.Position, i.Title, i.Description, i.Quantity, i.Unit, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent, i.LineNet)).ToList(),
            QuotationMapping.ToDto(q.CalculateTotals()),
            q.Status is QuotationStatus.Accepted or QuotationStatus.Rejected ? q.DecidedAt : null,
            q.DecidedByActor == ActorType.Customer ? q.DecisionName : null,
            customer.FollowUpOptOut);
    }

    public async Task<PublicDecisionResponse> DecideAsync(string token, bool accept, string? fullName, string? note, CancellationToken ct)
    {
        var (_, q) = await ResolveAsync(token, tracking: true, ct);
        var company = await db.Companies.AsNoTracking().Include(c => c.Settings).FirstAsync(c => c.Id == q.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        if (await ExpireIfDueAsync(q, now, today, ct))
        {
            await db.SaveChangesAsync(ct);
            throw new ConflictException("quotation_expired", "Dieses Angebot ist abgelaufen und kann nicht mehr angenommen werden. Bitte wenden Sie sich an den Anbieter.");
        }

        if (q.Status != QuotationStatus.Sent)
        {
            throw new ConflictException("already_decided", q.Status switch
            {
                QuotationStatus.Accepted => "Dieses Angebot wurde bereits angenommen.",
                QuotationStatus.Rejected => "Dieses Angebot wurde bereits abgelehnt.",
                _ => "Zu diesem Angebot ist keine Entscheidung mehr möglich.",
            });
        }

        var name = Text.Clean(fullName);
        var cleanNote = Text.Clean(note);
        if (accept)
        {
            q.Accept(now, ActorType.Customer, null, name, cleanNote, today);
        }
        else
        {
            q.Reject(now, ActorType.Customer, null, name, cleanNote);
        }

        q.AddEvent(accept ? QuotationEventType.Accepted : QuotationEventType.Rejected, now, ActorType.Customer, null,
            $"Über den Kundenlink{(name is null ? string.Empty : $" von {name}")}");
        var cancelled = await FollowUpCanceller.CancelForQuotationAsync(db, q.Id, now, accept ? "Angebot angenommen" : "Angebot abgelehnt", ct);
        if (cancelled > 0)
        {
            q.AddEvent(QuotationEventType.FollowUpsCancelled, now, ActorType.System, null, accept ? "Angebot angenommen" : "Angebot abgelehnt");
        }

        var verb = accept ? "angenommen" : "abgelehnt";
        var recipients = new[] { q.CreatedByUserId }.Concat(q.SentByUserId is { } s ? [s] : []).ToList();
        await notifications.NotifyAsync(q.CompanyId, recipients, accept ? "quotation.accepted" : "quotation.rejected",
            $"Angebot {q.Number} wurde {verb}", $"{q.RecipientName} hat das Angebot „{q.Title}“ {verb}.", "Quotation", q.Id, ct);

        if (company.Settings!.NotifyOnCustomerDecision && q.SentByUserId is { } senderId)
        {
            var senderEmail = await db.Users.Where(u => u.Id == senderId).Select(u => u.Email).FirstOrDefaultAsync(ct);
            if (senderEmail is not null)
            {
                var content = EmailTemplates.DecisionNotification(q, accept, name, cleanNote, _app.WebUrl($"angebote/{q.Id}"), _app.ProductName);
                await outbox.EnqueueAsync(new EnqueueEmail(q.CompanyId, q.Id, EmailKind.DecisionNotification, $"decision:{q.Id:N}", senderEmail, content), ct);
            }
        }

        audit.Record(q.CompanyId, null, accept ? "quotation.accepted_by_customer" : "quotation.rejected_by_customer", "Quotation", q.Id, q.Number);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two decisions raced (row version or the notification's idempotency key); the first one wins.
            throw new ConflictException("already_decided", "Zu diesem Angebot wurde soeben bereits eine Entscheidung erfasst.");
        }

        dispatchSignal.Notify();
        return new PublicDecisionResponse(q.Status, now, q.Number, company.Name);
    }

    public async Task OptOutAsync(string token, CancellationToken ct)
    {
        var (_, q) = await ResolveAsync(token, tracking: true, ct);
        var customer = await db.Customers.IgnoreQueryFilters().FirstAsync(c => c.Id == q.CustomerId, ct);
        var now = clock.GetUtcNow();
        if (!customer.FollowUpOptOut)
        {
            customer.FollowUpOptOut = true;
            customer.FollowUpOptOutAt = now;
            customer.UpdatedAt = now;
            q.AddEvent(QuotationEventType.CustomerOptedOut, now, ActorType.Customer, null);
            audit.Record(q.CompanyId, null, "customer.opted_out", "Customer", customer.Id, null);
        }

        await FollowUpCanceller.CancelForCustomerAsync(db, customer.Id, now, "Kunde hat Erinnerungen abbestellt", ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<(byte[] Content, string FileName)> PdfAsync(string token, CancellationToken ct)
    {
        var (_, q) = await ResolveAsync(token, tracking: false, ct);
        if (q.SentPdfFileId is { } fileId && await files.ReadAllAsync(q.CompanyId, fileId, ct) is { } stored)
        {
            return (stored, QuotationPdfFactory.FileName(q));
        }

        return (await pdfFactory.RenderAsync(q, null, draftPreview: false, ct), QuotationPdfFactory.FileName(q));
    }

    public async Task<(Stream Content, string ContentType)?> LogoAsync(string token, CancellationToken ct)
    {
        var (_, q) = await ResolveAsync(token, tracking: false, ct);
        var logoId = await db.Companies.AsNoTracking().Where(c => c.Id == q.CompanyId).Select(c => c.LogoFileId).FirstOrDefaultAsync(ct);
        if (logoId is null)
        {
            return null;
        }

        var opened = await files.OpenAsync(q.CompanyId, logoId.Value, ct);
        return opened is null ? null : (opened.Value.Content.Content, opened.Value.File.ContentType);
    }

    private async Task<bool> ExpireIfDueAsync(Quotation q, DateTimeOffset now, DateOnly today, CancellationToken ct)
    {
        if (q.Status != QuotationStatus.Sent || !q.IsPastValidity(today))
        {
            return false;
        }

        q.Expire(now);
        q.AddEvent(QuotationEventType.Expired, now, ActorType.System, null);
        await FollowUpCanceller.CancelForQuotationAsync(db, q.Id, now, "Angebot abgelaufen", ct);
        return true;
    }

    private async Task<(PublicQuotationAccess Access, Quotation Quotation)> ResolveAsync(string token, bool tracking, CancellationToken ct)
    {
        if (!SecureTokens.LooksValid(token))
        {
            throw new NotFoundException("Dieser Link ist ungültig.");
        }

        var hash = SecureTokens.Hash(token);
        var query = db.PublicQuotationAccesses.IgnoreQueryFilters().Where(a => a.TokenHash == hash);
        var access = await (tracking ? query : query.AsNoTracking()).FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Dieser Link ist ungültig.");
        if (!access.IsUsable(clock.GetUtcNow()))
        {
            throw new GoneException("Dieser Link ist abgelaufen oder wurde vom Anbieter widerrufen. Bitte wenden Sie sich an den Anbieter.");
        }

        var qQuery = db.Quotations.IgnoreQueryFilters().Include(x => x.LineItems).Where(x => x.Id == access.QuotationId && x.DeletedAt == null);
        var quotation = await (tracking ? qQuery : qQuery.AsNoTracking()).FirstOrDefaultAsync(ct)
            ?? throw new GoneException("Dieses Angebot ist nicht mehr verfügbar.");
        if (quotation.Status == QuotationStatus.Draft)
        {
            throw new GoneException("Dieses Angebot ist nicht mehr verfügbar.");
        }

        return (access, quotation);
    }
}
