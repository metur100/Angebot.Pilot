using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Customers;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Files;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.FollowUps;
using AngebotPilot.Domain.Jobs;
using AngebotPilot.Domain.Quotations;
using AngebotPilot.Domain.Templates;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AngebotPilot.Application.Quotations;

public sealed record QuotationListQuery(
    string? Search,
    IReadOnlyList<QuotationStatus>? Statuses,
    Guid? CustomerId,
    DateOnly? From,
    DateOnly? To,
    string? Sort,
    int Page = 1,
    int PageSize = 25);

public sealed class QuotationService(
    IAppDbContext db,
    BillingService billing,
    DocumentNumbering numbering,
    PublicLinks publicLinks,
    QuotationPdfFactory pdfFactory,
    FileService files,
    IEmailOutbox outbox,
    IEmailDispatchSignal dispatchSignal,
    Jobs.JobService jobs,
    IAuditLog audit,
    TimeProvider clock)
{

    // ---------- Queries ----------
    public async Task<PagedResult<QuotationListItemDto>> ListAsync(QuotationListQuery query, CancellationToken ct)
    {
        var (page, size) = Paging.Normalize(query.Page, query.PageSize);
        var q = Filter(db.Quotations.AsNoTracking(), query);
        q = query.Sort switch
        {
            "updatedAt" => q.OrderBy(x => x.UpdatedAt),
            "number" => q.OrderBy(x => x.Number),
            "-number" => q.OrderByDescending(x => x.Number),
            "issueDate" => q.OrderBy(x => x.IssueDate).ThenBy(x => x.Number),
            "-issueDate" => q.OrderByDescending(x => x.IssueDate).ThenByDescending(x => x.Number),
            "grossTotal" => q.OrderBy(x => x.GrossTotal),
            "-grossTotal" => q.OrderByDescending(x => x.GrossTotal),
            "validUntil" => q.OrderBy(x => x.ValidUntil),
            "-validUntil" => q.OrderByDescending(x => x.ValidUntil),
            _ => q.OrderByDescending(x => x.UpdatedAt),
        };
        var total = await q.CountAsync(ct);
        var items = await Project(q.Skip((page - 1) * size).Take(size)).ToListAsync(ct);
        return new PagedResult<QuotationListItemDto>(items, page, size, total);
    }

    public async Task<IReadOnlyList<QuotationListItemDto>> ForCustomerAsync(Guid customerId, CancellationToken ct) =>
        await Project(db.Quotations.AsNoTracking().Where(q => q.CustomerId == customerId).OrderByDescending(q => q.IssueDate).ThenByDescending(q => q.Number)).ToListAsync(ct);

    public async Task<QuotationDto> GetAsync(Guid id, CancellationToken ct)
    {
        var q = await db.Quotations.AsNoTracking().Include(x => x.LineItems).Include(x => x.Customer).FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("Das Angebot wurde nicht gefunden.");
        return await ToDtoAsync(q, ct);
    }

    public async Task<IReadOnlyList<QuotationEventDto>> EventsAsync(Guid id, CancellationToken ct)
    {
        await EnsureExistsAsync(id, ct);
        var events = await db.QuotationEvents.AsNoTracking().Where(e => e.QuotationId == id).OrderByDescending(e => e.OccurredAt).ToListAsync(ct);
        var userIds = events.Where(e => e.ActorUserId != null).Select(e => e.ActorUserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        return events.Select(e => new QuotationEventDto(
            e.Id, e.Type, e.OccurredAt, e.ActorType,
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
        return await db.EmailDeliveries.AsNoTracking().Where(e => e.QuotationId == id && e.CompanyId == member.CompanyId)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new EmailDeliveryDto(e.Id, e.Kind, e.ToAddress, e.Subject, e.Status, e.Attempts, e.CreatedAt, e.HandedOffAt,
                e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled ? e.NextAttemptAt : null, e.LastError))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<FollowUpDto>> FollowUpsAsync(Guid id, CancellationToken ct)
    {
        await EnsureExistsAsync(id, ct);
        return await db.FollowUpSchedules.AsNoTracking().Where(f => f.QuotationId == id).OrderBy(f => f.DueAt)
            .Select(f => new FollowUpDto(f.Id, f.Kind, f.DueAt, f.Status, f.StatusReason, f.ProcessedAt)).ToListAsync(ct);
    }

    public TotalsDto Calculate(CalculateRequest request) =>
        QuotationMapping.ToDto(QuotationCalculator.Calculate(
            request.LineItems.Select(i => new LineInput(i.Quantity, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent)), request.TaxMode));

    public async Task<LookupByTokenResponse> LookupByTokenAsync(string token, CancellationToken ct)
    {
        if (!SecureTokens.LooksValid(token))
        {
            throw new NotFoundException();
        }

        var hash = SecureTokens.Hash(token);
        // The tenant filter restricts the lookup to the caller's company.
        var id = await db.PublicQuotationAccesses.Where(a => a.TokenHash == hash).Select(a => (Guid?)a.QuotationId).FirstOrDefaultAsync(ct);
        return id is null ? throw new NotFoundException("Kein Angebot Ihrer Firma gehört zu diesem Code.") : new LookupByTokenResponse(id.Value);
    }

    // ---------- Commands ----------
    public async Task<QuotationDto> CreateAsync(CurrentMember member, CreateQuotationRequest request, CancellationToken ct)
    {
        await billing.EnsureQuotationQuotaAsync(member.CompanyId, ct);
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId, ct) ?? throw NotFoundCustomer();
        if (customer.ArchivedAt is not null)
        {
            throw new ConflictException("customer_archived", "Für archivierte Kunden können keine neuen Angebote erstellt werden.");
        }

        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        QuotationTemplate? template = null;
        if (request.TemplateId is { } templateId)
        {
            template = await db.Templates.Include(t => t.LineItems).FirstOrDefaultAsync(t => t.Id == templateId && t.ArchivedAt == null, ct)
                ?? throw new NotFoundException("Die Vorlage wurde nicht gefunden.");
        }

        var defaultTaxRate = await db.TaxRates.Where(t => t.IsDefault && !t.IsArchived).Select(t => (decimal?)t.RatePercent).FirstOrDefaultAsync(ct) ?? 19m;
        var issueDate = request.IssueDate ?? today;
        var lineItems = request.LineItems is { Count: > 0 }
            ? request.LineItems.Select(QuotationMapping.ToEntity).ToList()
            : template?.LineItems.OrderBy(i => i.Position).Select(i => new QuotationLineItem
            {
                Title = i.Title,
                Description = i.Description,
                Quantity = i.Quantity,
                Unit = i.Unit,
                UnitPriceNet = i.UnitPriceNet,
                DiscountPercent = i.DiscountPercent,
                TaxRatePercent = i.TaxRatePercent ?? defaultTaxRate,
            }).ToList() ?? [];

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var quotation = new Quotation
        {
            Id = Guid.NewGuid(),
            CompanyId = member.CompanyId,
            CustomerId = customer.Id,
            Number = await numbering.NextAsync(member.CompanyId, DocumentSequenceKind.Quotation, settings.QuotationPrefix, issueDate.Year, ct),
            Title = Text.Clean(request.Title) ?? template?.Name ?? "Angebot",
            IssueDate = issueDate,
            ValidUntil = request.ValidUntil ?? issueDate.AddDays(settings.DefaultValidityDays),
            TaxMode = request.TaxMode ?? template?.TaxMode ?? settings.DefaultTaxMode,
            IntroText = Text.Clean(request.IntroText) ?? template?.IntroText ?? settings.DefaultIntroText,
            ClosingText = Text.Clean(request.ClosingText) ?? template?.ClosingText ?? settings.DefaultClosingText,
            Terms = Text.Clean(request.Terms) ?? template?.Terms ?? settings.DefaultTerms,
            PaymentTerms = Text.Clean(request.PaymentTerms) ?? settings.PaymentTerms,
            InternalNotes = Text.Clean(request.InternalNotes),
            SourceTemplateId = template?.Id,
            CreatedByUserId = member.UserId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        QuotationMapping.SnapshotRecipient(quotation, customer);
        quotation.ReplaceLineItems(lineItems);
        quotation.AddEvent(QuotationEventType.Created, now, ActorType.User, member.UserId, template is null ? null : $"Aus Vorlage „{template.Name}“");
        db.Quotations.Add(quotation);
        audit.Record(member.CompanyId, member.UserId, "quotation.created", "Quotation", quotation.Id, quotation.Number);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetAsync(quotation.Id, ct);
    }

    public async Task<QuotationDto> UpdateAsync(CurrentMember member, Guid id, UpdateQuotationRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var q = await LoadAsync(id, ct);
        q.EnsureEditable();
        db.SetOriginalRowVersion(q, RowVersions.Decode(request.RowVersion));
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId, ct) ?? throw NotFoundCustomer();
        var now = clock.GetUtcNow();
        q.CustomerId = customer.Id;
        q.Title = request.Title.Trim();
        q.IssueDate = request.IssueDate;
        q.ValidUntil = request.ValidUntil;
        q.TaxMode = request.TaxMode;
        q.IntroText = Text.Clean(request.IntroText);
        q.ClosingText = Text.Clean(request.ClosingText);
        q.Terms = Text.Clean(request.Terms);
        q.PaymentTerms = Text.Clean(request.PaymentTerms);
        q.InternalNotes = Text.Clean(request.InternalNotes);
        q.UpdatedAt = now;
        QuotationMapping.SnapshotRecipient(q, customer);
        db.QuotationLineItems.RemoveRange(q.LineItems);
        q.ReplaceLineItems(request.LineItems.Select(QuotationMapping.ToEntity));
        q.AddEvent(QuotationEventType.Updated, now, ActorType.User, member.UserId);
        await db.SaveChangesAsync(ct);
        return await GetAsync(q.Id, ct);
    }

    public async Task DeleteDraftAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var q = await LoadAsync(id, ct);
        if (!q.IsDraft)
        {
            throw new ConflictException("quotation_not_deletable", "Nur Entwürfe können gelöscht werden. Versendete Angebote können storniert werden.");
        }

        q.DeletedAt = clock.GetUtcNow();
        audit.Record(member.CompanyId, member.UserId, "quotation.deleted", "Quotation", q.Id, $"{q.Number} (Nummer wird nicht erneut vergeben)");
        await db.SaveChangesAsync(ct);
    }

    public async Task<QuotationDto> DuplicateAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        await billing.EnsureQuotationQuotaAsync(member.CompanyId, ct);
        var source = await LoadAsync(id, ct);
        var customer = await db.Customers.FirstAsync(c => c.Id == source.CustomerId, ct);
        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var copy = NewFrom(source, member, now);
        copy.Number = await numbering.NextAsync(member.CompanyId, DocumentSequenceKind.Quotation, settings.QuotationPrefix, today.Year, ct);
        copy.IssueDate = today;
        copy.ValidUntil = today.AddDays(settings.DefaultValidityDays);
        if (customer.AnonymizedAt is null)
        {
            QuotationMapping.SnapshotRecipient(copy, customer);
        }

        copy.ReplaceLineItems(source.LineItems.OrderBy(i => i.Position).Select(QuotationMapping.Copy));
        copy.AddEvent(QuotationEventType.Created, now, ActorType.User, member.UserId, $"Kopie von {source.Number}");
        source.AddEvent(QuotationEventType.Duplicated, now, ActorType.User, member.UserId, $"Kopiert nach {copy.Number}");
        db.Quotations.Add(copy);
        audit.Record(member.CompanyId, member.UserId, "quotation.duplicated", "Quotation", copy.Id, $"{source.Number} → {copy.Number}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetAsync(copy.Id, ct);
    }

    public async Task<QuotationDto> ReviseAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var source = await LoadAsync(id, ct);
        if (!source.CanBeRevised)
        {
            throw new ConflictException("quotation_not_revisable", "Nur versendete, abgelehnte oder abgelaufene Angebote können überarbeitet werden.");
        }

        var rootId = source.RootQuotationId ?? source.Id;
        var root = rootId == source.Id ? source : await db.Quotations.IgnoreQueryFilters().FirstAsync(x => x.Id == rootId, ct);
        var nextRevision = await db.Quotations.IgnoreQueryFilters().Where(x => x.Id == rootId || x.RootQuotationId == rootId).MaxAsync(x => x.RevisionNumber, ct) + 1;
        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var revision = NewFrom(source, member, now);
        revision.Number = $"{root.Number}-R{nextRevision}";
        revision.RevisionNumber = nextRevision;
        revision.RootQuotationId = rootId;
        revision.PreviousRevisionId = source.Id;
        revision.IssueDate = today;
        revision.ValidUntil = today.AddDays(settings.DefaultValidityDays);
        revision.ReplaceLineItems(source.LineItems.OrderBy(i => i.Position).Select(QuotationMapping.Copy));
        revision.AddEvent(QuotationEventType.Created, now, ActorType.User, member.UserId, $"Revision {nextRevision} von {source.Number}");
        source.AddEvent(QuotationEventType.RevisionCreated, now, ActorType.User, member.UserId, revision.Number);
        db.Quotations.Add(revision);
        audit.Record(member.CompanyId, member.UserId, "quotation.revised", "Quotation", revision.Id, $"{source.Number} → {revision.Number}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(revision.Id, ct);
    }

    public async Task<SendQuotationResponse> SendAsync(CurrentMember member, Guid id, SendQuotationRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var q = await LoadAsync(id, ct);
        if (q.Status is not (QuotationStatus.Draft or QuotationStatus.Sent))
        {
            throw new ConflictException("invalid_status_transition", "Dieses Angebot kann nicht mehr versendet werden.");
        }

        var customer = await db.Customers.FirstAsync(c => c.Id == q.CustomerId, ct);
        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var sender = await db.Users.AsNoTracking().FirstAsync(u => u.Id == member.UserId, ct);
        var isEmail = request.Mode == SendMode.Email;
        string? recipient = null;
        if (isEmail)
        {
            if (sender.EmailVerifiedAt is null)
            {
                throw new ConflictException("email_not_verified", "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail versendet werden.");
            }

            recipient = Text.Clean(request.RecipientEmail) ?? customer.Email
                ?? throw new FluentValidation.ValidationException([new FluentValidation.Results.ValidationFailure("recipientEmail", "Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.")]);
            await billing.EnsureEmailQuotaAsync(member.CompanyId, ct);
        }

        var now = clock.GetUtcNow();
        var today = CompanyTime.Today(now, company.TimeZone);
        var firstSend = q.IsDraft;
        if (firstSend && customer.AnonymizedAt is null)
        {
            QuotationMapping.SnapshotRecipient(q, customer);
        }

        if (recipient is not null)
        {
            q.RecipientEmail = recipient;
        }

        // Validates the transition (items present, validity date not in the past).
        q.MarkSent(now, member.UserId, today);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        string? token = null;
        if (request.IncludePublicLink)
        {
            (token, _) = publicLinks.Create(q);
            q.AddEvent(QuotationEventType.PublicLinkCreated, now, ActorType.User, member.UserId);
        }

        var publicUrl = token is null ? null : publicLinks.Url(token);
        if (q.SentPdfFileId is null)
        {
            // The sent document is frozen: generated once, stored privately, and reused for resends and downloads.
            var pdf = await pdfFactory.RenderAsync(q, publicUrl, draftPreview: false, ct);
            var file = await files.SavePdfAsync(member.CompanyId, member.UserId, QuotationPdfFactory.FileName(q), pdf, ct);
            q.SentPdfFileId = file.Id;
            q.AddEvent(QuotationEventType.PdfGenerated, now, ActorType.System, null);
        }

        Guid? deliveryId = null;
        if (isEmail)
        {
            var attachPdf = request.AttachPdf ?? settings.AttachPdfToEmails;
            var content = EmailTemplates.QuotationSent(q, company.Name, Text.Clean(request.Subject), Text.Clean(request.Message), publicUrl, attachPdf,
                settings.EmailSignature, token is null ? null : publicLinks.OptOutUrl(token), company.BrandColor);
            var sendNumber = await db.EmailDeliveries.CountAsync(e => e.QuotationId == q.Id && e.Kind == EmailKind.QuotationSent, ct) + 1;
            var delivery = await outbox.EnqueueAsync(new EnqueueEmail(
                member.CompanyId, q.Id, EmailKind.QuotationSent, $"quotation-send:{q.Id:N}:{sendNumber}", recipient!, content,
                settings.ReplyToEmail ?? company.Email ?? sender.Email, company.Name, attachPdf ? q.SentPdfFileId : null,
                attachPdf ? QuotationPdfFactory.FileName(q) : null, member.UserId), ct);
            deliveryId = delivery?.Id;
            q.AddEvent(QuotationEventType.Sent, now, ActorType.User, member.UserId, $"An {recipient}");

            if (firstSend && request.ScheduleFollowUps && !customer.FollowUpOptOut)
            {
                var existingKinds = await db.FollowUpSchedules.Where(f => f.QuotationId == q.Id).Select(f => f.Kind).ToListAsync(ct);
                foreach (var plan in FollowUpPlanner.Plan(settings, now, q.ValidUntil, CompanyTime.Resolve(company.TimeZone)).Where(p => !existingKinds.Contains(p.Kind)))
                {
                    db.FollowUpSchedules.Add(new FollowUpSchedule { CompanyId = q.CompanyId, QuotationId = q.Id, Kind = plan.Kind, DueAt = plan.DueAt, Status = FollowUpStatus.Scheduled, CreatedAt = now });
                }
            }
        }
        else
        {
            q.AddEvent(QuotationEventType.MarkedAsSent, now, ActorType.User, member.UserId, "Ohne E-Mail durch den Anbieter übermittelt");
        }

        if (firstSend)
        {
            await SupersedeOtherRevisionsAsync(q, member.UserId, now, ct);
        }

        audit.Record(member.CompanyId, member.UserId, isEmail ? "quotation.sent" : "quotation.marked_sent", "Quotation", q.Id, q.Number);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        dispatchSignal.Notify();
        return new SendQuotationResponse(await GetAsync(q.Id, ct), publicUrl, deliveryId);
    }

    /// <summary>Records a decision the customer communicated outside the public page (phone, email, in person).</summary>
    public async Task<QuotationDto> RecordDecisionAsync(CurrentMember member, Guid id, bool accepted, string? note, CancellationToken ct)
    {
        var q = await LoadAsync(id, ct);
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        var now = clock.GetUtcNow();
        if (accepted)
        {
            q.Accept(now, ActorType.User, member.UserId, null, Text.Clean(note), CompanyTime.Today(now, company.TimeZone));
        }
        else
        {
            q.Reject(now, ActorType.User, member.UserId, null, Text.Clean(note));
        }

        q.AddEvent(accepted ? QuotationEventType.Accepted : QuotationEventType.Rejected, now, ActorType.User, member.UserId, "Vom Anbieter erfasst" + (string.IsNullOrWhiteSpace(note) ? string.Empty : $": {note.Trim()}"));
        await CloseOpenEndsAsync(q, now, accepted ? "Angebot angenommen" : "Angebot abgelehnt", member.UserId, ct);
        audit.Record(member.CompanyId, member.UserId, accepted ? "quotation.accepted" : "quotation.rejected", "Quotation", q.Id, q.Number);
        await db.SaveChangesAsync(ct);
        return await GetAsync(q.Id, ct);
    }

    public async Task<QuotationDto> CancelAsync(CurrentMember member, Guid id, string? reason, CancellationToken ct)
    {
        var q = await LoadAsync(id, ct);
        var now = clock.GetUtcNow();
        q.Cancel(now, Text.Clean(reason));
        q.AddEvent(QuotationEventType.Cancelled, now, ActorType.User, member.UserId, Text.Clean(reason));
        await CloseOpenEndsAsync(q, now, "Angebot storniert", member.UserId, ct);
        await publicLinks.RevokeAllAsync(q.Id, ct);
        audit.Record(member.CompanyId, member.UserId, "quotation.cancelled", "Quotation", q.Id, q.Number);
        await db.SaveChangesAsync(ct);
        return await GetAsync(q.Id, ct);
    }

    public async Task CancelFollowUpsAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var q = await LoadAsync(id, ct);
        var now = clock.GetUtcNow();
        var count = await FollowUpCanceller.CancelForQuotationAsync(db, q.Id, now, "Manuell beendet", ct);
        if (count > 0)
        {
            q.AddEvent(QuotationEventType.FollowUpsCancelled, now, ActorType.User, member.UserId, "Manuell beendet");
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<(byte[] Content, string FileName)> PdfAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var q = await db.Quotations.Include(x => x.LineItems).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Das Angebot wurde nicht gefunden.");
        if (q.SentPdfFileId is { } fileId && await files.ReadAllAsync(member.CompanyId, fileId, ct) is { } stored)
        {
            return (stored, QuotationPdfFactory.FileName(q));
        }

        // Drafts are rendered on demand and marked as "ENTWURF".
        return (await pdfFactory.RenderAsync(q, null, draftPreview: q.IsDraft, ct), QuotationPdfFactory.FileName(q));
    }

    public async Task<PublicLinkResponse> CreatePublicLinkAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var q = await LoadAsync(id, ct);
        if (q.Status is QuotationStatus.Draft or QuotationStatus.Cancelled)
        {
            throw new ConflictException("public_link_unavailable", "Ein Kundenlink ist erst nach dem Versand und nicht für stornierte Angebote verfügbar.");
        }

        var now = clock.GetUtcNow();
        await publicLinks.RevokeAllAsync(q.Id, ct);
        var (token, access) = publicLinks.Create(q);
        q.AddEvent(QuotationEventType.PublicLinkCreated, now, ActorType.User, member.UserId, "Neuer Link, frühere Links widerrufen");
        audit.Record(member.CompanyId, member.UserId, "quotation.public_link_created", "Quotation", q.Id, q.Number);
        await db.SaveChangesAsync(ct);
        return new PublicLinkResponse(publicLinks.Url(token), access.ExpiresAt);
    }

    public async Task RevokePublicLinkAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var q = await LoadAsync(id, ct);
        if (await publicLinks.RevokeAllAsync(q.Id, ct) > 0)
        {
            q.AddEvent(QuotationEventType.PublicLinkRevoked, clock.GetUtcNow(), ActorType.User, member.UserId);
            audit.Record(member.CompanyId, member.UserId, "quotation.public_link_revoked", "Quotation", q.Id, q.Number);
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<JobDto> ConvertToJobAsync(CurrentMember member, Guid id, ConvertToJobRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var q = await LoadAsync(id, ct);
        if (q.Status != QuotationStatus.Accepted)
        {
            throw new ConflictException("quotation_not_accepted", "Nur angenommene Angebote können in einen Auftrag umgewandelt werden.");
        }

        if (request.AssignedUserId is { } assignee && !await db.Memberships.AnyAsync(m => m.CompanyId == member.CompanyId && m.UserId == assignee && m.Status == MembershipStatus.Active, ct))
        {
            throw new FluentValidation.ValidationException([new FluentValidation.Results.ValidationFailure("assignedUserId", "Die Person ist kein aktives Mitglied der Firma.")]);
        }

        var (company, settings) = await CompanyAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (await db.Jobs.AnyAsync(j => j.QuotationId == q.Id, ct))
        {
            throw new ConflictException("already_converted", "Dieses Angebot wurde bereits in einen Auftrag umgewandelt.");
        }

        var job = new Job
        {
            Id = Guid.NewGuid(),
            CompanyId = member.CompanyId,
            Number = await numbering.NextAsync(member.CompanyId, DocumentSequenceKind.Job, settings.JobPrefix, CompanyTime.Today(now, company.TimeZone).Year, ct),
            CustomerId = q.CustomerId,
            QuotationId = q.Id,
            Title = Text.Clean(request.Title) ?? q.Title,
            Description = Text.Clean(request.Description),
            PlannedStartDate = request.PlannedStartDate,
            DueDate = request.DueDate,
            AssignedUserId = request.AssignedUserId,
            Notes = Text.Clean(request.Notes),
            CreatedAt = now,
            CreatedByUserId = member.UserId,
            UpdatedAt = now,
        };
        db.Jobs.Add(job);
        q.AddEvent(QuotationEventType.ConvertedToJob, now, ActorType.User, member.UserId, job.Number);
        audit.Record(member.CompanyId, member.UserId, "job.created", "Job", job.Id, $"{job.Number} aus {q.Number}");
        try
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The unique index on Jobs.QuotationId is the final guard against concurrent conversions.
            throw new ConflictException("already_converted", "Dieses Angebot wurde bereits in einen Auftrag umgewandelt.");
        }

        return await jobs.GetAsync(job.Id, ct);
    }

    public async Task<TemplateDto> SaveAsTemplateAsync(CurrentMember member, Guid id, SaveAsTemplateRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var q = await LoadAsync(id, ct);
        var now = clock.GetUtcNow();
        var template = new QuotationTemplate
        {
            CompanyId = member.CompanyId,
            Name = request.Name.Trim(),
            Description = Text.Clean(request.Description),
            IntroText = q.IntroText,
            ClosingText = q.ClosingText,
            Terms = q.Terms,
            TaxMode = q.TaxMode,
            CreatedAt = now,
            UpdatedAt = now,
            LineItems = q.LineItems.OrderBy(i => i.Position).Select(i => new TemplateLineItem
            {
                Position = i.Position,
                Title = i.Title,
                Description = i.Description,
                Quantity = i.Quantity,
                Unit = i.Unit,
                UnitPriceNet = i.UnitPriceNet,
                DiscountPercent = i.DiscountPercent,
                TaxRatePercent = i.TaxRatePercent,
            }).ToList(),
        };
        db.Templates.Add(template);
        audit.Record(member.CompanyId, member.UserId, "template.created", "Template", template.Id, $"{template.Name} aus {q.Number}");
        await db.SaveChangesAsync(ct);
        return Templates.TemplateService.ToDto(template);
    }

    public async Task<byte[]> ExportCsvAsync(CurrentMember member, QuotationListQuery query, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        var tz = CompanyTime.Resolve(company.TimeZone);
        var rows = await Filter(db.Quotations.AsNoTracking(), query).OrderBy(q => q.Number)
            .Select(q => new { q.Number, q.Title, q.Status, Customer = q.RecipientName, q.IssueDate, q.ValidUntil, q.NetTotal, q.TaxTotal, q.GrossTotal, q.SentAt, q.DecidedAt })
            .ToListAsync(ct);
        audit.Record(member.CompanyId, member.UserId, "quotation.exported", "Quotation", null, $"{rows.Count} Angebote");
        await db.SaveChangesAsync(ct);
        return Csv.Write(
            ["Nummer", "Betreff", "Status", "Kunde", "Angebotsdatum", "Gültig bis", "Netto (EUR)", "USt. (EUR)", "Brutto (EUR)", "Versendet am", "Entschieden am"],
            rows.Select(r => new[]
            {
                r.Number, r.Title, QuotationTransitions.StatusLabel(r.Status), r.Customer, Csv.Date(r.IssueDate), Csv.Date(r.ValidUntil),
                Csv.Money(r.NetTotal), Csv.Money(r.TaxTotal), Csv.Money(r.GrossTotal), Csv.DateTime(r.SentAt, tz), Csv.DateTime(r.DecidedAt, tz),
            }));
    }

    // ---------- Shared with the public page and jobs runner ----------

    /// <summary>Cancels reminders and revokes nothing else; called whenever a quotation reaches a final state.</summary>
    internal async Task CloseOpenEndsAsync(Quotation q, DateTimeOffset now, string reason, Guid? userId, CancellationToken ct)
    {
        var cancelled = await FollowUpCanceller.CancelForQuotationAsync(db, q.Id, now, reason, ct);
        if (cancelled > 0)
        {
            q.AddEvent(QuotationEventType.FollowUpsCancelled, now, userId is null ? ActorType.System : ActorType.User, userId, reason);
        }
    }

    private async Task SupersedeOtherRevisionsAsync(Quotation q, Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        if (q.RevisionNumber == 0 && q.RootQuotationId is null)
        {
            return;
        }

        var rootId = q.RootQuotationId ?? q.Id;
        var others = await db.Quotations.Where(x => (x.Id == rootId || x.RootQuotationId == rootId) && x.Id != q.Id && x.Status == QuotationStatus.Sent).ToListAsync(ct);
        foreach (var other in others)
        {
            other.Cancel(now, $"Ersetzt durch {q.Number}");
            other.AddEvent(QuotationEventType.SupersededByRevision, now, ActorType.User, userId, q.Number);
            await FollowUpCanceller.CancelForQuotationAsync(db, other.Id, now, $"Ersetzt durch {q.Number}", ct);
            await publicLinks.RevokeAllAsync(other.Id, ct);
        }
    }

    private static Quotation NewFrom(Quotation source, CurrentMember member, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        CompanyId = source.CompanyId,
        CustomerId = source.CustomerId,
        Number = source.Number,
        Title = source.Title,
        TaxMode = source.TaxMode,
        IntroText = source.IntroText,
        ClosingText = source.ClosingText,
        Terms = source.Terms,
        PaymentTerms = source.PaymentTerms,
        InternalNotes = source.InternalNotes,
        RecipientName = source.RecipientName,
        RecipientContact = source.RecipientContact,
        RecipientAddress = source.RecipientAddress,
        RecipientEmail = source.RecipientEmail,
        RecipientVatId = source.RecipientVatId,
        SourceTemplateId = source.SourceTemplateId,
        CreatedByUserId = member.UserId,
        CreatedAt = now,
        UpdatedAt = now,
    };

    private IQueryable<Quotation> Filter(IQueryable<Quotation> q, QuotationListQuery query)
    {
        if (query.Statuses is { Count: > 0 } statuses)
        {
            q = q.Where(x => statuses.Contains(x.Status));
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
            q = q.Where(x => EF.Functions.Like(x.Number, pattern, "\\") || EF.Functions.Like(x.Title, pattern, "\\")
                || EF.Functions.Like(x.RecipientName, pattern, "\\") || EF.Functions.Like(x.Customer!.CompanyName ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(x.Customer!.LastName ?? string.Empty, pattern, "\\"));
        }

        return q;
    }

    private IQueryable<QuotationListItemDto> Project(IQueryable<Quotation> q) =>
        q.Select(x => new QuotationListItemDto(
            x.Id, x.Number, x.Title, x.Status, x.CustomerId, x.RecipientName, x.IssueDate, x.ValidUntil, x.NetTotal, x.GrossTotal, x.SentAt, x.UpdatedAt,
            x.RevisionNumber, db.Jobs.Any(j => j.QuotationId == x.Id)));

    private async Task<QuotationDto> ToDtoAsync(Quotation q, CancellationToken ct)
    {
        var jobId = await db.Jobs.Where(j => j.QuotationId == q.Id).Select(j => (Guid?)j.Id).FirstOrDefaultAsync(ct);
        var now = clock.GetUtcNow();
        var link = await db.PublicQuotationAccesses.Where(a => a.QuotationId == q.Id)
            .GroupBy(a => a.QuotationId)
            .Select(g => new { Active = g.Any(a => a.RevokedAt == null && a.ExpiresAt > now), LastOpened = g.Max(a => a.LastOpenedAt) })
            .FirstOrDefaultAsync(ct);
        var rootId = q.RootQuotationId ?? q.Id;
        var revisions = await db.Quotations.AsNoTracking().Where(x => x.Id == rootId || x.RootQuotationId == rootId)
            .OrderBy(x => x.RevisionNumber).Select(x => new RevisionLinkDto(x.Id, x.Number, x.RevisionNumber, x.Status)).ToListAsync(ct);
        var customerName = q.Customer?.DisplayName ?? q.RecipientName;
        return new QuotationDto(
            q.Id, q.Number, q.Title, q.Status, q.CustomerId, customerName, q.RecipientName, q.RecipientContact, q.RecipientAddress, q.RecipientEmail, q.RecipientVatId,
            q.IssueDate, q.ValidUntil, q.TaxMode, q.IntroText, q.ClosingText, q.Terms, q.PaymentTerms, q.InternalNotes, q.Currency,
            q.LineItems.OrderBy(i => i.Position).Select(QuotationMapping.ToDto).ToList(),
            QuotationMapping.ToDto(q.CalculateTotals()),
            q.RevisionNumber, q.RootQuotationId, q.PreviousRevisionId, revisions.Count > 1 ? revisions : [],
            q.CreatedAt, q.UpdatedAt, q.SentAt, q.DecidedAt, q.DecidedByActor, q.DecisionName, q.DecisionNote, q.ExpiredAt, q.CancelledAt, q.CancellationReason,
            jobId, link?.Active ?? false, link?.LastOpened, QuotationMapping.AllowedActions(q, jobId is not null), RowVersions.Encode(q.RowVersion));
    }

    private async Task<Quotation> LoadAsync(Guid id, CancellationToken ct) =>
        await db.Quotations.Include(x => x.LineItems).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Das Angebot wurde nicht gefunden.");

    private async Task EnsureExistsAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Quotations.AnyAsync(x => x.Id == id, ct))
        {
            throw new NotFoundException("Das Angebot wurde nicht gefunden.");
        }
    }

    private async Task<(Company Company, CompanySettings Settings)> CompanyAsync(Guid companyId, CancellationToken ct)
    {
        var company = await db.Companies.AsNoTracking().Include(c => c.Settings).FirstAsync(c => c.Id == companyId, ct);
        return (company, company.Settings!);
    }

    private static NotFoundException NotFoundCustomer() => new("Der Kunde wurde nicht gefunden.");
}
