using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Files;
using AngebotPilot.Application.Invoices;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Emails;
using AngebotPilot.Domain.FollowUps;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Domain.Quotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AngebotPilot.Application.Background;

/// <summary>Cross-process mutual exclusion (SQL Server application lock in production).</summary>
public interface IDistributedLock
{
    Task<IAsyncDisposable?> TryAcquireAsync(string name, CancellationToken ct);
}

/// <summary>
/// Executes all scheduled work. Safe to run repeatedly and concurrently: a distributed lock serialises runs,
/// every step is idempotent, and outgoing emails are claimed before sending.
/// It is triggered by the in-process hosted service and by the authenticated external endpoint
/// (needed on hosts that recycle idle applications and offer no scheduled tasks).
/// </summary>
public sealed class JobRunner(
    IAppDbContext db,
    IDistributedLock distributedLock,
    IEmailSender emailSender,
    IFileStorageService storage,
    PublicLinks publicLinks,
    NotificationService notifications,
    IEmailOutbox outbox,
    IAuditLog audit,
    TimeProvider clock,
    ILogger<JobRunner> logger)
{
    private const int EmailBatchSize = 25;
    private static readonly TimeSpan ClaimDuration = TimeSpan.FromMinutes(5);

    public async Task<JobRunResult> RunAllAsync(CancellationToken ct)
    {
        await using var handle = await distributedLock.TryAcquireAsync("angebotpilot-jobs", ct);
        if (handle is null)
        {
            return new JobRunResult(0, 0, 0, 0, 0, 0, 0, SkippedBecauseLocked: true);
        }

        var expired = await ExpireQuotationsAsync(ct);
        var (queued, cancelled) = await ProcessFollowUpsAsync(ct);
        var paymentReminders = await ProcessPaymentRemindersAsync(ct);
        var (handedOff, failed, retrying) = await DispatchEmailsAsync(ct);
        var orphans = await CleanupAsync(ct);
        return new JobRunResult(expired, queued, cancelled, handedOff, failed, retrying, orphans, SkippedBecauseLocked: false, paymentReminders);
    }

    /// <summary>Only dispatches the outbox; used right after a user action queued an email.</summary>
    public async Task<(int HandedOff, int Failed, int Retrying)> DispatchOnlyAsync(CancellationToken ct)
    {
        await using var handle = await distributedLock.TryAcquireAsync("angebotpilot-jobs", ct);
        return handle is null ? (0, 0, 0) : await DispatchEmailsAsync(ct);
    }

    public async Task<int> ExpireQuotationsAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        // Superset by UTC date; the exact check uses each company's time zone.
        var bound = DateOnly.FromDateTime(now.UtcDateTime).AddDays(1);
        var candidates = await db.Quotations.IgnoreQueryFilters()
            .Where(q => q.Status == QuotationStatus.Sent && q.DeletedAt == null && q.ValidUntil < bound)
            .OrderBy(q => q.ValidUntil)
            .Join(db.Companies, q => q.CompanyId, c => c.Id, (q, c) => new { Quotation = q, c.TimeZone })
            .Take(500)
            .ToListAsync(ct);
        var count = 0;
        foreach (var item in candidates)
        {
            var q = item.Quotation;
            if (!q.IsPastValidity(CompanyTime.Today(now, item.TimeZone)))
            {
                continue;
            }

            q.Expire(now);
            q.AddEvent(QuotationEventType.Expired, now, ActorType.System, null);
            await FollowUpCanceller.CancelForQuotationAsync(db, q.Id, now, "Angebot abgelaufen", ct);
            await notifications.NotifyAsync(q.CompanyId, [q.CreatedByUserId], "quotation.expired", $"Angebot {q.Number} ist abgelaufen",
                $"Das Angebot an {q.RecipientName} wurde nicht innerhalb der Gültigkeit beantwortet.", "Quotation", q.Id, ct);
            audit.Record(q.CompanyId, null, "quotation.expired", "Quotation", q.Id, q.Number);
            count++;
        }

        if (count > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        return count;
    }

    public async Task<(int Queued, int Cancelled)> ProcessFollowUpsAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var due = await db.FollowUpSchedules.IgnoreQueryFilters()
            .Where(f => f.Status == FollowUpStatus.Scheduled && f.DueAt <= now)
            .OrderBy(f => f.DueAt).Take(100).ToListAsync(ct);
        int queued = 0, cancelled = 0;
        foreach (var followUp in due)
        {
            var q = await db.Quotations.IgnoreQueryFilters().Include(x => x.LineItems).FirstOrDefaultAsync(x => x.Id == followUp.QuotationId, ct);
            var customer = q is null ? null : await db.Customers.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == q.CustomerId, ct);
            var company = q is null ? null : await db.Companies.Include(c => c.Settings).FirstOrDefaultAsync(c => c.Id == q.CompanyId, ct);
            string? reason = null;
            if (q is null || company is null || customer is null || q.DeletedAt is not null)
            {
                reason = "Angebot nicht mehr vorhanden";
            }
            else if (q.Status != QuotationStatus.Sent || q.IsPastValidity(CompanyTime.Today(now, company.TimeZone)))
            {
                reason = "Angebot nicht mehr offen";
            }
            else if (customer.FollowUpOptOut)
            {
                reason = "Kunde wünscht keine Erinnerungen";
            }
            else if (string.IsNullOrWhiteSpace(q.RecipientEmail))
            {
                reason = "Keine E-Mail-Adresse hinterlegt";
            }

            if (reason is not null)
            {
                followUp.Status = FollowUpStatus.Skipped;
                followUp.ProcessedAt = now;
                followUp.StatusReason = reason;
                cancelled++;
                await db.SaveChangesAsync(ct);
                continue;
            }

            var settings = company!.Settings!;
            var (token, _) = publicLinks.Create(q!);
            var content = EmailTemplates.Reminder(followUp.Kind, q!, company.Name, publicLinks.Url(token), settings.AttachPdfToEmails && q!.SentPdfFileId is not null,
                settings.EmailSignature, publicLinks.OptOutUrl(token), company.BrandColor);
            var sender = q!.SentByUserId is { } sid ? await db.Users.AsNoTracking().Where(u => u.Id == sid).Select(u => u.Email).FirstOrDefaultAsync(ct) : null;
            var delivery = await outbox.EnqueueAsync(new EnqueueEmail(
                q.CompanyId, q.Id, KindFor(followUp.Kind), $"followup:{followUp.Id:N}", q.RecipientEmail!, content,
                settings.ReplyToEmail ?? company.Email ?? sender, company.Name,
                settings.AttachPdfToEmails ? q.SentPdfFileId : null, settings.AttachPdfToEmails && q.SentPdfFileId is not null ? QuotationPdfFactory.FileName(q) : null), ct);
            followUp.Status = FollowUpStatus.Queued;
            followUp.ProcessedAt = now;
            followUp.EmailDeliveryId = delivery?.Id;
            q.AddEvent(QuotationEventType.ReminderQueued, now, ActorType.System, null, FollowUpLabel(followUp.Kind));
            await db.SaveChangesAsync(ct);
            queued++;
        }

        return (queued, cancelled);
    }

    /// <summary>
    /// Sends one automatic payment reminder for overdue invoices that were e-mailed, when the company enabled it.
    /// Manual reminders count too: an invoice that was already reminded is skipped.
    /// </summary>
    public async Task<int> ProcessPaymentRemindersAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var bound = DateOnly.FromDateTime(now.UtcDateTime);
        var candidates = await db.Invoices.IgnoreQueryFilters()
            .Where(i => i.DeletedAt == null && i.Kind == InvoiceKind.Invoice && (i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.PartiallyPaid)
                && i.ReminderCount == 0 && i.SentAt != null && i.RecipientEmail != null && i.DueDate < bound)
            .Join(db.Companies, i => i.CompanyId, c => c.Id, (i, c) => new { Invoice = i, Company = c, Settings = c.Settings! })
            .Where(x => x.Settings.InvoiceReminderEnabled)
            .OrderBy(x => x.Invoice.DueDate)
            .Take(100)
            .ToListAsync(ct);
        var queued = 0;
        foreach (var item in candidates)
        {
            var invoice = item.Invoice;
            var company = item.Company;
            var settings = item.Settings;
            var today = CompanyTime.Today(now, company.TimeZone);
            if (today.DayNumber - invoice.DueDate.DayNumber < settings.InvoiceReminderAfterDays)
            {
                continue;
            }

            var sentBy = await db.EmailDeliveries.AsNoTracking().Where(e => e.InvoiceId == invoice.Id && e.Kind == EmailKind.InvoiceSent)
                .OrderBy(e => e.CreatedAt).Select(e => e.CreatedByUserId).FirstOrDefaultAsync(ct);
            var replyTo = settings.ReplyToEmail ?? company.Email
                ?? (sentBy is { } uid ? await db.Users.AsNoTracking().Where(u => u.Id == uid).Select(u => u.Email).FirstOrDefaultAsync(ct) : null);
            invoice.MarkReminderSent(now);
            await outbox.EnqueueAsync(new EnqueueEmail(
                invoice.CompanyId, null, EmailKind.PaymentReminder, $"invoice-reminder:{invoice.Id:N}:{invoice.ReminderCount}", invoice.RecipientEmail!,
                EmailTemplates.PaymentReminder(invoice, company.Name, null, settings.EmailSignature, company.BrandColor),
                replyTo, company.Name, invoice.PdfFileId, InvoiceDocuments.PdfFileName(invoice), sentBy, invoice.Id), ct);
            invoice.AddEvent(InvoiceEventType.ReminderQueued, now, ActorType.System, null, $"Automatische Zahlungserinnerung an {invoice.RecipientEmail}");
            audit.Record(invoice.CompanyId, null, "invoice.reminder_sent", "Invoice", invoice.Id, $"{invoice.Number} (automatisch)");
            await db.SaveChangesAsync(ct);
            queued++;
        }

        return queued;
    }

    public async Task<(int HandedOff, int Failed, int Retrying)> DispatchEmailsAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var claimUntil = now + ClaimDuration;
        var candidateIds = await db.EmailDeliveries
            .Where(e => (e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled || (e.Status == EmailStatus.Sending && e.LockedUntil < now))
                && e.NextAttemptAt <= now)
            .OrderBy(e => e.NextAttemptAt).Select(e => e.Id).Take(EmailBatchSize).ToListAsync(ct);
        if (candidateIds.Count == 0)
        {
            return (0, 0, 0);
        }

        // Claim: only rows still in a sendable state are taken, so a concurrent dispatcher cannot send them twice.
        await db.EmailDeliveries
            .Where(e => candidateIds.Contains(e.Id) && (e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled || (e.Status == EmailStatus.Sending && e.LockedUntil < now)))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EmailStatus.Sending).SetProperty(e => e.LockedUntil, claimUntil), ct);
        var claimed = await db.EmailDeliveries.Where(e => candidateIds.Contains(e.Id) && e.Status == EmailStatus.Sending && e.LockedUntil == claimUntil).ToListAsync(ct);

        int handedOff = 0, failed = 0, retrying = 0;
        foreach (var delivery in claimed)
        {
            var attachments = new List<EmailAttachment>();
            if (delivery.AttachmentFileId is { } fileId && delivery.CompanyId is { } companyId)
            {
                var bytes = await ReadFileAsync(companyId, fileId, ct);
                if (bytes is not null)
                {
                    attachments.Add(new EmailAttachment(delivery.AttachmentFileName ?? (delivery.InvoiceId is null ? "Angebot.pdf" : "Rechnung.pdf"), "application/pdf", bytes));
                }
            }

            EmailSendResult result;
            try
            {
                result = await emailSender.SendAsync(new OutgoingEmail(delivery.ToAddress, delivery.Subject, delivery.BodyText, delivery.BodyHtml,
                    delivery.ReplyToAddress, delivery.FromDisplayName, attachments, delivery.IdempotencyKey), ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                result = new EmailSendResult(EmailSendOutcome.TemporaryFailure, null, ex.GetType().Name);
            }

            var attemptAt = clock.GetUtcNow();
            delivery.Attempts++;
            delivery.LockedUntil = null;
            Quotation? quotation = delivery.QuotationId is { } qid ? await db.Quotations.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == qid, ct) : null;
            Invoice? invoice = delivery.InvoiceId is { } iid ? await db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == iid, ct) : null;
            switch (result.Outcome)
            {
                case EmailSendOutcome.HandedOff:
                    delivery.Status = EmailStatus.HandedOff;
                    delivery.HandedOffAt = attemptAt;
                    delivery.ProviderMessageId = result.ProviderMessageId;
                    delivery.LastError = null;
                    Scrub(delivery);
                    if (delivery.Kind is not EmailKind.DecisionNotification)
                    {
                        quotation?.AddEvent(QuotationEventType.EmailHandedOff, attemptAt, ActorType.System, null, $"{KindLabel(delivery.Kind)} an {delivery.ToAddress}");
                    }

                    invoice?.AddEvent(InvoiceEventType.EmailHandedOff, attemptAt, ActorType.System, null, $"{KindLabel(delivery.Kind)} an {delivery.ToAddress}");

                    handedOff++;
                    break;
                case EmailSendOutcome.TemporaryFailure when delivery.Attempts < EmailDelivery.MaxAttempts:
                    delivery.Status = EmailStatus.RetryScheduled;
                    delivery.NextAttemptAt = attemptAt + EmailDelivery.RetryDelay(delivery.Attempts);
                    delivery.LastError = Truncate(result.Error);
                    retrying++;
                    break;
                default:
                    delivery.Status = EmailStatus.Failed;
                    delivery.LastError = Truncate(result.Error);
                    Scrub(delivery);
                    if (quotation is not null)
                    {
                        quotation.AddEvent(QuotationEventType.EmailFailed, attemptAt, ActorType.System, null, $"{KindLabel(delivery.Kind)} an {delivery.ToAddress}");
                        if ((delivery.CreatedByUserId ?? quotation.SentByUserId) is { } notifyUser)
                        {
                            await notifications.NotifyAsync(quotation.CompanyId, [notifyUser], "email.failed",
                                $"E-Mail zu Angebot {quotation.Number} konnte nicht versendet werden", delivery.LastError, "Quotation", quotation.Id, ct);
                        }
                    }

                    if (invoice is not null)
                    {
                        invoice.AddEvent(InvoiceEventType.EmailFailed, attemptAt, ActorType.System, null, $"{KindLabel(delivery.Kind)} an {delivery.ToAddress}");
                        if ((delivery.CreatedByUserId ?? invoice.IssuedByUserId) is { } notifyInvoiceUser)
                        {
                            await notifications.NotifyAsync(invoice.CompanyId, [notifyInvoiceUser], "email.failed",
                                $"E-Mail zu Rechnung {invoice.Number} konnte nicht versendet werden", delivery.LastError, "Invoice", invoice.Id, ct);
                        }
                    }

                    failed++;
                    logger.LogWarning("Email {DeliveryId} ({Kind}) failed permanently after {Attempts} attempts", delivery.Id, delivery.Kind, delivery.Attempts);
                    break;
            }

            await db.SaveChangesAsync(ct);
        }

        return (handedOff, failed, retrying);
    }

    public async Task<int> CleanupAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var stale = await db.Files.IgnoreQueryFilters()
            .Where(f => f.Status == FileStatus.Pending && f.CreatedAt < now.AddHours(-1))
            .OrderBy(f => f.CreatedAt)
            .Take(100).ToListAsync(ct);
        foreach (var file in stale)
        {
            await storage.DeleteAsync(file.ObjectKey, ct);
            file.Status = FileStatus.Deleted;
            file.DeletedAt = now;
        }

        // Objects without (active) metadata, e.g. left behind when a database write failed after an upload.
        var orphanObjects = 0;
        var keys = new List<string>();
        await foreach (var key in storage.ListAsync("companies/", ct))
        {
            keys.Add(key);
            if (keys.Count >= 1000)
            {
                break;
            }
        }

        if (keys.Count > 0)
        {
            var known = await db.Files.IgnoreQueryFilters().Where(f => keys.Contains(f.ObjectKey) && f.Status != FileStatus.Deleted).Select(f => f.ObjectKey).ToListAsync(ct);
            foreach (var key in keys.Except(known))
            {
                await storage.DeleteAsync(key, ct);
                orphanObjects++;
            }
        }

        await db.RefreshTokens.Where(t => t.ExpiresAt < now.AddDays(-30)).ExecuteDeleteAsync(ct);
        await db.UserTokens.Where(t => t.ExpiresAt < now.AddDays(-30)).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
        return stale.Count + orphanObjects;
    }

    private async Task<byte[]?> ReadFileAsync(Guid companyId, Guid fileId, CancellationToken ct)
    {
        var key = await db.Files.IgnoreQueryFilters().Where(f => f.Id == fileId && f.CompanyId == companyId && f.Status == FileStatus.Active).Select(f => f.ObjectKey).FirstOrDefaultAsync(ct);
        if (key is null)
        {
            return null;
        }

        var obj = await storage.GetAsync(key, ct);
        if (obj is null)
        {
            return null;
        }

        await using var stream = obj.Content;
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, ct);
        return ms.ToArray();
    }

    private static EmailKind KindFor(FollowUpKind kind) => kind switch
    {
        FollowUpKind.SecondReminder => EmailKind.SecondReminder,
        FollowUpKind.ExpiryReminder => EmailKind.ExpiryReminder,
        _ => EmailKind.FirstReminder,
    };

    private static string FollowUpLabel(FollowUpKind kind) => kind switch
    {
        FollowUpKind.SecondReminder => "2. Erinnerung",
        FollowUpKind.ExpiryReminder => "Erinnerung vor Ablauf",
        _ => "1. Erinnerung",
    };

    private static string KindLabel(EmailKind kind) => kind switch
    {
        EmailKind.QuotationSent => "Angebots-E-Mail",
        EmailKind.FirstReminder => "1. Erinnerung",
        EmailKind.SecondReminder => "2. Erinnerung",
        EmailKind.ExpiryReminder => "Erinnerung vor Ablauf",
        EmailKind.InvoiceSent => "Rechnungs-E-Mail",
        EmailKind.PaymentReminder => "Zahlungserinnerung",
        _ => "E-Mail",
    };

    /// <summary>
    /// Once an email reached a final state its body is no longer needed. Bodies can contain one-time links
    /// (password reset, invitation, customer link) whose tokens are otherwise only stored as hashes.
    /// </summary>
    private static void Scrub(EmailDelivery delivery)
    {
        delivery.BodyText = "[Inhalt nach dem Versand entfernt]";
        delivery.BodyHtml = null;
    }

    private static string? Truncate(string? value) => value is { Length: > 300 } ? value[..300] : value;
}
