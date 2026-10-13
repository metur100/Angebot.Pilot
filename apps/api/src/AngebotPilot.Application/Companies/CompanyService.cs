using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Auth;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Files;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AngebotPilot.Application.Companies;

/// <summary>Resolves the caller's membership for a company and binds the request to that tenant.</summary>
public sealed class CompanyAccess(IAppDbContext db, ITenantContext tenant)
{
    public async Task<CurrentMember> ResolveAsync(Guid userId, Guid companyId, CancellationToken ct)
    {
        var member = await db.Memberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.CompanyId == companyId && m.Status == MembershipStatus.Active && !m.User!.IsDisabled)
            .Select(m => new CurrentMember(m.UserId, m.CompanyId, m.Id, m.Role))
            .FirstOrDefaultAsync(ct);

        // 404 instead of 403 so foreign company ids cannot be probed.
        if (member is null)
        {
            throw new NotFoundException("Die Firma wurde nicht gefunden oder Sie haben keinen Zugriff.");
        }

        tenant.Set(companyId);
        return member;
    }
}

public sealed class CompanyService(
    IAppDbContext db,
    BillingService billing,
    FileService files,
    IEmailOutbox outbox,
    IEmailDispatchSignal dispatchSignal,
    IAuditLog audit,
    TimeProvider clock,
    IOptions<AppOptions> appOptions) : ICompanyDeletion
{
    private readonly AppOptions _app = appOptions.Value;

    public async Task<CompanyDto> CreateAsync(Guid userId, CreateCompanyRequest request, CancellationToken ct)
    {
        var ownedCompanies = await db.Memberships.CountAsync(m => m.UserId == userId && m.Role == MembershipRole.Owner, ct);
        if (ownedCompanies >= 5)
        {
            throw new ConflictException("company_limit", "Sie können höchstens 5 Firmen anlegen.");
        }

        var now = clock.GetUtcNow();
        var company = new Company
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            AddressLine1 = Text.Clean(request.AddressLine1),
            PostalCode = Text.Clean(request.PostalCode),
            City = Text.Clean(request.City),
            Country = Text.Upper(request.Country) ?? "DE",
            Email = Text.Clean(request.Email),
            Phone = Text.Clean(request.Phone),
            VatId = Text.Upper(request.VatId),
            CreatedAt = now,
        };
        company.Settings = new CompanySettings
        {
            CompanyId = company.Id,
            QuotationPrefix = Text.Upper(request.QuotationPrefix) ?? "AN",
            DefaultTaxMode = request.DefaultTaxMode,
            DefaultIntroText = "vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:",
            DefaultClosingText = "Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gern zur Verfügung.",
            PaymentTerms = "Zahlbar innerhalb von 14 Tagen nach Rechnungsstellung ohne Abzug.",
        };
        db.Companies.Add(company);
        db.Memberships.Add(new CompanyMembership { CompanyId = company.Id, UserId = userId, Role = MembershipRole.Owner, Status = MembershipStatus.Active, JoinedAt = now });

        // Common German VAT rates as a starting point. The user must confirm the correct treatment.
        db.TaxRates.AddRange(
            new TaxRate { CompanyId = company.Id, Name = "Regelsteuersatz", RatePercent = 19m, IsDefault = request.DefaultTaxMode == TaxMode.Standard, SortOrder = 0 },
            new TaxRate { CompanyId = company.Id, Name = "Ermäßigter Steuersatz", RatePercent = 7m, SortOrder = 1 },
            new TaxRate { CompanyId = company.Id, Name = "Steuerfrei / 0 %", RatePercent = 0m, IsDefault = request.DefaultTaxMode != TaxMode.Standard, SortOrder = 2 });
        db.Subscriptions.Add(BillingService.NewTrial(company.Id, now));
        audit.Record(company.Id, userId, "company.created", "Company", company.Id, company.Name);
        await db.SaveChangesAsync(ct);
        return ToDto(company, MembershipRole.Owner);
    }

    public async Task<CompanyDto> GetAsync(CurrentMember member, CancellationToken ct)
    {
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        return ToDto(company, member.Role);
    }

    public async Task<CompanyDto> UpdateAsync(CurrentMember member, UpdateCompanyRequest request, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var company = await db.Companies.FirstAsync(c => c.Id == member.CompanyId, ct);
        db.SetOriginalRowVersion(company, RowVersions.Decode(request.RowVersion));
        company.Name = request.Name.Trim();
        company.AddressLine1 = Text.Clean(request.AddressLine1);
        company.AddressLine2 = Text.Clean(request.AddressLine2);
        company.PostalCode = Text.Clean(request.PostalCode);
        company.City = Text.Clean(request.City);
        company.Country = request.Country.Trim().ToUpperInvariant();
        company.Email = Text.Clean(request.Email);
        company.Phone = Text.Clean(request.Phone);
        company.Website = Text.Clean(request.Website);
        company.VatId = Text.Upper(request.VatId);
        company.TaxNumber = Text.Clean(request.TaxNumber);
        company.BrandColor = request.BrandColor.ToUpperInvariant();
        company.TimeZone = request.TimeZone;
        company.Language = request.Language;
        audit.Record(member.CompanyId, member.UserId, "company.updated", "Company", company.Id, null);
        await db.SaveChangesAsync(ct);
        return ToDto(company, member.Role);
    }

    public async Task<CompanySettingsDto> GetSettingsAsync(CurrentMember member, CancellationToken ct)
    {
        var s = await db.CompanySettings.AsNoTracking().FirstAsync(x => x.CompanyId == member.CompanyId, ct);
        return ToDto(s);
    }

    public async Task<CompanySettingsDto> UpdateSettingsAsync(CurrentMember member, CompanySettingsDto dto, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var s = await db.CompanySettings.FirstAsync(x => x.CompanyId == member.CompanyId, ct);
        s.QuotationPrefix = dto.QuotationPrefix.Trim().ToUpperInvariant();
        s.JobPrefix = dto.JobPrefix.Trim().ToUpperInvariant();
        s.DefaultValidityDays = dto.DefaultValidityDays;
        s.DefaultTaxMode = dto.DefaultTaxMode;
        s.DefaultIntroText = Text.Clean(dto.DefaultIntroText);
        s.DefaultClosingText = Text.Clean(dto.DefaultClosingText);
        s.DefaultTerms = Text.Clean(dto.DefaultTerms);
        s.PaymentTerms = Text.Clean(dto.PaymentTerms);
        s.ShowBankDetails = dto.ShowBankDetails;
        s.BankAccountHolder = Text.Clean(dto.BankAccountHolder);
        s.Iban = Text.Upper(dto.Iban);
        s.Bic = Text.Upper(dto.Bic);
        s.BankName = Text.Clean(dto.BankName);
        s.EmailSignature = Text.Clean(dto.EmailSignature);
        s.ReplyToEmail = Text.Clean(dto.ReplyToEmail);
        s.FirstReminderEnabled = dto.FirstReminderEnabled;
        s.FirstReminderAfterDays = dto.FirstReminderAfterDays;
        s.SecondReminderEnabled = dto.SecondReminderEnabled;
        s.SecondReminderAfterDays = dto.SecondReminderAfterDays;
        s.ExpiryReminderEnabled = dto.ExpiryReminderEnabled;
        s.ExpiryReminderDaysBefore = dto.ExpiryReminderDaysBefore;
        s.AttachPdfToEmails = dto.AttachPdfToEmails;
        s.NotifyOnCustomerDecision = dto.NotifyOnCustomerDecision;
        if (dto.InvoicePrefix is not null)
        {
            s.InvoicePrefix = dto.InvoicePrefix.Trim().ToUpperInvariant();
        }

        s.InvoicePaymentDays = dto.InvoicePaymentDays ?? s.InvoicePaymentDays;
        if (dto.InvoiceIntroText is not null)
        {
            s.InvoiceIntroText = Text.Clean(dto.InvoiceIntroText);
        }

        if (dto.InvoiceClosingText is not null)
        {
            s.InvoiceClosingText = Text.Clean(dto.InvoiceClosingText);
        }

        s.InvoiceReminderEnabled = dto.InvoiceReminderEnabled ?? s.InvoiceReminderEnabled;
        s.InvoiceReminderAfterDays = dto.InvoiceReminderAfterDays ?? s.InvoiceReminderAfterDays;
        audit.Record(member.CompanyId, member.UserId, "company.settings_updated", "CompanySettings", member.CompanyId, null);
        await db.SaveChangesAsync(ct);
        return ToDto(s);
    }

    // ---------- Logo ----------
    public async Task<CompanyDto> UploadLogoAsync(CurrentMember member, UploadedFile upload, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var file = await files.SaveLogoAsync(member.CompanyId, member.UserId, upload, ct);
        var company = await db.Companies.FirstAsync(c => c.Id == member.CompanyId, ct);
        var previous = company.LogoFileId;
        company.LogoFileId = file.Id;
        if (previous is not null)
        {
            await files.DeleteAsync(member.CompanyId, previous.Value, ct);
        }

        audit.Record(member.CompanyId, member.UserId, "company.logo_uploaded", "File", file.Id, null);
        await db.SaveChangesAsync(ct);
        return ToDto(company, member.Role);
    }

    public async Task<CompanyDto> DeleteLogoAsync(CurrentMember member, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var company = await db.Companies.FirstAsync(c => c.Id == member.CompanyId, ct);
        if (company.LogoFileId is { } fileId)
        {
            company.LogoFileId = null;
            await files.DeleteAsync(member.CompanyId, fileId, ct);
            audit.Record(member.CompanyId, member.UserId, "company.logo_deleted", "File", fileId, null);
            await db.SaveChangesAsync(ct);
        }

        return ToDto(company, member.Role);
    }

    public async Task<(Stream Content, string ContentType)?> GetLogoAsync(Guid companyId, CancellationToken ct)
    {
        var logoId = await db.Companies.AsNoTracking().Where(c => c.Id == companyId).Select(c => c.LogoFileId).FirstOrDefaultAsync(ct);
        if (logoId is null)
        {
            return null;
        }

        var opened = await files.OpenAsync(companyId, logoId.Value, ct);
        return opened is null ? null : (opened.Value.Content.Content, opened.Value.File.ContentType);
    }

    // ---------- Tax rates ----------
    public async Task<IReadOnlyList<TaxRateDto>> TaxRatesAsync(CancellationToken ct) =>
        await db.TaxRates.AsNoTracking().OrderBy(t => t.IsArchived).ThenBy(t => t.SortOrder).ThenByDescending(t => t.RatePercent)
            .Select(t => new TaxRateDto(t.Id, t.Name, t.RatePercent, t.IsDefault, t.IsArchived)).ToListAsync(ct);

    public async Task<TaxRateDto> UpsertTaxRateAsync(CurrentMember member, Guid? id, UpsertTaxRateRequest request, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        TaxRate rate;
        if (id is null)
        {
            rate = new TaxRate { CompanyId = member.CompanyId, Name = request.Name.Trim(), SortOrder = await db.TaxRates.CountAsync(ct) };
            db.TaxRates.Add(rate);
        }
        else
        {
            rate = await db.TaxRates.FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw new NotFoundException();
        }

        rate.Name = request.Name.Trim();
        rate.RatePercent = request.RatePercent;
        rate.IsArchived = request.IsArchived;
        rate.IsDefault = request.IsDefault;
        if (rate.IsDefault)
        {
            await foreach (var other in db.TaxRates.Where(t => t.Id != rate.Id && t.IsDefault).AsAsyncEnumerable().WithCancellation(ct))
            {
                other.IsDefault = false;
            }
        }

        audit.Record(member.CompanyId, member.UserId, "company.tax_rate_saved", "TaxRate", rate.Id, $"{rate.Name} {rate.RatePercent} %");
        await db.SaveChangesAsync(ct);
        return new TaxRateDto(rate.Id, rate.Name, rate.RatePercent, rate.IsDefault, rate.IsArchived);
    }

    // ---------- Members ----------
    public async Task<IReadOnlyList<MemberDto>> MembersAsync(CurrentMember member, CancellationToken ct) =>
        await db.Memberships.AsNoTracking().Where(m => m.CompanyId == member.CompanyId)
            .OrderBy(m => m.Status).ThenByDescending(m => m.Role).ThenBy(m => m.User!.DisplayName)
            .Select(m => new MemberDto(m.Id, m.UserId, m.User!.DisplayName, m.User.Email, m.Role, m.Status, m.JoinedAt))
            .ToListAsync(ct);

    public async Task<MemberDto> UpdateMemberRoleAsync(CurrentMember member, Guid membershipId, MembershipRole role, CancellationToken ct)
    {
        if (!Enum.IsDefined(role))
        {
            throw new ForbiddenException("Unbekannte Rolle.");
        }

        member.Require(MembershipRole.Admin);
        var target = await LoadMemberAsync(member, membershipId, ct);
        if (role == MembershipRole.Owner || target.Role == MembershipRole.Owner)
        {
            member.Require(MembershipRole.Owner, "Nur Inhaber:innen können die Inhaberrolle vergeben oder entziehen.");
        }

        if (target.Role == MembershipRole.Owner && role != MembershipRole.Owner)
        {
            await EnsureAnotherOwnerAsync(member.CompanyId, target.Id, ct);
        }

        target.Role = role;
        audit.Record(member.CompanyId, member.UserId, "member.role_changed", "Membership", target.Id, role.ToString());
        await db.SaveChangesAsync(ct);
        return await MemberDtoAsync(target.Id, ct);
    }

    public async Task<MemberDto> SetMemberActiveAsync(CurrentMember member, Guid membershipId, bool active, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var target = await LoadMemberAsync(member, membershipId, ct);
        if (target.Role == MembershipRole.Owner)
        {
            member.Require(MembershipRole.Owner);
        }

        if (!active)
        {
            if (target.UserId == member.UserId)
            {
                throw new ConflictException("cannot_deactivate_self", "Sie können sich nicht selbst deaktivieren.");
            }

            if (target.Role == MembershipRole.Owner)
            {
                await EnsureAnotherOwnerAsync(member.CompanyId, target.Id, ct);
            }

            target.Status = MembershipStatus.Deactivated;
            target.DeactivatedAt = clock.GetUtcNow();
            await db.Jobs.Where(j => j.AssignedUserId == target.UserId && (j.Status == JobStatus.Open || j.Status == JobStatus.InProgress))
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.AssignedUserId, (Guid?)null), ct);
        }
        else if (target.Status != MembershipStatus.Active)
        {
            await billing.EnsureCanAddMemberAsync(member.CompanyId, ct);
            target.Status = MembershipStatus.Active;
            target.DeactivatedAt = null;
        }

        audit.Record(member.CompanyId, member.UserId, active ? "member.reactivated" : "member.deactivated", "Membership", target.Id, null);
        await db.SaveChangesAsync(ct);
        return await MemberDtoAsync(target.Id, ct);
    }

    // ---------- Invitations ----------
    public async Task<IReadOnlyList<InvitationDto>> InvitationsAsync(CurrentMember member, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var now = clock.GetUtcNow();
        return await db.Invitations.AsNoTracking().Where(i => i.AcceptedAt == null && i.RevokedAt == null)
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new InvitationDto(i.Id, i.Email, i.Role, i.CreatedAt, i.ExpiresAt, i.ExpiresAt <= now))
            .ToListAsync(ct);
    }

    public async Task<InvitationDto> InviteAsync(CurrentMember member, CreateInvitationRequest request, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        if (request.Role == MembershipRole.Admin)
        {
            member.Require(MembershipRole.Admin);
        }

        var normalized = User.Normalize(request.Email);
        var now = clock.GetUtcNow();
        if (await db.Memberships.AnyAsync(m => m.CompanyId == member.CompanyId && m.User!.NormalizedEmail == normalized, ct))
        {
            throw new ConflictException("already_member", "Diese Person ist bereits Mitglied der Firma.");
        }

        // Re-inviting replaces an open invitation.
        await db.Invitations.Where(i => i.NormalizedEmail == normalized && i.AcceptedAt == null && i.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.RevokedAt, now), ct);
        await billing.EnsureCanAddMemberAsync(member.CompanyId, ct);

        var token = SecureTokens.Create();
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            CompanyId = member.CompanyId,
            Email = request.Email.Trim(),
            NormalizedEmail = normalized,
            Role = request.Role,
            TokenHash = SecureTokens.Hash(token),
            InvitedByUserId = member.UserId,
            CreatedAt = now,
            ExpiresAt = now.AddDays(7),
        };
        db.Invitations.Add(invitation);
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        var inviter = await db.Users.AsNoTracking().Where(u => u.Id == member.UserId).Select(u => u.DisplayName).FirstAsync(ct);
        var roleLabel = request.Role == MembershipRole.Admin ? "Administrator:in" : "Mitarbeiter:in";
        var content = EmailTemplates.Invitation(company.Name, inviter, roleLabel, _app.WebUrl($"invite?token={token}"), _app.ProductName);
        await outbox.EnqueueAsync(new EnqueueEmail(member.CompanyId, null, EmailKind.Invitation, $"invitation:{invitation.Id:N}", invitation.Email, content, CreatedByUserId: member.UserId), ct);
        audit.Record(member.CompanyId, member.UserId, "member.invited", "Invitation", invitation.Id, $"{invitation.Email} als {request.Role}");
        await db.SaveChangesAsync(ct);
        dispatchSignal.Notify();
        return new InvitationDto(invitation.Id, invitation.Email, invitation.Role, invitation.CreatedAt, invitation.ExpiresAt, false);
    }

    public async Task RevokeInvitationAsync(CurrentMember member, Guid invitationId, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var invitation = await db.Invitations.FirstOrDefaultAsync(i => i.Id == invitationId, ct) ?? throw new NotFoundException();
        invitation.RevokedAt ??= clock.GetUtcNow();
        audit.Record(member.CompanyId, member.UserId, "member.invitation_revoked", "Invitation", invitation.Id, null);
        await db.SaveChangesAsync(ct);
    }

    public async Task<InvitationPreviewDto> PreviewInvitationAsync(string token, CancellationToken ct)
    {
        var invitation = await FindOpenInvitationAsync(token, ct);
        var companyName = await db.Companies.AsNoTracking().Where(c => c.Id == invitation.CompanyId).Select(c => c.Name).FirstAsync(ct);
        return new InvitationPreviewDto(companyName, MaskEmail(invitation.Email), invitation.Role, invitation.ExpiresAt);
    }

    public async Task AcceptInvitationAsync(Guid userId, string token, CancellationToken ct)
    {
        var invitation = await FindOpenInvitationAsync(token, ct);
        var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
        if (user.NormalizedEmail != invitation.NormalizedEmail)
        {
            throw new ForbiddenException("Diese Einladung wurde an eine andere E-Mail-Adresse gesendet. Bitte melden Sie sich mit dieser Adresse an.");
        }

        var now = clock.GetUtcNow();
        var existing = await db.Memberships.FirstOrDefaultAsync(m => m.CompanyId == invitation.CompanyId && m.UserId == userId, ct);
        if (existing is null)
        {
            db.Memberships.Add(new CompanyMembership { CompanyId = invitation.CompanyId, UserId = userId, Role = invitation.Role, Status = MembershipStatus.Active, JoinedAt = now });
        }
        else
        {
            existing.Status = MembershipStatus.Active;
            existing.Role = invitation.Role;
            existing.DeactivatedAt = null;
        }

        invitation.AcceptedAt = now;
        // Accepting an emailed invitation proves control of the address.
        user.EmailVerifiedAt ??= now;
        audit.Record(invitation.CompanyId, userId, "member.joined", "Invitation", invitation.Id, null);
        await db.SaveChangesAsync(ct);
    }

    // ---------- Deletion & export ----------
    public async Task DeleteCompanyAsync(CurrentMember member, string confirmName, CancellationToken ct)
    {
        member.Require(MembershipRole.Owner);
        var company = await db.Companies.AsNoTracking().FirstAsync(c => c.Id == member.CompanyId, ct);
        if (!string.Equals(company.Name.Trim(), confirmName.Trim(), StringComparison.Ordinal))
        {
            throw new FluentValidation.ValidationException([new FluentValidation.Results.ValidationFailure("confirmName", "Der eingegebene Name stimmt nicht mit dem Firmennamen überein.")]);
        }

        await DeleteCompanyDataAsync(member.CompanyId, ct);
        audit.Record(null, member.UserId, "company.deleted", "Company", member.CompanyId, null);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Removes all rows and stored objects of a company. Audit events are kept without company reference.</summary>
    public async Task DeleteCompanyDataAsync(Guid companyId, CancellationToken ct)
    {
        // Atomic unless the caller already opened a transaction.
        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var fileIds = await db.Files.IgnoreQueryFilters().Where(f => f.CompanyId == companyId && f.Status != FileStatus.Deleted).Select(f => f.Id).ToListAsync(ct);
        foreach (var id in fileIds)
        {
            await files.DeleteAsync(companyId, id, ct);
        }

        await db.SaveChangesAsync(ct);
        await db.InvoicePayments.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.InvoiceEvents.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.InvoiceLineItems.Where(x => db.Invoices.IgnoreQueryFilters().Any(i => i.Id == x.InvoiceId && i.CompanyId == companyId)).ExecuteDeleteAsync(ct);
        await db.Invoices.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Jobs.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.FollowUpSchedules.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.PublicQuotationAccesses.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.QuotationEvents.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.QuotationLineItems.Where(x => db.Quotations.IgnoreQueryFilters().Any(q => q.Id == x.QuotationId && q.CompanyId == companyId)).ExecuteDeleteAsync(ct);
        await db.Quotations.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Templates.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Customers.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.EmailDeliveries.Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Notifications.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Invitations.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.TaxRates.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Files.IgnoreQueryFilters().Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.DocumentSequences.Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Subscriptions.Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.Memberships.Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.CompanySettings.Where(x => x.CompanyId == companyId).ExecuteDeleteAsync(ct);
        await db.AuditEvents.Where(x => x.CompanyId == companyId).ExecuteUpdateAsync(s => s.SetProperty(a => a.CompanyId, (Guid?)null), ct);
        await db.Companies.Where(x => x.Id == companyId).ExecuteDeleteAsync(ct);
        if (tx is not null)
        {
            await tx.CommitAsync(ct);
        }
    }

    /// <summary>Full export of company data as structured JSON (GDPR Art. 20 / customer data return).</summary>
    public async Task<object> ExportAsync(CurrentMember member, CancellationToken ct)
    {
        member.Require(MembershipRole.Owner);
        var company = await db.Companies.AsNoTracking().Include(c => c.Settings).FirstAsync(c => c.Id == member.CompanyId, ct);
        return new
        {
            ExportedAt = clock.GetUtcNow(),
            Format = "AngebotPilot-Export v1",
            Company = new { company.Name, company.AddressLine1, company.AddressLine2, company.PostalCode, company.City, company.Country, company.Email, company.Phone, company.Website, company.VatId, company.TaxNumber, company.BrandColor, company.TimeZone, company.CreatedAt },
            Settings = company.Settings is null ? null : ToDto(company.Settings),
            TaxRates = await db.TaxRates.AsNoTracking().Select(t => new { t.Name, t.RatePercent, t.IsDefault, t.IsArchived }).ToListAsync(ct),
            Members = await db.Memberships.AsNoTracking().Where(m => m.CompanyId == member.CompanyId).Select(m => new { m.User!.DisplayName, m.User.Email, Role = m.Role.ToString(), Status = m.Status.ToString(), m.JoinedAt }).ToListAsync(ct),
            Customers = await db.Customers.AsNoTracking().OrderBy(c => c.CreatedAt).ToListAsync(ct),
            Quotations = await db.Quotations.AsNoTracking().Include(q => q.LineItems).Include(q => q.Events).OrderBy(q => q.CreatedAt).ToListAsync(ct),
            Jobs = await db.Jobs.AsNoTracking().OrderBy(j => j.CreatedAt).ToListAsync(ct),
            Invoices = await db.Invoices.AsNoTracking().Include(i => i.LineItems).Include(i => i.Payments).Include(i => i.Events).OrderBy(i => i.CreatedAt).ToListAsync(ct),
            Templates = await db.Templates.AsNoTracking().Include(t => t.LineItems).ToListAsync(ct),
            EmailDeliveries = await db.EmailDeliveries.AsNoTracking().Where(e => e.CompanyId == member.CompanyId)
                .Select(e => new { e.Kind, e.ToAddress, e.Subject, e.Status, e.CreatedAt, e.HandedOffAt }).ToListAsync(ct),
        };
    }

    public static CompanyDto ToDto(Company c, MembershipRole role) => new(
        c.Id, c.Name, c.AddressLine1, c.AddressLine2, c.PostalCode, c.City, c.Country, c.Email, c.Phone, c.Website,
        c.VatId, c.TaxNumber, c.BrandColor, c.TimeZone, c.Language, c.LogoFileId is not null, c.IsDemo, role, RowVersions.Encode(c.RowVersion));

    public static CompanySettingsDto ToDto(CompanySettings s) => new(
        s.QuotationPrefix, s.JobPrefix, s.DefaultValidityDays, s.DefaultTaxMode, s.DefaultIntroText, s.DefaultClosingText, s.DefaultTerms,
        s.PaymentTerms, s.ShowBankDetails, s.BankAccountHolder, s.Iban, s.Bic, s.BankName, s.EmailSignature, s.ReplyToEmail,
        s.FirstReminderEnabled, s.FirstReminderAfterDays, s.SecondReminderEnabled, s.SecondReminderAfterDays,
        s.ExpiryReminderEnabled, s.ExpiryReminderDaysBefore, s.AttachPdfToEmails, s.NotifyOnCustomerDecision,
        s.InvoicePrefix, s.InvoicePaymentDays, s.InvoiceIntroText, s.InvoiceClosingText, s.InvoiceReminderEnabled, s.InvoiceReminderAfterDays);

    private async Task<CompanyMembership> LoadMemberAsync(CurrentMember member, Guid membershipId, CancellationToken ct) =>
        await db.Memberships.FirstOrDefaultAsync(m => m.Id == membershipId && m.CompanyId == member.CompanyId, ct) ?? throw new NotFoundException();

    private async Task EnsureAnotherOwnerAsync(Guid companyId, Guid exceptMembershipId, CancellationToken ct)
    {
        var others = await db.Memberships.CountAsync(m => m.CompanyId == companyId && m.Id != exceptMembershipId && m.Role == MembershipRole.Owner && m.Status == MembershipStatus.Active, ct);
        if (others == 0)
        {
            throw new ConflictException("last_owner", "Eine Firma braucht mindestens eine aktive Inhaberin bzw. einen aktiven Inhaber.");
        }
    }

    private async Task<MemberDto> MemberDtoAsync(Guid membershipId, CancellationToken ct) =>
        await db.Memberships.AsNoTracking().Where(m => m.Id == membershipId)
            .Select(m => new MemberDto(m.Id, m.UserId, m.User!.DisplayName, m.User.Email, m.Role, m.Status, m.JoinedAt)).FirstAsync(ct);

    private async Task<Invitation> FindOpenInvitationAsync(string token, CancellationToken ct)
    {
        if (!SecureTokens.LooksValid(token))
        {
            throw new GoneException("Die Einladung ist ungültig oder abgelaufen.");
        }

        var hash = SecureTokens.Hash(token);
        var invitation = await db.Invitations.IgnoreQueryFilters().FirstOrDefaultAsync(i => i.TokenHash == hash, ct);
        if (invitation is null || !invitation.IsOpen(clock.GetUtcNow()))
        {
            throw new GoneException("Die Einladung ist ungültig oder abgelaufen.");
        }

        return invitation;
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        return at <= 1 ? email : $"{email[0]}***{email[(at - 1)..]}";
    }
}
