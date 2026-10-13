using AngebotPilot.Application.Abstractions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Emails;

namespace AngebotPilot.Application.Emails;

/// <summary>Wakes the in-process dispatcher so queued emails are attempted promptly (best effort; the persistent outbox is the source of truth).</summary>
public interface IEmailDispatchSignal
{
    void Notify();
}

public sealed record EnqueueEmail(
    Guid? CompanyId,
    Guid? QuotationId,
    EmailKind Kind,
    string IdempotencyKey,
    string To,
    ComposedEmail Content,
    string? ReplyTo = null,
    string? FromDisplayName = null,
    Guid? AttachmentFileId = null,
    string? AttachmentFileName = null,
    Guid? CreatedByUserId = null,
    Guid? InvoiceId = null);

public interface IEmailOutbox
{
    /// <summary>Adds an email to the outbox in the current unit of work. Returns null if an email with the same idempotency key already exists.</summary>
    Task<EmailDelivery?> EnqueueAsync(EnqueueEmail email, CancellationToken cancellationToken);
}

public sealed class EmailOutbox(IAppDbContext db, TimeProvider clock) : IEmailOutbox
{
    public async Task<EmailDelivery?> EnqueueAsync(EnqueueEmail email, CancellationToken cancellationToken)
    {
        var exists = db.EmailDeliveries.Local.Any(e => e.IdempotencyKey == email.IdempotencyKey)
            || await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.AnyAsync(
                db.EmailDeliveries, e => e.IdempotencyKey == email.IdempotencyKey, cancellationToken);
        if (exists)
        {
            return null;
        }

        var now = clock.GetUtcNow();
        var delivery = new EmailDelivery
        {
            CompanyId = email.CompanyId,
            QuotationId = email.QuotationId,
            InvoiceId = email.InvoiceId,
            Kind = email.Kind,
            IdempotencyKey = email.IdempotencyKey,
            ToAddress = email.To.Trim(),
            ReplyToAddress = email.ReplyTo,
            FromDisplayName = email.FromDisplayName,
            Subject = email.Content.Subject,
            BodyText = email.Content.BodyText,
            BodyHtml = email.Content.BodyHtml,
            AttachmentFileId = email.AttachmentFileId,
            AttachmentFileName = email.AttachmentFileName,
            Status = EmailStatus.Pending,
            CreatedAt = now,
            NextAttemptAt = now,
            CreatedByUserId = email.CreatedByUserId,
        };
        db.EmailDeliveries.Add(delivery);
        return delivery;
    }
}
