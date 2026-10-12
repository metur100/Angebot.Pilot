namespace AngebotPilot.Domain;

public enum MembershipRole
{
    Employee = 0,
    Admin = 1,
    Owner = 2,
}

public enum MembershipStatus
{
    Active = 0,
    Deactivated = 1,
}

public enum CustomerType
{
    Business = 0,
    Private = 1,
}

public enum QuotationStatus
{
    Draft = 0,
    Sent = 1,
    Accepted = 2,
    Rejected = 3,
    Expired = 4,
    Cancelled = 5,
}

/// <summary>How VAT is applied to a quotation. The user must confirm the treatment; this is not tax advice.</summary>
public enum TaxMode
{
    /// <summary>Regular VAT using the configured rate per line item.</summary>
    Standard = 0,

    /// <summary>Kleinunternehmerregelung (§ 19 UStG): no VAT is charged.</summary>
    SmallBusiness = 1,

    /// <summary>Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG): no VAT is charged.</summary>
    ReverseCharge = 2,
}

public enum QuotationEventType
{
    Created = 0,
    Updated = 1,
    Sent = 2,
    MarkedAsSent = 3,
    ReminderQueued = 4,
    Accepted = 5,
    Rejected = 6,
    Expired = 7,
    Cancelled = 8,
    RevisionCreated = 9,
    SupersededByRevision = 10,
    ConvertedToJob = 11,
    PdfGenerated = 12,
    PublicLinkCreated = 13,
    PublicLinkRevoked = 14,
    PublicLinkOpened = 15,
    EmailHandedOff = 16,
    EmailFailed = 17,
    FollowUpsCancelled = 18,
    Duplicated = 19,
    CustomerOptedOut = 20,
}

public enum ActorType
{
    User = 0,
    Customer = 1,
    System = 2,
}

public enum EmailKind
{
    QuotationSent = 0,
    FirstReminder = 1,
    SecondReminder = 2,
    ExpiryReminder = 3,
    Invitation = 4,
    PasswordReset = 5,
    EmailVerification = 6,
    DecisionNotification = 7,
}

public enum EmailStatus
{
    /// <summary>Queued and waiting for the dispatcher.</summary>
    Pending = 0,

    /// <summary>Claimed by a dispatcher run.</summary>
    Sending = 1,

    /// <summary>Accepted by the outgoing mail server. This is not proof of delivery to the inbox.</summary>
    HandedOff = 2,

    /// <summary>A temporary failure; another attempt is scheduled.</summary>
    RetryScheduled = 3,

    /// <summary>Delivery was abandoned after a permanent error or too many attempts.</summary>
    Failed = 4,

    Cancelled = 5,
}

public enum FollowUpKind
{
    FirstReminder = 0,
    SecondReminder = 1,
    ExpiryReminder = 2,
}

public enum FollowUpStatus
{
    Scheduled = 0,
    Queued = 1,
    Cancelled = 2,
    Skipped = 3,
}

public enum JobStatus
{
    Open = 0,
    InProgress = 1,
    Completed = 2,
    Cancelled = 3,
}

public enum FilePurpose
{
    CompanyLogo = 0,
    QuotationPdf = 1,
}

public enum FileStatus
{
    Pending = 0,
    Active = 1,
    Deleted = 2,
}

public enum UserTokenPurpose
{
    EmailVerification = 0,
    PasswordReset = 1,
}

public enum ClientKind
{
    Web = 0,
    Mobile = 1,
}

public enum SubscriptionPlan
{
    Trial = 0,
    Starter = 1,
    Team = 2,
    Business = 3,
}

public enum SubscriptionStatus
{
    Trialing = 0,
    Active = 1,
    PastDue = 2,
    Canceled = 3,
    Expired = 4,
}

public enum DocumentSequenceKind
{
    Quotation = 0,
    Job = 1,
}
