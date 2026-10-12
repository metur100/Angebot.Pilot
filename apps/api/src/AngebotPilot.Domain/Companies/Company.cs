using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Users;

namespace AngebotPilot.Domain.Companies;

public sealed class Company : Entity
{
    public required string Name { get; set; }

    public string? AddressLine1 { get; set; }

    public string? AddressLine2 { get; set; }

    public string? PostalCode { get; set; }

    public string? City { get; set; }

    /// <summary>ISO 3166-1 alpha-2 country code.</summary>
    public string Country { get; set; } = "DE";

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? Website { get; set; }

    /// <summary>USt-IdNr., only when the company has one.</summary>
    public string? VatId { get; set; }

    /// <summary>Steuernummer, optional.</summary>
    public string? TaxNumber { get; set; }

    public Guid? LogoFileId { get; set; }

    /// <summary>Hex colour such as #1F5EFF.</summary>
    public string BrandColor { get; set; } = "#1D4ED8";

    /// <summary>IANA time zone, e.g. Europe/Berlin.</summary>
    public string TimeZone { get; set; } = "Europe/Berlin";

    public string Language { get; set; } = "de-DE";

    /// <summary>Demo companies are created only by the explicit development seed process.</summary>
    public bool IsDemo { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public CompanySettings? Settings { get; set; }

    public List<CompanyMembership> Memberships { get; set; } = [];

    public byte[] RowVersion { get; set; } = [];
}

public sealed class CompanySettings
{
    public Guid CompanyId { get; set; }

    /// <summary>Prefix for quotation numbers, e.g. "AN" → AN-2026-0001.</summary>
    public string QuotationPrefix { get; set; } = "AN";

    public string JobPrefix { get; set; } = "AU";

    public int DefaultValidityDays { get; set; } = 30;

    public TaxMode DefaultTaxMode { get; set; } = TaxMode.Standard;

    public string? DefaultIntroText { get; set; }

    public string? DefaultClosingText { get; set; }

    public string? DefaultTerms { get; set; }

    public string? PaymentTerms { get; set; }

    public bool ShowBankDetails { get; set; }

    public string? BankAccountHolder { get; set; }

    public string? Iban { get; set; }

    public string? Bic { get; set; }

    public string? BankName { get; set; }

    public string? EmailSignature { get; set; }

    /// <summary>Optional reply-to address for customer emails; defaults to the company email.</summary>
    public string? ReplyToEmail { get; set; }

    public bool FirstReminderEnabled { get; set; } = true;

    public int FirstReminderAfterDays { get; set; } = 5;

    public bool SecondReminderEnabled { get; set; }

    public int SecondReminderAfterDays { get; set; } = 12;

    public bool ExpiryReminderEnabled { get; set; } = true;

    public int ExpiryReminderDaysBefore { get; set; } = 3;

    public bool AttachPdfToEmails { get; set; } = true;

    public bool NotifyOnCustomerDecision { get; set; } = true;
}

public sealed class CompanyMembership : Entity
{
    public Guid CompanyId { get; set; }

    public Company? Company { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public MembershipRole Role { get; set; }

    public MembershipStatus Status { get; set; }

    public DateTimeOffset JoinedAt { get; set; }

    public DateTimeOffset? DeactivatedAt { get; set; }

    public bool IsActive => Status == MembershipStatus.Active;
}

public sealed class Invitation : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Company? Company { get; set; }

    public required string Email { get; set; }

    public required string NormalizedEmail { get; set; }

    public MembershipRole Role { get; set; }

    public required string TokenHash { get; set; }

    public Guid InvitedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? AcceptedAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsOpen(DateTimeOffset now) => AcceptedAt is null && RevokedAt is null && ExpiresAt > now;
}

public sealed class TaxRate : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public required string Name { get; set; }

    /// <summary>Percentage, e.g. 19.00.</summary>
    public decimal RatePercent { get; set; }

    public bool IsDefault { get; set; }

    public bool IsArchived { get; set; }

    public int SortOrder { get; set; }
}

/// <summary>
/// Monotonic per-company counter for document numbers. Values are never decremented,
/// so numbers of deleted drafts are not reused.
/// </summary>
public sealed class DocumentSequence
{
    public Guid CompanyId { get; set; }

    public DocumentSequenceKind Kind { get; set; }

    public int Year { get; set; }

    public int LastValue { get; set; }
}
