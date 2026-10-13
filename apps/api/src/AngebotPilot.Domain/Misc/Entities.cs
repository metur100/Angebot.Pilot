using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Customers;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.Domain.Emails
{
    /// <summary>
    /// Outbox record for one outgoing email. <see cref="IdempotencyKey"/> is unique, so retries and
    /// overlapping job runs cannot create a second email for the same purpose.
    /// </summary>
    public sealed class EmailDelivery : Entity
    {
        public const int MaxAttempts = 5;

        public Guid? CompanyId { get; set; }

        public Guid? QuotationId { get; set; }

        public Guid? InvoiceId { get; set; }

        public EmailKind Kind { get; set; }

        public required string IdempotencyKey { get; set; }

        public required string ToAddress { get; set; }

        public string? ReplyToAddress { get; set; }

        public string? FromDisplayName { get; set; }

        public required string Subject { get; set; }

        public required string BodyText { get; set; }

        public string? BodyHtml { get; set; }

        public Guid? AttachmentFileId { get; set; }

        public string? AttachmentFileName { get; set; }

        public EmailStatus Status { get; set; }

        public int Attempts { get; set; }

        public DateTimeOffset CreatedAt { get; set; }

        public DateTimeOffset NextAttemptAt { get; set; }

        public DateTimeOffset? LockedUntil { get; set; }

        public DateTimeOffset? HandedOffAt { get; set; }

        public string? ProviderMessageId { get; set; }

        /// <summary>Sanitised error summary (no credentials, no message body).</summary>
        public string? LastError { get; set; }

        public Guid? CreatedByUserId { get; set; }

        /// <summary>Exponential backoff: 1, 5, 15, 60 minutes.</summary>
        public static TimeSpan RetryDelay(int attempts) => attempts switch
        {
            <= 1 => TimeSpan.FromMinutes(1),
            2 => TimeSpan.FromMinutes(5),
            3 => TimeSpan.FromMinutes(15),
            _ => TimeSpan.FromMinutes(60),
        };
    }
}

namespace AngebotPilot.Domain.Jobs
{
    public sealed class Job : Entity, ICompanyOwned
    {
        public Guid CompanyId { get; set; }

        public required string Number { get; set; }

        public Guid CustomerId { get; set; }

        public Customer? Customer { get; set; }

        /// <summary>Unique: a quotation can be converted only once.</summary>
        public Guid QuotationId { get; set; }

        public Quotation? Quotation { get; set; }

        public required string Title { get; set; }

        public string? Description { get; set; }

        public DateOnly? PlannedStartDate { get; set; }

        public DateOnly? DueDate { get; set; }

        public Guid? AssignedUserId { get; set; }

        public JobStatus Status { get; private set; } = JobStatus.Open;

        public string? Notes { get; set; }

        public DateTimeOffset CreatedAt { get; set; }

        public Guid CreatedByUserId { get; set; }

        public DateTimeOffset UpdatedAt { get; set; }

        public DateTimeOffset? StartedAt { get; private set; }

        public DateTimeOffset? CompletedAt { get; private set; }

        public DateTimeOffset? CancelledAt { get; private set; }

        public byte[] RowVersion { get; set; } = [];

        private static readonly Dictionary<JobStatus, JobStatus[]> Allowed = new()
        {
            [JobStatus.Open] = [JobStatus.InProgress, JobStatus.Completed, JobStatus.Cancelled],
            [JobStatus.InProgress] = [JobStatus.Open, JobStatus.Completed, JobStatus.Cancelled],
            [JobStatus.Completed] = [JobStatus.InProgress],
            [JobStatus.Cancelled] = [JobStatus.Open],
        };

        public static bool CanTransition(JobStatus from, JobStatus to) => Allowed[from].Contains(to);

        public void ChangeStatus(JobStatus target, DateTimeOffset now)
        {
            if (target == Status)
            {
                return;
            }

            if (!CanTransition(Status, target))
            {
                throw new DomainException("invalid_status_transition", Loc.T("Dieser Statuswechsel ist für Aufträge nicht möglich.", "This status change is not possible for jobs."));
            }

            Status = target;
            UpdatedAt = now;
            switch (target)
            {
                case JobStatus.InProgress:
                    StartedAt ??= now;
                    CompletedAt = null;
                    break;
                case JobStatus.Completed:
                    CompletedAt = now;
                    break;
                case JobStatus.Cancelled:
                    CancelledAt = now;
                    break;
                case JobStatus.Open:
                    CancelledAt = null;
                    CompletedAt = null;
                    break;
            }
        }
    }
}

namespace AngebotPilot.Domain.Templates
{
    public sealed class QuotationTemplate : Entity, ICompanyOwned
    {
        public Guid CompanyId { get; set; }

        public required string Name { get; set; }

        public string? Description { get; set; }

        public string? IntroText { get; set; }

        public string? ClosingText { get; set; }

        public string? Terms { get; set; }

        public TaxMode? TaxMode { get; set; }

        public List<TemplateLineItem> LineItems { get; set; } = [];

        public DateTimeOffset CreatedAt { get; set; }

        public DateTimeOffset UpdatedAt { get; set; }

        public DateTimeOffset? ArchivedAt { get; set; }
    }

    public sealed class TemplateLineItem : Entity
    {
        public Guid TemplateId { get; set; }

        public int Position { get; set; }

        public required string Title { get; set; }

        public string? Description { get; set; }

        public decimal Quantity { get; set; }

        public string Unit { get; set; } = "Stk.";

        public decimal UnitPriceNet { get; set; }

        public decimal DiscountPercent { get; set; }

        public decimal? TaxRatePercent { get; set; }
    }
}

namespace AngebotPilot.Domain.Files
{
    /// <summary>Metadata of a private object stored in the configured object storage.</summary>
    public sealed class StoredFile : Entity, ICompanyOwned
    {
        public Guid CompanyId { get; set; }

        public FilePurpose Purpose { get; set; }

        /// <summary>Server-generated key, never derived from the uploaded file name.</summary>
        public required string ObjectKey { get; set; }

        /// <summary>Sanitised display name used for downloads.</summary>
        public required string FileName { get; set; }

        public required string ContentType { get; set; }

        public long SizeBytes { get; set; }

        public required string Sha256 { get; set; }

        public FileStatus Status { get; set; }

        public DateTimeOffset CreatedAt { get; set; }

        public Guid? CreatedByUserId { get; set; }

        public DateTimeOffset? DeletedAt { get; set; }
    }
}

namespace AngebotPilot.Domain.Notifications
{
    public sealed class Notification : Entity, ICompanyOwned
    {
        public Guid CompanyId { get; set; }

        public Guid UserId { get; set; }

        public required string Type { get; set; }

        public required string Title { get; set; }

        public string? Body { get; set; }

        public string? EntityType { get; set; }

        public Guid? EntityId { get; set; }

        public DateTimeOffset CreatedAt { get; set; }

        public DateTimeOffset? ReadAt { get; set; }
    }
}

namespace AngebotPilot.Domain.Audit
{
    public sealed class AuditEvent : Entity
    {
        public Guid? CompanyId { get; set; }

        public Guid? UserId { get; set; }

        public required string Action { get; set; }

        public string? EntityType { get; set; }

        public Guid? EntityId { get; set; }

        public string? Summary { get; set; }

        public DateTimeOffset OccurredAt { get; set; }
    }
}
