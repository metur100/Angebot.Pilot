using AngebotPilot.Domain;
using AngebotPilot.Domain.Audit;
using AngebotPilot.Domain.Billing;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.Customers;
using AngebotPilot.Domain.Emails;
using AngebotPilot.Domain.Files;
using AngebotPilot.Domain.FollowUps;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Domain.Jobs;
using AngebotPilot.Domain.Notifications;
using AngebotPilot.Domain.Quotations;
using AngebotPilot.Domain.Templates;
using AngebotPilot.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace AngebotPilot.Application.Abstractions;

/// <summary>
/// Persistence boundary. Company-owned sets are protected by a fail-closed global query filter bound to
/// <see cref="ITenantContext"/>; code that must cross tenants (public links, background jobs) has to call
/// <c>IgnoreQueryFilters()</c> explicitly.
/// </summary>
public interface IAppDbContext
{
    DbSet<User> Users { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<UserToken> UserTokens { get; }
    DbSet<Company> Companies { get; }
    DbSet<CompanySettings> CompanySettings { get; }
    DbSet<CompanyMembership> Memberships { get; }
    DbSet<Invitation> Invitations { get; }
    DbSet<TaxRate> TaxRates { get; }
    DbSet<DocumentSequence> DocumentSequences { get; }
    DbSet<Customer> Customers { get; }
    DbSet<Quotation> Quotations { get; }
    DbSet<QuotationLineItem> QuotationLineItems { get; }
    DbSet<QuotationEvent> QuotationEvents { get; }
    DbSet<PublicQuotationAccess> PublicQuotationAccesses { get; }
    DbSet<EmailDelivery> EmailDeliveries { get; }
    DbSet<FollowUpSchedule> FollowUpSchedules { get; }
    DbSet<Job> Jobs { get; }
    DbSet<Invoice> Invoices { get; }
    DbSet<InvoiceLineItem> InvoiceLineItems { get; }
    DbSet<InvoiceEvent> InvoiceEvents { get; }
    DbSet<InvoicePayment> InvoicePayments { get; }
    DbSet<QuotationTemplate> Templates { get; }
    DbSet<StoredFile> Files { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<AuditEvent> AuditEvents { get; }
    DbSet<Subscription> Subscriptions { get; }
    DbSet<BillingWebhookEvent> BillingWebhookEvents { get; }

    DatabaseFacade Database { get; }

    Microsoft.EntityFrameworkCore.ChangeTracking.ChangeTracker ChangeTracker { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets the row version the client last saw as the original value, so EF Core's optimistic concurrency check
    /// fails with a conflict when the row was changed in the meantime.
    /// </summary>
    void SetOriginalRowVersion(object entity, byte[] rowVersion);

    /// <summary>Atomically reserves the next value of a per-company document counter.</summary>
    Task<int> NextSequenceValueAsync(Guid companyId, DocumentSequenceKind kind, int year, CancellationToken cancellationToken);
}

/// <summary>The company the current request is scoped to, after membership was verified.</summary>
public interface ITenantContext
{
    Guid? CompanyId { get; }

    void Set(Guid companyId);
}

public sealed class TenantContext : ITenantContext
{
    public Guid? CompanyId { get; private set; }

    public void Set(Guid companyId)
    {
        if (CompanyId is not null && CompanyId != companyId)
        {
            throw new InvalidOperationException("The tenant of a request cannot change.");
        }

        CompanyId = companyId;
    }
}

public sealed record CurrentMember(Guid UserId, Guid CompanyId, Guid MembershipId, Domain.MembershipRole Role);

public interface ICurrentUser
{
    Guid? UserId { get; }

    Guid RequireUserId();
}

public sealed record StoredObject(Stream Content, string ContentType, long Length);

/// <summary>Provider-independent private object storage (Cloudflare R2, other S3-compatible services, local disk, memory).</summary>
public interface IFileStorageService
{
    Task PutAsync(string objectKey, Stream content, string contentType, CancellationToken cancellationToken);

    Task<StoredObject?> GetAsync(string objectKey, CancellationToken cancellationToken);

    Task DeleteAsync(string objectKey, CancellationToken cancellationToken);

    Task<bool> ExistsAsync(string objectKey, CancellationToken cancellationToken);

    /// <summary>Lists keys under a prefix; used by orphan cleanup.</summary>
    IAsyncEnumerable<string> ListAsync(string prefix, CancellationToken cancellationToken);

    /// <summary>Short-lived download URL, or <c>null</c> when the provider streams through the API instead.</summary>
    Task<Uri?> GetPresignedDownloadUrlAsync(string objectKey, string downloadFileName, TimeSpan lifetime, CancellationToken cancellationToken);
}

public sealed record OutgoingEmail(
    string To,
    string Subject,
    string BodyText,
    string? BodyHtml,
    string? ReplyTo,
    string? FromDisplayName,
    IReadOnlyList<EmailAttachment> Attachments,
    string IdempotencyKey);

public sealed record EmailAttachment(string FileName, string ContentType, byte[] Content);

public enum EmailSendOutcome
{
    HandedOff,
    TemporaryFailure,
    PermanentFailure,
}

public sealed record EmailSendResult(EmailSendOutcome Outcome, string? ProviderMessageId, string? Error);

/// <summary>Sends one email via the configured provider. Success means "accepted by the mail server", not "delivered".</summary>
public interface IEmailSender
{
    Task<EmailSendResult> SendAsync(OutgoingEmail email, CancellationToken cancellationToken);
}

public sealed record PdfCompany(
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
    byte[]? Logo,
    string? BankAccountHolder,
    string? Iban,
    string? Bic,
    string? BankName);

public sealed record PdfQuotation(
    Quotation Quotation,
    PdfCompany Company,
    string? PublicUrl,
    bool IsDraftPreview);

public interface IQuotationPdfRenderer
{
    byte[] Render(PdfQuotation model);
}

/// <param name="GiroCode">EPC QR payload (GiroCode) for paying the invoice with a banking app, or <c>null</c>.</param>
public sealed record PdfInvoice(
    Invoice Invoice,
    PdfCompany Company,
    bool IsDraftPreview,
    string? GiroCode);

public interface IInvoicePdfRenderer
{
    /// <summary>Renders the invoice. Final documents are produced as PDF/A-3b so the e-invoice can be embedded.</summary>
    byte[] Render(PdfInvoice model);

    /// <summary>
    /// Embeds the e-invoice XML as <c>factur-x.xml</c> with the Factur-X/ZUGFeRD XMP metadata, producing a hybrid
    /// ZUGFeRD invoice (profile EN 16931). Returns <c>null</c> when embedding is not possible on this host.
    /// </summary>
    byte[]? EmbedEInvoice(byte[] pdf, byte[] xml, DateTimeOffset documentDate);
}

/// <summary>Either a redirect to the provider checkout, or (development mock only) a signed webhook to apply immediately.</summary>
public sealed record BillingCheckout(Uri? RedirectUrl, bool ActivatedImmediately, string? ImmediateWebhookPayload = null, IReadOnlyDictionary<string, string>? ImmediateWebhookHeaders = null);

public sealed record BillingWebhook(string ProviderEventId, string EventType, Guid CompanyId, SubscriptionPlan? Plan, SubscriptionStatus? Status, DateTimeOffset? CurrentPeriodEnd, string? ProviderCustomerId, string? ProviderSubscriptionId);

/// <summary>Abstraction over a payment provider (Stripe, Paddle, …). Only a clearly labelled mock exists until a provider is configured.</summary>
public interface IBillingProvider
{
    string Name { get; }

    bool IsLive { get; }

    Task<BillingCheckout> StartCheckoutAsync(Guid companyId, SubscriptionPlan plan, string customerEmail, CancellationToken cancellationToken);

    /// <summary>Verifies the signature and parses the payload. Returns <c>null</c> when the signature is invalid.</summary>
    BillingWebhook? VerifyAndParseWebhook(string payload, IReadOnlyDictionary<string, string> headers);
}
