using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Customers;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Files;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.Customers;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Domain.Quotations;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Invoices;

public sealed record InvoiceListQuery(
    string? Search,
    IReadOnlyList<InvoiceStatus>? Statuses,
    bool Overdue,
    Guid? CustomerId,
    DateOnly? From,
    DateOnly? To,
    string? Sort,
    int Page = 1,
    int PageSize = 25);

/// <summary>
/// Invoices (Rechnungen). Any member can prepare drafts; issuing, sending, payments, reminders and cancellations are
/// financial actions reserved for owners and admins. Issued invoices are immutable (GoBD): corrections are made with a
/// cancellation invoice (Stornorechnung) and a new invoice.
/// </summary>
public sealed class InvoiceService(
    IAppDbContext db,
    BillingService billing,
    DocumentNumbering numbering,
    InvoiceDocuments documents,
    FileService files,
    IEmailOutbox outbox,
    IEmailDispatchSignal dispatchSignal,
    IAuditLog audit,
    TimeProvider clock)
{
    private const string AdminOnly = "Rechnungen stellen, versenden, Zahlungen erfassen und stornieren dürfen nur Inhaber:innen und Admins.";

    // ---------- Queries ----------
    public async Task<PagedResult<InvoiceListItemDto>> ListAsync(CurrentMember member, InvoiceListQuery query, CancellationToken ct)
    {
        var today = await TodayAsync(member.CompanyId, ct);
        var (page, size) = Paging.Normalize(query.Page, query.PageSize);
        var q = Filter(db.Invoices.AsNoTracking(), query, today);
        q = query.Sort switch
        {
            "number" => q.OrderBy(x => x.Number),
            "-number" => q.OrderByDescending(x => x.Number),
            "issueDate" => q.OrderBy(x => x.IssueDate).ThenBy(x => x.Number),
            "-issueDate" => q.OrderByDescending(x => x.IssueDate).ThenByDescending(x => x.Number),
            "dueDate" => q.OrderBy(x => x.DueDate),
            "-dueDate" => q.OrderByDescending(x => x.DueDate),
            "grossTotal" => q.OrderBy(x => x.GrossTotal),
            "-grossTotal" => q.OrderByDescending(x => x.GrossTotal),
            _ => q.OrderByDescending(x => x.UpdatedAt),
        };
        var total = await q.CountAsync(ct);
        var items = await Project(q.Skip((page - 1) * size).Take(size), today).ToListAsync(ct);
        return new PagedResult<InvoiceListItemDto>(items, page, size, total);
    }

    public async Task<IReadOnlyList<InvoiceListItemDto>> ForCustomerAsync(CurrentMember member, Guid customerId, CancellationToken ct)
    {
        var today = await TodayAsync(member.CompanyId, ct);
        return await Project(db.Invoices.AsNoTracking().Where(i => i.CustomerId == customerId).OrderByDescending(i => i.IssueDate).ThenByDescending(i => i.Number), today).ToListAsync(ct);
    }

    public async Task<InvoiceDto> GetAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices.AsNoTracking().Include(x => x.LineItems).Include(x => x.Payments).Include(x => x.Customer)
            .FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw NotFound();
        return await ToDtoAsync(member, invoice, ct);
    }

    public async Task<IReadOnlyList<InvoiceEventDto>> EventsAsync(Guid id, CancellationToken ct)
    {
        await EnsureExistsAsync(id, ct);
        var events = await db.InvoiceEvents.AsNoTracking().Where(e => e.InvoiceId == id).OrderByDescending(e => e.OccurredAt).ToListAsync(ct);
        var userIds = events.Where(e => e.ActorUserId != null).Select(e => e.ActorUserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        return events.Select(e => new InvoiceEventDto(e.Id, e.Type, e.OccurredAt, e.ActorType,
            e.ActorType switch
            {
                ActorType.Customer => "Kunde",
                ActorType.System => "System",
                _ => e.ActorUserId is { } uid ? names.GetValueOrDefault(uid, "Gelöschter Benutzer") : null,
            },
            e.Details)).ToList();
    }

    public async Task<IReadOnlyList<EmailDeliveryDto>> DeliveriesAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        await EnsureExistsAsync(id, ct);
        return await db.EmailDeliveries.AsNoTracking().Where(e => e.InvoiceId == id && e.CompanyId == member.CompanyId)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new EmailDeliveryDto(e.Id, e.Kind, e.ToAddress, e.Subject, e.Status, e.Attempts, e.CreatedAt, e.HandedOffAt,
                e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled ? e.NextAttemptAt : null, e.LastError))
            .ToListAsync(ct);
    }

    // ---------- Drafts ----------
    public async Task<InvoiceDto> CreateAsync(CurrentMember member, CreateInvoiceRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId, ct) ?? throw NotFoundCustomer();
        if (customer.ArchivedAt is not null)
        {
            throw new ConflictException("customer_archived", "Für archivierte Kunden können keine neuen Rechnungen erstellt werden.");
        }

        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var issueDate = request.IssueDate ?? today;
        var invoice = NewDraft(member, customer, settings, now, issueDate);
        invoice.Title = Text.Clean(request.Title) ?? "Rechnung";
        invoice.ServiceDateFrom = request.ServiceDateFrom ?? issueDate;
        invoice.ServiceDateTo = request.ServiceDateTo;
        invoice.DueDate = request.DueDate ?? issueDate.AddDays(settings.InvoicePaymentDays);
        invoice.TaxMode = request.TaxMode ?? settings.DefaultTaxMode;
        invoice.IntroText = request.IntroText is null ? settings.InvoiceIntroText : Text.Clean(request.IntroText);
        invoice.ClosingText = request.ClosingText is null ? settings.InvoiceClosingText : Text.Clean(request.ClosingText);
        invoice.PaymentTerms = Text.Clean(request.PaymentTerms);
        invoice.BuyerReference = Text.Clean(request.BuyerReference);
        invoice.InternalNotes = Text.Clean(request.InternalNotes);
        invoice.ReplaceLineItems((request.LineItems ?? []).Select(ToEntity));
        invoice.AddEvent(InvoiceEventType.Created, now, ActorType.User, member.UserId);
        db.Invoices.Add(invoice);
        audit.Record(member.CompanyId, member.UserId, "invoice.created", "Invoice", invoice.Id, $"{invoice.Title} für {invoice.RecipientName}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    /// <summary>Creates a draft from a job: customer, title and line items come from the job's accepted quotation.</summary>
    public async Task<InvoiceDto> CreateFromJobAsync(CurrentMember member, Guid jobId, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var job = await db.Jobs.FirstOrDefaultAsync(j => j.Id == jobId, ct) ?? throw new NotFoundException("Der Auftrag wurde nicht gefunden.");
        var quotation = await db.Quotations.Include(q => q.LineItems).FirstOrDefaultAsync(q => q.Id == job.QuotationId, ct)
            ?? throw new NotFoundException("Das Angebot zum Auftrag wurde nicht gefunden.");
        var (company, _) = await CompanyAsync(member.CompanyId, ct);
        var serviceDate = job.CompletedAt is { } completed ? CompanyTime.Today(completed, company.TimeZone) : (DateOnly?)null;
        var invoice = await FromQuotationAsync(member, quotation, job.Title, serviceDate, ct);
        invoice.JobId = job.Id;
        invoice.JobNumber = job.Number;
        invoice.AddEvent(InvoiceEventType.Created, invoice.CreatedAt, ActorType.User, member.UserId, $"Aus Auftrag {job.Number}");
        db.Invoices.Add(invoice);
        audit.Record(member.CompanyId, member.UserId, "invoice.created", "Invoice", invoice.Id, $"aus Auftrag {job.Number}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    public async Task<InvoiceDto> CreateFromQuotationAsync(CurrentMember member, Guid quotationId, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var quotation = await db.Quotations.Include(q => q.LineItems).FirstOrDefaultAsync(q => q.Id == quotationId, ct)
            ?? throw new NotFoundException("Das Angebot wurde nicht gefunden.");
        if (quotation.Status != QuotationStatus.Accepted)
        {
            throw new ConflictException("quotation_not_accepted", "Nur angenommene Angebote können abgerechnet werden.");
        }

        var job = await db.Jobs.AsNoTracking().Where(j => j.QuotationId == quotation.Id).Select(j => new { j.Id, j.Number }).FirstOrDefaultAsync(ct);
        var invoice = await FromQuotationAsync(member, quotation, quotation.Title, null, ct);
        invoice.JobId = job?.Id;
        invoice.JobNumber = job?.Number;
        invoice.AddEvent(InvoiceEventType.Created, invoice.CreatedAt, ActorType.User, member.UserId, $"Aus Angebot {quotation.Number}");
        db.Invoices.Add(invoice);
        audit.Record(member.CompanyId, member.UserId, "invoice.created", "Invoice", invoice.Id, $"aus Angebot {quotation.Number}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    public async Task<InvoiceDto> UpdateAsync(CurrentMember member, Guid id, UpdateInvoiceRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var invoice = await LoadAsync(id, ct);
        invoice.EnsureEditable();
        db.SetOriginalRowVersion(invoice, RowVersions.Decode(request.RowVersion));
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId, ct) ?? throw NotFoundCustomer();
        var now = clock.GetUtcNow();
        invoice.CustomerId = customer.Id;
        invoice.Title = request.Title.Trim();
        invoice.IssueDate = request.IssueDate;
        invoice.ServiceDateFrom = request.ServiceDateFrom;
        invoice.ServiceDateTo = request.ServiceDateTo;
        invoice.DueDate = request.DueDate;
        invoice.TaxMode = request.TaxMode;
        invoice.IntroText = Text.Clean(request.IntroText);
        invoice.ClosingText = Text.Clean(request.ClosingText);
        invoice.PaymentTerms = Text.Clean(request.PaymentTerms);
        invoice.BuyerReference = Text.Clean(request.BuyerReference);
        invoice.InternalNotes = Text.Clean(request.InternalNotes);
        invoice.UpdatedAt = now;
        SnapshotRecipient(invoice, customer);
        db.InvoiceLineItems.RemoveRange(invoice.LineItems);
        invoice.ReplaceLineItems(request.LineItems.Select(ToEntity));
        invoice.AddEvent(InvoiceEventType.Updated, now, ActorType.User, member.UserId);
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    public async Task DeleteDraftAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var invoice = await LoadAsync(id, ct);
        if (!invoice.IsDraft)
        {
            throw new ConflictException("invoice_not_deletable", "Gestellte Rechnungen können nicht gelöscht werden. Stornieren Sie die Rechnung stattdessen.");
        }

        invoice.DeletedAt = clock.GetUtcNow();
        audit.Record(member.CompanyId, member.UserId, "invoice.deleted", "Invoice", invoice.Id, invoice.Title);
        await db.SaveChangesAsync(ct);
    }

    public async Task<InvoiceDto> DuplicateAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var source = await LoadAsync(id, ct);
        if (source.IsCancellation)
        {
            throw new ConflictException("invoice_not_duplicable", "Stornorechnungen können nicht kopiert werden.");
        }

        var customer = await db.Customers.FirstAsync(c => c.Id == source.CustomerId, ct);
        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var copy = NewDraft(member, customer, settings, now, today);
        if (customer.AnonymizedAt is not null)
        {
            CopyRecipient(source, copy);
        }

        copy.Title = source.Title;
        copy.ServiceDateFrom = today;
        copy.DueDate = today.AddDays(settings.InvoicePaymentDays);
        copy.TaxMode = source.TaxMode;
        copy.IntroText = source.IntroText;
        copy.ClosingText = source.ClosingText;
        copy.PaymentTerms = source.PaymentTerms;
        copy.BuyerReference = source.BuyerReference;
        copy.InternalNotes = source.InternalNotes;
        copy.ReplaceLineItems(source.LineItems.OrderBy(i => i.Position).Select(Copy));
        var label = source.Number ?? "Entwurf";
        copy.AddEvent(InvoiceEventType.Created, now, ActorType.User, member.UserId, $"Kopie von {label}");
        source.AddEvent(InvoiceEventType.Duplicated, now, ActorType.User, member.UserId, "Als neuer Entwurf kopiert");
        db.Invoices.Add(copy);
        audit.Record(member.CompanyId, member.UserId, "invoice.created", "Invoice", copy.Id, $"Kopie von {label}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, copy.Id, ct);
    }

    // ---------- Issuing ----------

    /// <summary>
    /// Finalises a draft: assigns the next gap-free number, renders the PDF with the embedded e-invoice and stores both.
    /// Number, documents and status are committed in one transaction, so a failure never consumes a number.
    /// </summary>
    public async Task<InvoiceDto> IssueAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin, AdminOnly);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var invoice = await LoadAsync(id, ct);
        invoice.EnsureEditable();
        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);

        // Refresh the recipient from the customer record one last time; afterwards it is frozen.
        var customer = await db.Customers.FirstAsync(c => c.Id == invoice.CustomerId, ct);
        if (customer.AnonymizedAt is null)
        {
            SnapshotRecipient(invoice, customer);
        }

        var problems = InvoiceDocuments.CompanyProblems(company, invoice.TaxMode).Concat(invoice.IssueProblems(today)).ToList();
        if (problems.Count > 0)
        {
            throw new ConflictException("invoice_incomplete", "Die Rechnung kann noch nicht gestellt werden: " + string.Join(" ", problems));
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var number = await numbering.NextAsync(member.CompanyId, DocumentSequenceKind.Invoice, settings.InvoicePrefix, invoice.IssueDate.Year, ct);
        invoice.Issue(number, now, member.UserId, today);
        await StoreDocumentsAsync(member, invoice, now, ct);
        invoice.AddEvent(InvoiceEventType.Issued, now, ActorType.User, member.UserId, number);
        audit.Record(member.CompanyId, member.UserId, "invoice.issued", "Invoice", invoice.Id, $"{number} · {EmailTemplates.Eur(invoice.GrossTotal)}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    public async Task<SendInvoiceResponse> SendAsync(CurrentMember member, Guid id, SendInvoiceRequest request, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin, AdminOnly);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var invoice = await LoadAsync(id, ct);
        var now = clock.GetUtcNow();
        invoice.MarkSent(now);
        Guid? deliveryId = null;
        if (request.Mode == SendMode.Email)
        {
            var (company, settings) = await CompanyAsync(member.CompanyId, ct);
            var sender = await RequireVerifiedSenderAsync(member, ct);
            var recipient = RecipientOrThrow(request.RecipientEmail, invoice);
            await billing.EnsureEmailQuotaAsync(member.CompanyId, ct);
            var content = EmailTemplates.InvoiceSent(invoice, company.Name, Text.Clean(request.Subject), Text.Clean(request.Message), settings.EmailSignature, company.BrandColor);
            var sendNumber = await db.EmailDeliveries.CountAsync(e => e.InvoiceId == invoice.Id && e.Kind == EmailKind.InvoiceSent, ct) + 1;
            var delivery = await outbox.EnqueueAsync(new EnqueueEmail(
                member.CompanyId, null, EmailKind.InvoiceSent, $"invoice-send:{invoice.Id:N}:{sendNumber}", recipient, content,
                settings.ReplyToEmail ?? company.Email ?? sender, company.Name, invoice.PdfFileId, InvoiceDocuments.PdfFileName(invoice), member.UserId, invoice.Id), ct);
            deliveryId = delivery?.Id;
            invoice.AddEvent(InvoiceEventType.Sent, now, ActorType.User, member.UserId, $"An {recipient}");
            audit.Record(member.CompanyId, member.UserId, "invoice.sent", "Invoice", invoice.Id, invoice.Number);
        }
        else
        {
            invoice.AddEvent(InvoiceEventType.MarkedAsSent, now, ActorType.User, member.UserId, "Ohne E-Mail übermittelt (z. B. per Post)");
            audit.Record(member.CompanyId, member.UserId, "invoice.marked_sent", "Invoice", invoice.Id, invoice.Number);
        }

        await db.SaveChangesAsync(ct);
        dispatchSignal.Notify();
        return new SendInvoiceResponse(await GetAsync(member, invoice.Id, ct), deliveryId);
    }

    // ---------- Payments ----------
    public async Task<InvoiceDto> RecordPaymentAsync(CurrentMember member, Guid id, RecordPaymentRequest request, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin, AdminOnly);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var invoice = await LoadAsync(id, ct);
        var now = clock.GetUtcNow();
        if (request.PaidOn > await TodayAsync(member.CompanyId, ct))
        {
            throw new ValidationException([new ValidationFailure("paidOn", "Das Zahlungsdatum darf nicht in der Zukunft liegen.")]);
        }

        var payment = new InvoicePayment
        {
            Id = Guid.NewGuid(),
            Amount = request.Amount,
            PaidOn = request.PaidOn,
            Method = Text.Clean(request.Method),
            Note = Text.Clean(request.Note),
            CreatedAt = now,
            CreatedByUserId = member.UserId,
        };
        invoice.RecordPayment(payment, now);
        db.InvoicePayments.Add(payment);
        invoice.AddEvent(InvoiceEventType.PaymentRecorded, now, ActorType.User, member.UserId, $"{EmailTemplates.Eur(payment.Amount)} am {EmailTemplates.Date(payment.PaidOn)}");
        if (invoice.Status == InvoiceStatus.Paid)
        {
            invoice.AddEvent(InvoiceEventType.Paid, now, ActorType.User, member.UserId);
            await CancelPendingRemindersAsync(invoice.Id, "Rechnung bezahlt", ct);
        }

        audit.Record(member.CompanyId, member.UserId, invoice.Status == InvoiceStatus.Paid ? "invoice.paid" : "invoice.payment_recorded", "Invoice", invoice.Id,
            $"{invoice.Number}: {EmailTemplates.Eur(payment.Amount)}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    public async Task<InvoiceDto> RemovePaymentAsync(CurrentMember member, Guid id, Guid paymentId, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin, AdminOnly);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var invoice = await LoadAsync(id, ct);
        var payment = invoice.Payments.FirstOrDefault(p => p.Id == paymentId) ?? throw new NotFoundException("Die Zahlung wurde nicht gefunden.");
        var now = clock.GetUtcNow();
        invoice.RemovePayment(payment, now);
        db.InvoicePayments.Remove(payment);
        invoice.AddEvent(InvoiceEventType.PaymentRemoved, now, ActorType.User, member.UserId, $"{EmailTemplates.Eur(payment.Amount)} vom {EmailTemplates.Date(payment.PaidOn)}");
        audit.Record(member.CompanyId, member.UserId, "invoice.payment_removed", "Invoice", invoice.Id, $"{invoice.Number}: {EmailTemplates.Eur(payment.Amount)}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(member, invoice.Id, ct);
    }

    public async Task<SendInvoiceResponse> SendReminderAsync(CurrentMember member, Guid id, PaymentReminderRequest request, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin, AdminOnly);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var invoice = await LoadAsync(id, ct);
        if (!invoice.IsOpen)
        {
            throw new ConflictException("invoice_not_open", "Zahlungserinnerungen sind nur für offene Rechnungen möglich.");
        }

        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var sender = await RequireVerifiedSenderAsync(member, ct);
        var recipient = RecipientOrThrow(request.RecipientEmail, invoice);
        await billing.EnsureEmailQuotaAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        invoice.MarkReminderSent(now);
        var delivery = await outbox.EnqueueAsync(new EnqueueEmail(
            member.CompanyId, null, EmailKind.PaymentReminder, $"invoice-reminder:{invoice.Id:N}:{invoice.ReminderCount}", recipient,
            EmailTemplates.PaymentReminder(invoice, company.Name, Text.Clean(request.Message), settings.EmailSignature, company.BrandColor),
            settings.ReplyToEmail ?? company.Email ?? sender, company.Name, invoice.PdfFileId, InvoiceDocuments.PdfFileName(invoice), member.UserId, invoice.Id), ct);
        invoice.AddEvent(InvoiceEventType.ReminderQueued, now, ActorType.User, member.UserId, $"Zahlungserinnerung an {recipient}");
        audit.Record(member.CompanyId, member.UserId, "invoice.reminder_sent", "Invoice", invoice.Id, invoice.Number);
        await db.SaveChangesAsync(ct);
        dispatchSignal.Notify();
        return new SendInvoiceResponse(await GetAsync(member, invoice.Id, ct), delivery?.Id);
    }

    // ---------- Cancellation ----------

    /// <summary>Reverses an issued invoice with a cancellation invoice (Stornorechnung) that gets its own number.</summary>
    public async Task<InvoiceDto> CancelAsync(CurrentMember member, Guid id, string? reason, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin, AdminOnly);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var original = await LoadAsync(id, ct);
        if (original.IsCancellation || original.Status is InvoiceStatus.Draft or InvoiceStatus.Cancelled)
        {
            throw new ConflictException("invoice_not_cancellable", original.IsDraft
                ? "Entwürfe werden gelöscht, nicht storniert."
                : "Diese Rechnung kann nicht storniert werden.");
        }

        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var cleanReason = Text.Clean(reason);

        var storno = new Invoice
        {
            Id = Guid.NewGuid(),
            CompanyId = original.CompanyId,
            CustomerId = original.CustomerId,
            Kind = InvoiceKind.Cancellation,
            Title = $"Storno: {original.Title}",
            IssueDate = today,
            ServiceDateFrom = original.ServiceDateFrom,
            ServiceDateTo = original.ServiceDateTo,
            DueDate = today,
            TaxMode = original.TaxMode,
            IntroText = $"hiermit stornieren wir unsere Rechnung {original.Number} vom {EmailTemplates.Date(original.IssueDate)} in voller Höhe."
                + (cleanReason is null ? string.Empty : $" Grund: {cleanReason}"),
            ClosingText = original.PaidAmount > 0
                ? $"Bereits geleistete Zahlungen in Höhe von {EmailTemplates.Eur(original.PaidAmount)} erstatten bzw. verrechnen wir mit Ihnen."
                : null,
            BuyerReference = original.BuyerReference,
            QuotationId = original.QuotationId,
            QuotationNumber = original.QuotationNumber,
            JobId = original.JobId,
            JobNumber = original.JobNumber,
            CancelledInvoiceId = original.Id,
            CancelledInvoiceNumber = original.Number,
            CancelledInvoiceIssueDate = original.IssueDate,
            CreatedByUserId = member.UserId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        CopyRecipient(original, storno);
        storno.ReplaceLineItems(original.LineItems.OrderBy(i => i.Position).Select(Copy));

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var number = await numbering.NextAsync(member.CompanyId, DocumentSequenceKind.Invoice, settings.InvoicePrefix, today.Year, ct);
        storno.Issue(number, now, member.UserId, today);
        db.Invoices.Add(storno);
        await StoreDocumentsAsync(member, storno, now, ct);
        storno.AddEvent(InvoiceEventType.Issued, now, ActorType.User, member.UserId, $"Stornorechnung zu {original.Number}");

        original.Cancel(storno.Id, now, cleanReason);
        original.AddEvent(InvoiceEventType.Cancelled, now, ActorType.User, member.UserId, cleanReason);
        original.AddEvent(InvoiceEventType.CancellationCreated, now, ActorType.User, member.UserId, number);
        await CancelPendingRemindersAsync(original.Id, "Rechnung storniert", ct);
        audit.Record(member.CompanyId, member.UserId, "invoice.cancelled", "Invoice", original.Id, $"{original.Number} → Storno {number}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetAsync(member, original.Id, ct);
    }

    // ---------- Documents ----------
    public async Task<(byte[] Content, string FileName)> PdfAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices.Include(x => x.LineItems).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw NotFound();
        if (invoice.PdfFileId is { } fileId && await files.ReadAllAsync(member.CompanyId, fileId, ct) is { } stored)
        {
            return (stored, InvoiceDocuments.PdfFileName(invoice));
        }

        if (!invoice.IsDraft)
        {
            throw new ConflictException("document_missing", "Das gespeicherte PDF dieser Rechnung ist nicht verfügbar.");
        }

        // Drafts are rendered on demand with an "ENTWURF" watermark and without a number.
        return (await documents.PreviewAsync(invoice, ct), InvoiceDocuments.PdfFileName(invoice));
    }

    public async Task<(byte[] Content, string FileName)> XmlAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw NotFound();
        if (invoice.XmlFileId is not { } fileId)
        {
            throw new ConflictException("einvoice_unavailable", "Die E-Rechnung wird erst beim Stellen der Rechnung erzeugt.");
        }

        var xml = await files.ReadAllAsync(member.CompanyId, fileId, ct)
            ?? throw new ConflictException("document_missing", "Die gespeicherte E-Rechnung ist nicht verfügbar.");
        return (xml, InvoiceDocuments.XmlFileName(invoice));
    }

    public async Task<byte[]> ExportCsvAsync(CurrentMember member, InvoiceListQuery query, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        var today = CompanyTime.Today(clock.GetUtcNow(), company.TimeZone);
        var rows = await Filter(db.Invoices.AsNoTracking(), query, today).Where(i => i.Number != null).OrderBy(i => i.Number)
            .Select(i => new { i.Number, i.Kind, i.Status, i.Title, Customer = i.RecipientName, i.IssueDate, i.ServiceDateFrom, i.ServiceDateTo, i.DueDate, i.NetTotal, i.TaxTotal, i.GrossTotal, i.PaidAmount, i.PaidOn, i.CancelledInvoiceNumber })
            .ToListAsync(ct);
        audit.Record(member.CompanyId, member.UserId, "invoice.exported", "Invoice", null, $"{rows.Count} Rechnungen");
        await db.SaveChangesAsync(ct);
        return Csv.Write(
            ["Nummer", "Art", "Status", "Betreff", "Kunde", "Rechnungsdatum", "Leistung von", "Leistung bis", "Fällig am", "Netto (EUR)", "USt. (EUR)", "Brutto (EUR)", "Bezahlt (EUR)", "Bezahlt am", "Storno zu"],
            rows.Select(r =>
            {
                var sign = r.Kind == InvoiceKind.Cancellation ? -1 : 1;
                return new[]
                {
                    r.Number, r.Kind == InvoiceKind.Cancellation ? "Stornorechnung" : "Rechnung", r.Kind == InvoiceKind.Cancellation ? "Storno" : Invoice.StatusLabel(r.Status), r.Title, r.Customer,
                    Csv.Date(r.IssueDate), Csv.Date(r.ServiceDateFrom), Csv.Date(r.ServiceDateTo), Csv.Date(r.DueDate),
                    Csv.Money(sign * r.NetTotal), Csv.Money(sign * r.TaxTotal), Csv.Money(sign * r.GrossTotal), Csv.Money(r.PaidAmount), Csv.Date(r.PaidOn), r.CancelledInvoiceNumber,
                };
            }));
    }

    // ---------- Shared helpers ----------
    public static void SnapshotRecipient(Invoice invoice, Customer c)
    {
        var withSalutation = string.Join(' ', new[] { c.Salutation, c.FirstName, c.LastName }.Where(s => !string.IsNullOrWhiteSpace(s)));
        if (c.Type == CustomerType.Business && !string.IsNullOrWhiteSpace(c.CompanyName))
        {
            invoice.RecipientName = c.CompanyName!;
            invoice.RecipientContact = string.IsNullOrWhiteSpace(withSalutation) ? null : withSalutation;
        }
        else
        {
            invoice.RecipientName = string.IsNullOrWhiteSpace(withSalutation) ? c.DisplayName : withSalutation;
            invoice.RecipientContact = c.ContactPerson;
        }

        invoice.RecipientStreet = Text.Clean(c.BillingStreet);
        invoice.RecipientPostalCode = Text.Clean(c.BillingPostalCode);
        invoice.RecipientCity = Text.Clean(c.BillingCity);
        invoice.RecipientCountry = Text.Upper(c.BillingCountry) ?? "DE";
        invoice.RecipientAddress = Text.FormatAddress(
            c.BillingStreet,
            string.Join(' ', new[] { c.BillingPostalCode, c.BillingCity }.Where(s => !string.IsNullOrWhiteSpace(s))),
            c.BillingCountry is "DE" or null ? null : c.BillingCountry);
        invoice.RecipientEmail = c.Email;
        invoice.RecipientVatId = c.VatId;
    }

    public static IReadOnlyList<string> AllowedActions(Invoice invoice, MembershipRole role)
    {
        var admin = role >= MembershipRole.Admin;
        var actions = new List<string>();
        if (invoice.IsDraft)
        {
            actions.AddRange(["edit", "delete", "duplicate"]);
            if (admin)
            {
                actions.Add("issue");
            }

            return actions;
        }

        if (!invoice.IsCancellation)
        {
            actions.Add("duplicate");
        }

        if (!admin)
        {
            return actions;
        }

        actions.Add("send");
        if (invoice.IsOpen)
        {
            actions.Add("recordPayment");
            actions.Add("remind");
        }

        if (invoice.Status is InvoiceStatus.PartiallyPaid or InvoiceStatus.Paid)
        {
            actions.Add("removePayment");
        }

        if (!invoice.IsCancellation && invoice.Status != InvoiceStatus.Cancelled)
        {
            actions.Add("cancel");
        }

        return actions;
    }

    private async Task<Invoice> FromQuotationAsync(CurrentMember member, Quotation quotation, string title, DateOnly? serviceDate, CancellationToken ct)
    {
        var customer = await db.Customers.FirstAsync(c => c.Id == quotation.CustomerId, ct);
        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var invoice = NewDraft(member, customer, settings, now, today);
        if (customer.AnonymizedAt is not null)
        {
            invoice.RecipientName = quotation.RecipientName;
            invoice.RecipientContact = quotation.RecipientContact;
            invoice.RecipientAddress = quotation.RecipientAddress;
        }

        invoice.Title = title;
        invoice.ServiceDateFrom = serviceDate ?? today;
        invoice.DueDate = today.AddDays(settings.InvoicePaymentDays);
        invoice.TaxMode = quotation.TaxMode;
        invoice.IntroText = settings.InvoiceIntroText;
        invoice.ClosingText = settings.InvoiceClosingText;
        invoice.QuotationId = quotation.Id;
        invoice.QuotationNumber = quotation.Number;
        invoice.ReplaceLineItems(quotation.LineItems.OrderBy(i => i.Position).Select(i => new InvoiceLineItem
        {
            Title = i.Title,
            Description = i.Description,
            Quantity = i.Quantity,
            Unit = i.Unit,
            UnitPriceNet = i.UnitPriceNet,
            DiscountPercent = i.DiscountPercent,
            TaxRatePercent = i.TaxRatePercent,
        }));
        return invoice;
    }

    private static Invoice NewDraft(CurrentMember member, Customer customer, CompanySettings settings, DateTimeOffset now, DateOnly issueDate)
    {
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            CompanyId = member.CompanyId,
            CustomerId = customer.Id,
            Title = "Rechnung",
            IssueDate = issueDate,
            DueDate = issueDate.AddDays(settings.InvoicePaymentDays),
            TaxMode = settings.DefaultTaxMode,
            CreatedByUserId = member.UserId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        SnapshotRecipient(invoice, customer);
        return invoice;
    }

    private async Task StoreDocumentsAsync(CurrentMember member, Invoice invoice, DateTimeOffset now, CancellationToken ct)
    {
        var (pdf, xml) = await documents.FinalAsync(invoice, now, ct);
        var pdfFile = await files.SaveDocumentAsync(member.CompanyId, member.UserId, FilePurpose.InvoicePdf, InvoiceDocuments.PdfFileName(invoice), "application/pdf", pdf, ct);
        var xmlFile = await files.SaveDocumentAsync(member.CompanyId, member.UserId, FilePurpose.InvoiceXml, InvoiceDocuments.XmlFileName(invoice), "application/xml", xml, ct);
        invoice.PdfFileId = pdfFile.Id;
        invoice.XmlFileId = xmlFile.Id;
    }

    private Task<int> CancelPendingRemindersAsync(Guid invoiceId, string reason, CancellationToken ct) =>
        db.EmailDeliveries
            .Where(e => e.InvoiceId == invoiceId && e.Kind == EmailKind.PaymentReminder && (e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EmailStatus.Cancelled).SetProperty(e => e.LastError, reason), ct);

    private async Task<string> RequireVerifiedSenderAsync(CurrentMember member, CancellationToken ct)
    {
        var sender = await db.Users.AsNoTracking().FirstAsync(u => u.Id == member.UserId, ct);
        if (sender.EmailVerifiedAt is null)
        {
            throw new ConflictException("email_not_verified", "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Rechnungen per E-Mail versendet werden.");
        }

        return sender.Email;
    }

    private static string RecipientOrThrow(string? requested, Invoice invoice) =>
        Text.Clean(requested) ?? invoice.RecipientEmail
        ?? throw new ValidationException([new ValidationFailure("recipientEmail", "Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.")]);

    private static void CopyRecipient(Invoice from, Invoice to)
    {
        to.RecipientName = from.RecipientName;
        to.RecipientContact = from.RecipientContact;
        to.RecipientAddress = from.RecipientAddress;
        to.RecipientStreet = from.RecipientStreet;
        to.RecipientPostalCode = from.RecipientPostalCode;
        to.RecipientCity = from.RecipientCity;
        to.RecipientCountry = from.RecipientCountry;
        to.RecipientEmail = from.RecipientEmail;
        to.RecipientVatId = from.RecipientVatId;
    }

    private static InvoiceLineItem ToEntity(LineItemInput i) => new()
    {
        Title = i.Title.Trim(),
        Description = Text.Clean(i.Description),
        Quantity = i.Quantity,
        Unit = i.Unit.Trim(),
        UnitPriceNet = i.UnitPriceNet,
        DiscountPercent = i.DiscountPercent,
        TaxRatePercent = i.TaxRatePercent,
    };

    private static InvoiceLineItem Copy(InvoiceLineItem i) => new()
    {
        Title = i.Title,
        Description = i.Description,
        Quantity = i.Quantity,
        Unit = i.Unit,
        UnitPriceNet = i.UnitPriceNet,
        DiscountPercent = i.DiscountPercent,
        TaxRatePercent = i.TaxRatePercent,
    };

    private static IQueryable<Invoice> Filter(IQueryable<Invoice> q, InvoiceListQuery query, DateOnly today)
    {
        if (query.Statuses is { Count: > 0 } statuses)
        {
            // Cancellation invoices are listed under "Storniert" together with the invoices they reverse, never as open.
            var withCancellations = statuses.Contains(InvoiceStatus.Cancelled);
            q = q.Where(x => (x.Kind == InvoiceKind.Invoice && statuses.Contains(x.Status)) || (withCancellations && x.Kind == InvoiceKind.Cancellation));
        }

        if (query.Overdue)
        {
            q = q.Where(x => x.Kind == InvoiceKind.Invoice && (x.Status == InvoiceStatus.Issued || x.Status == InvoiceStatus.PartiallyPaid) && x.DueDate < today);
        }

        if (query.CustomerId is { } customerId)
        {
            q = q.Where(x => x.CustomerId == customerId);
        }

        if (query.From is { } from)
        {
            q = q.Where(x => x.IssueDate >= from);
        }

        if (query.To is { } to)
        {
            q = q.Where(x => x.IssueDate <= to);
        }

        if (Text.Clean(query.Search) is { } search)
        {
            var pattern = $"%{Paging.EscapeLike(search)}%";
            q = q.Where(x => EF.Functions.Like(x.Number ?? string.Empty, pattern, "\\") || EF.Functions.Like(x.Title, pattern, "\\")
                || EF.Functions.Like(x.RecipientName, pattern, "\\") || EF.Functions.Like(x.QuotationNumber ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(x.JobNumber ?? string.Empty, pattern, "\\"));
        }

        return q;
    }

    private static IQueryable<InvoiceListItemDto> Project(IQueryable<Invoice> q, DateOnly today) =>
        q.Select(x => new InvoiceListItemDto(
            x.Id, x.Number, x.Kind, x.Status, x.Title, x.CustomerId, x.RecipientName, x.IssueDate, x.DueDate, x.NetTotal, x.GrossTotal, x.PaidAmount,
            x.Kind == InvoiceKind.Invoice && (x.Status == InvoiceStatus.Issued || x.Status == InvoiceStatus.PartiallyPaid) ? x.GrossTotal - x.PaidAmount : 0m,
            x.Kind == InvoiceKind.Invoice && (x.Status == InvoiceStatus.Issued || x.Status == InvoiceStatus.PartiallyPaid) && x.DueDate < today,
            x.Kind == InvoiceKind.Invoice && (x.Status == InvoiceStatus.Issued || x.Status == InvoiceStatus.PartiallyPaid) && x.DueDate < today ? today.DayNumber - x.DueDate.DayNumber : 0,
            x.SentAt, x.UpdatedAt));

    private async Task<InvoiceDto> ToDtoAsync(CurrentMember member, Invoice i, CancellationToken ct)
    {
        var (company, _) = await CompanyAsync(member.CompanyId, ct);
        var today = CompanyTime.Today(clock.GetUtcNow(), company.TimeZone);
        var cancellationNumber = i.CancellationInvoiceId is { } cid
            ? await db.Invoices.AsNoTracking().Where(x => x.Id == cid).Select(x => x.Number).FirstOrDefaultAsync(ct)
            : null;
        var creatorIds = i.Payments.Select(p => p.CreatedByUserId).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => creatorIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        var problems = i.IsDraft ? InvoiceDocuments.CompanyProblems(company, i.TaxMode).Concat(i.IssueProblems(today)).ToList() : [];
        return new InvoiceDto(
            i.Id, i.Number, i.Kind, i.Status, i.Title, i.CustomerId, i.Customer?.DisplayName ?? i.RecipientName, i.RecipientName, i.RecipientContact, i.RecipientAddress,
            i.RecipientEmail, i.RecipientVatId, i.IssueDate, i.ServiceDateFrom, i.ServiceDateTo, i.DueDate, i.TaxMode, i.IntroText, i.ClosingText, i.PaymentTerms,
            i.BuyerReference, i.InternalNotes, i.Currency,
            i.LineItems.OrderBy(x => x.Position).Select(x => new LineItemDto(x.Id, x.Position, x.Title, x.Description, x.Quantity, x.Unit, x.UnitPriceNet, x.DiscountPercent,
                x.TaxRatePercent, x.LineTotalBeforeDiscount, x.LineDiscount, x.LineNet)).ToList(),
            QuotationMapping.ToDto(i.CalculateTotals()),
            i.PaidAmount, i.OpenAmount, i.IsOverdue(today), i.DaysOverdue(today), i.PaidOn,
            i.Payments.OrderBy(p => p.PaidOn).ThenBy(p => p.CreatedAt)
                .Select(p => new InvoicePaymentDto(p.Id, p.Amount, p.PaidOn, p.Method, p.Note, p.CreatedAt, names.GetValueOrDefault(p.CreatedByUserId))).ToList(),
            i.QuotationId, i.QuotationNumber, i.JobId, i.JobNumber, i.CancelledInvoiceId, i.CancelledInvoiceNumber, i.CancellationInvoiceId, cancellationNumber,
            i.CreatedAt, i.UpdatedAt, i.IssuedAt, i.SentAt, i.CancelledAt, i.CancellationReason, i.LastReminderAt, i.ReminderCount,
            i.XmlFileId is not null, problems, AllowedActions(i, member.Role), RowVersions.Encode(i.RowVersion));
    }

    private async Task<Invoice> LoadAsync(Guid id, CancellationToken ct) =>
        await db.Invoices.Include(x => x.LineItems).Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw NotFound();

    private async Task EnsureExistsAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Invoices.AnyAsync(x => x.Id == id, ct))
        {
            throw NotFound();
        }
    }

    private async Task<DateOnly> TodayAsync(Guid companyId, CancellationToken ct)
    {
        var tz = await db.Companies.AsNoTracking().Where(c => c.Id == companyId).Select(c => c.TimeZone).FirstAsync(ct);
        return CompanyTime.Today(clock.GetUtcNow(), tz);
    }

    private async Task<(Company Company, CompanySettings Settings)> CompanyAsync(Guid companyId, CancellationToken ct)
    {
        var company = await db.Companies.AsNoTracking().Include(c => c.Settings).FirstAsync(c => c.Id == companyId, ct);
        return (company, company.Settings!);
    }

    private static NotFoundException NotFound() => new("Die Rechnung wurde nicht gefunden.");

    private static NotFoundException NotFoundCustomer() => new("Der Kunde wurde nicht gefunden.");
}
