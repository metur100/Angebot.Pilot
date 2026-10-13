using AngebotPilot.Domain;

namespace AngebotPilot.Application.Contracts;

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

// ---------- Auth ----------
/// <summary><c>Language</c> ("de"/"en") is the initial UI language and the language of account emails; omitted = German.</summary>
public sealed record RegisterRequest(string Email, string Password, string DisplayName, bool AcceptTerms, ClientKind Client = ClientKind.Web, string? Language = null);

public sealed record LoginRequest(string Email, string Password, ClientKind Client = ClientKind.Web);

public sealed record RefreshRequest(string? RefreshToken);

public sealed record LogoutRequest(string? RefreshToken);

public sealed record ForgotPasswordRequest(string Email);

public sealed record ResetPasswordRequest(string Token, string NewPassword);

public sealed record VerifyEmailRequest(string Token);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <summary><c>Language</c> is optional so older clients keep working; omitted = unchanged.</summary>
public sealed record UpdateProfileRequest(string DisplayName, string? Language = null);

public sealed record DeleteAccountRequest(string Password);

/// <summary>The refresh token is only returned in the body for mobile clients; web clients receive an HttpOnly cookie.</summary>
public sealed record AuthResponse(string AccessToken, DateTimeOffset AccessTokenExpiresAt, string? RefreshToken, DateTimeOffset RefreshTokenExpiresAt, MeDto User);

public sealed record MeDto(Guid Id, string Email, string DisplayName, bool EmailVerified, string Language, IReadOnlyList<MembershipDto> Companies);

public sealed record MembershipDto(Guid CompanyId, string CompanyName, MembershipRole Role, Guid MembershipId, bool IsDemo);

public sealed record InvitationPreviewDto(string CompanyName, string Email, MembershipRole Role, DateTimeOffset ExpiresAt);

public sealed record AcceptInvitationRequest(string Token);

// ---------- Company ----------
public sealed record CreateCompanyRequest(
    string Name,
    string? AddressLine1,
    string? PostalCode,
    string? City,
    string? Country,
    string? Email,
    string? Phone,
    string? VatId,
    TaxMode DefaultTaxMode,
    string? QuotationPrefix);

public sealed record CompanyDto(
    Guid Id,
    string Name,
    string? AddressLine1,
    string? AddressLine2,
    string? PostalCode,
    string? City,
    string Country,
    string? Email,
    string? Phone,
    string? Website,
    string? VatId,
    string? TaxNumber,
    string BrandColor,
    string TimeZone,
    string Language,
    bool HasLogo,
    bool IsDemo,
    MembershipRole MyRole,
    string RowVersion);

public sealed record UpdateCompanyRequest(
    string Name,
    string? AddressLine1,
    string? AddressLine2,
    string? PostalCode,
    string? City,
    string Country,
    string? Email,
    string? Phone,
    string? Website,
    string? VatId,
    string? TaxNumber,
    string BrandColor,
    string TimeZone,
    string Language,
    string RowVersion);

public sealed record CompanySettingsDto(
    string QuotationPrefix,
    string JobPrefix,
    int DefaultValidityDays,
    TaxMode DefaultTaxMode,
    string? DefaultIntroText,
    string? DefaultClosingText,
    string? DefaultTerms,
    string? PaymentTerms,
    bool ShowBankDetails,
    string? BankAccountHolder,
    string? Iban,
    string? Bic,
    string? BankName,
    string? EmailSignature,
    string? ReplyToEmail,
    bool FirstReminderEnabled,
    int FirstReminderAfterDays,
    bool SecondReminderEnabled,
    int SecondReminderAfterDays,
    bool ExpiryReminderEnabled,
    int ExpiryReminderDaysBefore,
    bool AttachPdfToEmails,
    bool NotifyOnCustomerDecision,
    // Invoice settings are optional on input so older clients that do not know them leave them unchanged.
    string? InvoicePrefix = null,
    int? InvoicePaymentDays = null,
    string? InvoiceIntroText = null,
    string? InvoiceClosingText = null,
    bool? InvoiceReminderEnabled = null,
    int? InvoiceReminderAfterDays = null);

public sealed record TaxRateDto(Guid Id, string Name, decimal RatePercent, bool IsDefault, bool IsArchived);

public sealed record UpsertTaxRateRequest(string Name, decimal RatePercent, bool IsDefault, bool IsArchived);

public sealed record MemberDto(Guid MembershipId, Guid UserId, string DisplayName, string Email, MembershipRole Role, MembershipStatus Status, DateTimeOffset JoinedAt);

public sealed record UpdateMemberRequest(MembershipRole Role);

public sealed record InvitationDto(Guid Id, string Email, MembershipRole Role, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, bool IsExpired);

public sealed record CreateInvitationRequest(string Email, MembershipRole Role);

public sealed record DeleteCompanyRequest(string ConfirmName);

// ---------- Customers ----------
public sealed record CustomerListItemDto(
    Guid Id,
    CustomerType Type,
    string DisplayName,
    string? ContactPerson,
    string? Email,
    string? Phone,
    string? City,
    bool IsArchived,
    int QuotationCount,
    decimal AcceptedValue,
    DateTimeOffset CreatedAt);

public sealed record CustomerDto(
    Guid Id,
    CustomerType Type,
    string DisplayName,
    string? CompanyName,
    string? Salutation,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? BillingStreet,
    string? BillingPostalCode,
    string? BillingCity,
    string BillingCountry,
    bool HasServiceAddress,
    string? ServiceStreet,
    string? ServicePostalCode,
    string? ServiceCity,
    string? ServiceCountry,
    string? VatId,
    string? Notes,
    bool FollowUpOptOut,
    bool IsArchived,
    bool IsAnonymized,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string RowVersion);

public sealed record UpsertCustomerRequest(
    CustomerType Type,
    string? CompanyName,
    string? Salutation,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? BillingStreet,
    string? BillingPostalCode,
    string? BillingCity,
    string? BillingCountry,
    bool HasServiceAddress,
    string? ServiceStreet,
    string? ServicePostalCode,
    string? ServiceCity,
    string? ServiceCountry,
    string? VatId,
    string? Notes,
    bool FollowUpOptOut,
    string? RowVersion);

// ---------- Quotations ----------
public sealed record LineItemInput(
    string Title,
    string? Description,
    decimal Quantity,
    string Unit,
    decimal UnitPriceNet,
    decimal DiscountPercent,
    decimal TaxRatePercent);

public sealed record LineItemDto(
    Guid Id,
    int Position,
    string Title,
    string? Description,
    decimal Quantity,
    string Unit,
    decimal UnitPriceNet,
    decimal DiscountPercent,
    decimal TaxRatePercent,
    decimal LineTotalBeforeDiscount,
    decimal LineDiscount,
    decimal LineNet);

public sealed record TaxGroupDto(decimal RatePercent, decimal NetAmount, decimal TaxAmount);

public sealed record TotalsDto(decimal SubtotalBeforeDiscount, decimal DiscountTotal, decimal NetTotal, IReadOnlyList<TaxGroupDto> TaxGroups, decimal TaxTotal, decimal GrossTotal);

public sealed record CalculateRequest(TaxMode TaxMode, IReadOnlyList<LineItemInput> LineItems);

public sealed record CreateQuotationRequest(
    Guid CustomerId,
    string? Title,
    Guid? TemplateId,
    DateOnly? IssueDate,
    DateOnly? ValidUntil,
    TaxMode? TaxMode,
    string? IntroText,
    string? ClosingText,
    string? Terms,
    string? PaymentTerms,
    string? InternalNotes,
    IReadOnlyList<LineItemInput>? LineItems);

public sealed record UpdateQuotationRequest(
    Guid CustomerId,
    string Title,
    DateOnly IssueDate,
    DateOnly ValidUntil,
    TaxMode TaxMode,
    string? IntroText,
    string? ClosingText,
    string? Terms,
    string? PaymentTerms,
    string? InternalNotes,
    IReadOnlyList<LineItemInput> LineItems,
    string RowVersion);

public sealed record QuotationListItemDto(
    Guid Id,
    string Number,
    string Title,
    QuotationStatus Status,
    Guid CustomerId,
    string CustomerName,
    DateOnly IssueDate,
    DateOnly ValidUntil,
    decimal NetTotal,
    decimal GrossTotal,
    DateTimeOffset? SentAt,
    DateTimeOffset UpdatedAt,
    int RevisionNumber,
    bool HasJob);

public sealed record QuotationDto(
    Guid Id,
    string Number,
    string Title,
    QuotationStatus Status,
    Guid CustomerId,
    string CustomerName,
    string RecipientName,
    string? RecipientContact,
    string? RecipientAddress,
    string? RecipientEmail,
    string? RecipientVatId,
    DateOnly IssueDate,
    DateOnly ValidUntil,
    TaxMode TaxMode,
    string? IntroText,
    string? ClosingText,
    string? Terms,
    string? PaymentTerms,
    string? InternalNotes,
    string Currency,
    IReadOnlyList<LineItemDto> LineItems,
    TotalsDto Totals,
    int RevisionNumber,
    Guid? RootQuotationId,
    Guid? PreviousRevisionId,
    IReadOnlyList<RevisionLinkDto> Revisions,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? SentAt,
    DateTimeOffset? DecidedAt,
    ActorType? DecidedByActor,
    string? DecisionName,
    string? DecisionNote,
    DateTimeOffset? ExpiredAt,
    DateTimeOffset? CancelledAt,
    string? CancellationReason,
    Guid? JobId,
    bool HasActivePublicLink,
    DateTimeOffset? PublicLinkLastOpenedAt,
    IReadOnlyList<QuotationStatus> AllowedTransitions,
    string RowVersion,
    IReadOnlyList<InvoiceLinkDto> Invoices);

public sealed record RevisionLinkDto(Guid Id, string Number, int RevisionNumber, QuotationStatus Status);

public enum SendMode
{
    Email = 0,
    Manual = 1,
}

public sealed record SendQuotationRequest(
    SendMode Mode,
    string? RecipientEmail,
    string? Subject,
    string? Message,
    bool? AttachPdf,
    bool IncludePublicLink,
    bool ScheduleFollowUps);

public sealed record SendQuotationResponse(QuotationDto Quotation, string? PublicUrl, Guid? EmailDeliveryId);

public sealed record DecisionRequest(string? Note);

public sealed record CancelRequest(string? Reason);

public sealed record PublicLinkResponse(string Url, DateTimeOffset ExpiresAt);

public sealed record QuotationEventDto(Guid Id, QuotationEventType Type, DateTimeOffset OccurredAt, ActorType ActorType, string? ActorName, string? Details);

public sealed record EmailDeliveryDto(
    Guid Id,
    EmailKind Kind,
    string ToAddress,
    string Subject,
    EmailStatus Status,
    int Attempts,
    DateTimeOffset CreatedAt,
    DateTimeOffset? HandedOffAt,
    DateTimeOffset? NextAttemptAt,
    string? LastError);

public sealed record FollowUpDto(Guid Id, FollowUpKind Kind, DateTimeOffset DueAt, FollowUpStatus Status, string? StatusReason, DateTimeOffset? ProcessedAt);

public sealed record LookupByTokenRequest(string Token);

public sealed record LookupByTokenResponse(Guid QuotationId);

// ---------- Jobs ----------
public sealed record ConvertToJobRequest(string? Title, string? Description, DateOnly? PlannedStartDate, DateOnly? DueDate, Guid? AssignedUserId, string? Notes);

public sealed record JobListItemDto(
    Guid Id,
    string Number,
    string Title,
    JobStatus Status,
    Guid CustomerId,
    string CustomerName,
    Guid QuotationId,
    string QuotationNumber,
    DateOnly? PlannedStartDate,
    DateOnly? DueDate,
    Guid? AssignedUserId,
    string? AssignedUserName,
    decimal NetValue,
    DateTimeOffset CreatedAt);

public sealed record JobDto(
    Guid Id,
    string Number,
    string Title,
    string? Description,
    JobStatus Status,
    Guid CustomerId,
    string CustomerName,
    Guid QuotationId,
    string QuotationNumber,
    decimal QuotationNetTotal,
    decimal QuotationGrossTotal,
    DateOnly? PlannedStartDate,
    DateOnly? DueDate,
    Guid? AssignedUserId,
    string? AssignedUserName,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    DateTimeOffset? CancelledAt,
    IReadOnlyList<JobStatus> AllowedTransitions,
    string RowVersion,
    IReadOnlyList<InvoiceLinkDto> Invoices);

public sealed record UpdateJobRequest(string Title, string? Description, DateOnly? PlannedStartDate, DateOnly? DueDate, Guid? AssignedUserId, string? Notes, string RowVersion);

public sealed record ChangeJobStatusRequest(JobStatus Status);

// ---------- Invoices ----------
public sealed record CreateInvoiceRequest(
    Guid CustomerId,
    string? Title,
    DateOnly? IssueDate,
    DateOnly? ServiceDateFrom,
    DateOnly? ServiceDateTo,
    DateOnly? DueDate,
    TaxMode? TaxMode,
    string? IntroText,
    string? ClosingText,
    string? PaymentTerms,
    string? BuyerReference,
    string? InternalNotes,
    IReadOnlyList<LineItemInput>? LineItems);

public sealed record UpdateInvoiceRequest(
    Guid CustomerId,
    string Title,
    DateOnly IssueDate,
    DateOnly? ServiceDateFrom,
    DateOnly? ServiceDateTo,
    DateOnly DueDate,
    TaxMode TaxMode,
    string? IntroText,
    string? ClosingText,
    string? PaymentTerms,
    string? BuyerReference,
    string? InternalNotes,
    IReadOnlyList<LineItemInput> LineItems,
    string RowVersion);

public sealed record InvoiceListItemDto(
    Guid Id,
    string? Number,
    InvoiceKind Kind,
    InvoiceStatus Status,
    string Title,
    Guid CustomerId,
    string CustomerName,
    DateOnly IssueDate,
    DateOnly DueDate,
    decimal NetTotal,
    decimal GrossTotal,
    decimal PaidAmount,
    decimal OpenAmount,
    bool IsOverdue,
    int DaysOverdue,
    DateTimeOffset? SentAt,
    DateTimeOffset UpdatedAt);

public sealed record InvoiceLinkDto(Guid Id, string? Number, InvoiceKind Kind, InvoiceStatus Status, decimal GrossTotal);

public sealed record InvoicePaymentDto(Guid Id, decimal Amount, DateOnly PaidOn, string? Method, string? Note, DateTimeOffset CreatedAt, string? CreatedByName);

public sealed record InvoiceDto(
    Guid Id,
    string? Number,
    InvoiceKind Kind,
    InvoiceStatus Status,
    string Title,
    Guid CustomerId,
    string CustomerName,
    string RecipientName,
    string? RecipientContact,
    string? RecipientAddress,
    string? RecipientEmail,
    string? RecipientVatId,
    DateOnly IssueDate,
    DateOnly? ServiceDateFrom,
    DateOnly? ServiceDateTo,
    DateOnly DueDate,
    TaxMode TaxMode,
    string? IntroText,
    string? ClosingText,
    string? PaymentTerms,
    string? BuyerReference,
    string? InternalNotes,
    string Currency,
    IReadOnlyList<LineItemDto> LineItems,
    TotalsDto Totals,
    decimal PaidAmount,
    decimal OpenAmount,
    bool IsOverdue,
    int DaysOverdue,
    DateOnly? PaidOn,
    IReadOnlyList<InvoicePaymentDto> Payments,
    Guid? QuotationId,
    string? QuotationNumber,
    Guid? JobId,
    string? JobNumber,
    Guid? CancelledInvoiceId,
    string? CancelledInvoiceNumber,
    Guid? CancellationInvoiceId,
    string? CancellationInvoiceNumber,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? IssuedAt,
    DateTimeOffset? SentAt,
    DateTimeOffset? CancelledAt,
    string? CancellationReason,
    DateTimeOffset? LastReminderAt,
    int ReminderCount,
    bool HasEInvoice,
    IReadOnlyList<string> IssueProblems,
    IReadOnlyList<string> AllowedActions,
    string RowVersion);

public sealed record SendInvoiceRequest(SendMode Mode, string? RecipientEmail, string? Subject, string? Message);

public sealed record SendInvoiceResponse(InvoiceDto Invoice, Guid? EmailDeliveryId);

public sealed record RecordPaymentRequest(decimal Amount, DateOnly PaidOn, string? Method, string? Note);

public sealed record PaymentReminderRequest(string? RecipientEmail, string? Message);

public sealed record InvoiceEventDto(Guid Id, InvoiceEventType Type, DateTimeOffset OccurredAt, ActorType ActorType, string? ActorName, string? Details);

// ---------- Templates ----------
public sealed record TemplateLineItemDto(Guid Id, int Position, string Title, string? Description, decimal Quantity, string Unit, decimal UnitPriceNet, decimal DiscountPercent, decimal? TaxRatePercent);

public sealed record TemplateLineItemInput(string Title, string? Description, decimal Quantity, string Unit, decimal UnitPriceNet, decimal DiscountPercent, decimal? TaxRatePercent);

public sealed record TemplateDto(Guid Id, string Name, string? Description, string? IntroText, string? ClosingText, string? Terms, TaxMode? TaxMode, IReadOnlyList<TemplateLineItemDto> LineItems, DateTimeOffset UpdatedAt);

public sealed record TemplateListItemDto(Guid Id, string Name, string? Description, int LineItemCount, decimal NetTotal, DateTimeOffset UpdatedAt);

public sealed record UpsertTemplateRequest(string Name, string? Description, string? IntroText, string? ClosingText, string? Terms, TaxMode? TaxMode, IReadOnlyList<TemplateLineItemInput> LineItems);

public sealed record SaveAsTemplateRequest(string Name, string? Description);

// ---------- Dashboard / activity / notifications ----------
public sealed record DashboardDto(
    DateOnly From,
    DateOnly To,
    int DraftCount,
    int SentCount,
    int AcceptedCount,
    int RejectedCount,
    int ExpiredCount,
    int ExpiringSoonCount,
    int FollowUpsDueCount,
    decimal QuotedValueNet,
    decimal AcceptedValueNet,
    decimal? ConversionRatePercent,
    string ConversionRateDefinition,
    IReadOnlyList<QuotationListItemDto> AwaitingDecision,
    IReadOnlyList<QuotationListItemDto> ExpiringSoon,
    IReadOnlyList<FollowUpDueDto> UpcomingFollowUps,
    IReadOnlyList<ActivityDto> RecentActivity,
    int OpenJobsCount,
    int OpenInvoicesCount,
    decimal OpenInvoicesAmount,
    int OverdueInvoicesCount,
    decimal OverdueInvoicesAmount,
    decimal InvoicedNet,
    decimal PaymentsReceived,
    IReadOnlyList<InvoiceListItemDto> OverdueInvoices);

public sealed record FollowUpDueDto(Guid QuotationId, string QuotationNumber, string CustomerName, FollowUpKind Kind, DateTimeOffset DueAt);

public sealed record ActivityDto(Guid Id, string Type, DateTimeOffset OccurredAt, string? ActorName, string Summary, string? EntityType, Guid? EntityId);

public sealed record NotificationDto(Guid Id, string Type, string Title, string? Body, string? EntityType, Guid? EntityId, DateTimeOffset CreatedAt, bool IsRead);

// ---------- Billing ----------
public sealed record PlanDto(SubscriptionPlan Plan, string Name, decimal MonthlyPriceEur, int MaxActiveMembers, int? MaxQuotationsPerMonth, int MaxEmailsPerDay);

public sealed record SubscriptionDto(
    SubscriptionPlan Plan,
    string PlanName,
    SubscriptionStatus Status,
    DateTimeOffset? TrialEndsAt,
    DateTimeOffset? CurrentPeriodEnd,
    DateTimeOffset? GraceUntil,
    bool CancelAtPeriodEnd,
    bool HasFullAccess,
    string Provider,
    bool ProviderIsLive,
    int ActiveMembers,
    int QuotationsThisMonth,
    IReadOnlyList<PlanDto> AvailablePlans);

public sealed record ChangePlanRequest(SubscriptionPlan Plan);

public sealed record ChangePlanResponse(string? RedirectUrl, bool ActivatedImmediately, SubscriptionDto Subscription);

// ---------- Public customer page ----------
public sealed record PublicQuotationDto(
    string Number,
    string Title,
    QuotationStatus Status,
    DateOnly IssueDate,
    DateOnly ValidUntil,
    bool CanDecide,
    bool IsPastValidity,
    string CompanyName,
    string? CompanyAddress,
    string? CompanyEmail,
    string? CompanyPhone,
    string BrandColor,
    bool HasLogo,
    string RecipientName,
    string? RecipientAddress,
    TaxMode TaxMode,
    string? IntroText,
    string? ClosingText,
    string? Terms,
    string? PaymentTerms,
    IReadOnlyList<PublicLineItemDto> LineItems,
    TotalsDto Totals,
    DateTimeOffset? DecidedAt,
    string? DecisionName,
    bool FollowUpOptOut);

public sealed record PublicLineItemDto(int Position, string Title, string? Description, decimal Quantity, string Unit, decimal UnitPriceNet, decimal DiscountPercent, decimal TaxRatePercent, decimal LineNet);

public sealed record PublicAcceptRequest(string FullName, bool ConfirmBinding, string? Note);

public sealed record PublicRejectRequest(string? FullName, string? Reason);

public sealed record PublicDecisionResponse(QuotationStatus Status, DateTimeOffset DecidedAt, string Number, string CompanyName);

// ---------- Jobs runner ----------
public sealed record JobRunResult(int QuotationsExpired, int FollowUpsQueued, int FollowUpsCancelled, int EmailsHandedOff, int EmailsFailed, int EmailsRetrying, int OrphanFilesDeleted, bool SkippedBecauseLocked, int PaymentRemindersQueued = 0);
