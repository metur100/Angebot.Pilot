using System.Data;
using AngebotPilot.Application.Abstractions;
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
using Microsoft.EntityFrameworkCore.Storage;

namespace AngebotPilot.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenant) : DbContext(options), IAppDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<UserToken> UserTokens => Set<UserToken>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<CompanySettings> CompanySettings => Set<CompanySettings>();
    public DbSet<CompanyMembership> Memberships => Set<CompanyMembership>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<TaxRate> TaxRates => Set<TaxRate>();
    public DbSet<DocumentSequence> DocumentSequences => Set<DocumentSequence>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Quotation> Quotations => Set<Quotation>();
    public DbSet<QuotationLineItem> QuotationLineItems => Set<QuotationLineItem>();
    public DbSet<QuotationEvent> QuotationEvents => Set<QuotationEvent>();
    public DbSet<PublicQuotationAccess> PublicQuotationAccesses => Set<PublicQuotationAccess>();
    public DbSet<EmailDelivery> EmailDeliveries => Set<EmailDelivery>();
    public DbSet<FollowUpSchedule> FollowUpSchedules => Set<FollowUpSchedule>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLineItem> InvoiceLineItems => Set<InvoiceLineItem>();
    public DbSet<InvoiceEvent> InvoiceEvents => Set<InvoiceEvent>();
    public DbSet<InvoicePayment> InvoicePayments => Set<InvoicePayment>();
    public DbSet<QuotationTemplate> Templates => Set<QuotationTemplate>();
    public DbSet<StoredFile> Files => Set<StoredFile>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<BillingWebhookEvent> BillingWebhookEvents => Set<BillingWebhookEvent>();

    /// <summary>Tenant of the current request. When unset, tenant-filtered queries return no rows (fail closed).</summary>
    private Guid? CurrentCompanyId => tenant.CompanyId;

    public void SetOriginalRowVersion(object entity, byte[] rowVersion)
    {
        if (rowVersion.Length > 0)
        {
            var property = Entry(entity).Property("RowVersion");

            // Stale client version: reject even if the submitted values are identical (EF would skip the UPDATE).
            if (property.CurrentValue is byte[] loaded && !loaded.AsSpan().SequenceEqual(rowVersion))
            {
                throw new DbUpdateConcurrencyException("The row version supplied by the client is outdated.");
            }

            // Races between loading and saving are caught by the WHERE RowVersion = @original clause.
            property.OriginalValue = rowVersion;
        }
    }

    public async Task<int> NextSequenceValueAsync(Guid companyId, DocumentSequenceKind kind, int year, CancellationToken cancellationToken)
    {
        // Single atomic statement; HOLDLOCK prevents two concurrent inserts for a new (company, kind, year).
        const string sql = """
            MERGE [DocumentSequences] WITH (HOLDLOCK) AS t
            USING (SELECT @companyId AS CompanyId, @kind AS Kind, @year AS [Year]) AS s
            ON t.CompanyId = s.CompanyId AND t.Kind = s.Kind AND t.[Year] = s.[Year]
            WHEN MATCHED THEN UPDATE SET LastValue = t.LastValue + 1
            WHEN NOT MATCHED THEN INSERT (CompanyId, Kind, [Year], LastValue) VALUES (s.CompanyId, s.Kind, s.[Year], 1)
            OUTPUT inserted.LastValue;
            """;
        var connection = Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await Database.OpenConnectionAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Transaction = Database.CurrentTransaction?.GetDbTransaction();
        AddParameter(command, "@companyId", companyId);
        AddParameter(command, "@kind", (int)kind);
        AddParameter(command, "@year", year);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(result, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static void AddParameter(System.Data.Common.DbCommand command, string name, object value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        command.Parameters.Add(p);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<string>().HaveMaxLength(200);
        configurationBuilder.Properties<decimal>().HavePrecision(18, 2);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var b = modelBuilder;
        b.Entity<User>(e =>
        {
            e.HasIndex(x => x.NormalizedEmail).IsUnique();
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.NormalizedEmail).HasMaxLength(254);
            e.Property(x => x.DisplayName).HasMaxLength(100);
            e.Property(x => x.PasswordHash).HasMaxLength(500);
        });

        b.Entity<RefreshToken>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.FamilyId);
            e.Property(x => x.TokenHash).HasMaxLength(64).IsFixedLength();
            e.Property(x => x.RevokedReason).HasMaxLength(50);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<UserToken>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.Purpose, x.CreatedAt });
            e.Property(x => x.TokenHash).HasMaxLength(64).IsFixedLength();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Company>(e =>
        {
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.Country).HasMaxLength(2).IsFixedLength();
            e.Property(x => x.BrandColor).HasMaxLength(7);
            e.Property(x => x.TimeZone).HasMaxLength(64);
            e.Property(x => x.Language).HasMaxLength(10);
            e.Property(x => x.VatId).HasMaxLength(20);
            e.Property(x => x.TaxNumber).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.HasOne(x => x.Settings).WithOne().HasForeignKey<CompanySettings>(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Memberships).WithOne(x => x.Company).HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<CompanySettings>(e =>
        {
            e.HasKey(x => x.CompanyId);
            e.Property(x => x.QuotationPrefix).HasMaxLength(8);
            e.Property(x => x.JobPrefix).HasMaxLength(8);
            foreach (var p in new[] { nameof(Domain.Companies.CompanySettings.DefaultIntroText), nameof(Domain.Companies.CompanySettings.DefaultClosingText), nameof(Domain.Companies.CompanySettings.DefaultTerms) })
            {
                e.Property(p).HasMaxLength(4000);
            }

            e.Property(x => x.PaymentTerms).HasMaxLength(1000);
            e.Property(x => x.EmailSignature).HasMaxLength(1000);
            e.Property(x => x.Iban).HasMaxLength(34);
            e.Property(x => x.Bic).HasMaxLength(11);
            e.Property(x => x.ReplyToEmail).HasMaxLength(254);
            e.Property(x => x.InvoicePrefix).HasMaxLength(8);
            e.Property(x => x.InvoiceIntroText).HasMaxLength(4000);
            e.Property(x => x.InvoiceClosingText).HasMaxLength(4000);
        });

        b.Entity<CompanyMembership>(e =>
        {
            e.HasIndex(x => new { x.CompanyId, x.UserId }).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Invitation>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.NormalizedEmail });
            e.Property(x => x.TokenHash).HasMaxLength(64).IsFixedLength();
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.NormalizedEmail).HasMaxLength(254);
            e.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<TaxRate>(e =>
        {
            e.HasIndex(x => x.CompanyId);
            e.Property(x => x.RatePercent).HasPrecision(5, 2);
            e.Property(x => x.Name).HasMaxLength(100);
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<DocumentSequence>(e =>
        {
            e.HasKey(x => new { x.CompanyId, x.Kind, x.Year });
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Customer>(e =>
        {
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => new { x.CompanyId, x.ArchivedAt });
            e.HasIndex(x => new { x.CompanyId, x.CompanyName });
            e.HasIndex(x => new { x.CompanyId, x.LastName });
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.Property(x => x.Salutation).HasMaxLength(30);
            e.Property(x => x.FirstName).HasMaxLength(100);
            e.Property(x => x.LastName).HasMaxLength(100);
            e.Property(x => x.BillingPostalCode).HasMaxLength(10);
            e.Property(x => x.ServicePostalCode).HasMaxLength(10);
            e.Property(x => x.BillingCity).HasMaxLength(100);
            e.Property(x => x.ServiceCity).HasMaxLength(100);
            e.Property(x => x.BillingCountry).HasMaxLength(2).IsFixedLength();
            e.Property(x => x.ServiceCountry).HasMaxLength(2).IsFixedLength();
            e.Property(x => x.VatId).HasMaxLength(20);
            e.Property(x => x.Notes).HasMaxLength(4000);
            e.Ignore(x => x.DisplayName);
            e.Ignore(x => x.ContactPerson);
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<Quotation>(e =>
        {
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => new { x.CompanyId, x.Number }).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.Status, x.ValidUntil });
            e.HasIndex(x => new { x.CompanyId, x.CustomerId });
            e.HasIndex(x => new { x.CompanyId, x.IssueDate });
            e.HasIndex(x => x.RootQuotationId);
            e.Property(x => x.Number).HasMaxLength(40);
            e.Property(x => x.Currency).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.RecipientAddress).HasMaxLength(500);
            e.Property(x => x.RecipientEmail).HasMaxLength(254);
            e.Property(x => x.RecipientVatId).HasMaxLength(20);
            e.Property(x => x.DecisionName).HasMaxLength(150);
            e.Property(x => x.DecisionNote).HasMaxLength(1000);
            e.Property(x => x.CancellationReason).HasMaxLength(1000);
            e.Property(x => x.PaymentTerms).HasMaxLength(1000);
            foreach (var p in new[] { nameof(Quotation.IntroText), nameof(Quotation.ClosingText), nameof(Quotation.Terms), nameof(Quotation.InternalNotes) })
            {
                e.Property(p).HasMaxLength(4000);
            }

            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.LineItems).WithOne().HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Events).WithOne().HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId && x.DeletedAt == null);
        });

        b.Entity<QuotationLineItem>(e =>
        {
            e.HasIndex(x => new { x.QuotationId, x.Position });
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.TaxRatePercent).HasPrecision(5, 2);
        });

        b.Entity<QuotationEvent>(e =>
        {
            e.HasIndex(x => new { x.QuotationId, x.OccurredAt });
            e.Property(x => x.Details).HasMaxLength(500);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<PublicQuotationAccess>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.QuotationId);
            e.Property(x => x.TokenHash).HasMaxLength(64).IsFixedLength();
            e.HasOne(x => x.Quotation).WithMany().HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<EmailDelivery>(e =>
        {
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
            e.HasIndex(x => new { x.Status, x.NextAttemptAt });
            e.HasIndex(x => x.QuotationId);
            e.HasIndex(x => x.InvoiceId);
            e.HasIndex(x => new { x.CompanyId, x.CreatedAt });
            e.Property(x => x.IdempotencyKey).HasMaxLength(120);
            e.Property(x => x.ToAddress).HasMaxLength(254);
            e.Property(x => x.ReplyToAddress).HasMaxLength(254);
            e.Property(x => x.BodyText).HasMaxLength(-1);
            e.Property(x => x.BodyHtml).HasMaxLength(-1);
            e.Property(x => x.LastError).HasMaxLength(300);
            e.Property(x => x.ProviderMessageId).HasMaxLength(200);
        });

        b.Entity<FollowUpSchedule>(e =>
        {
            e.HasIndex(x => new { x.QuotationId, x.Kind }).IsUnique();
            e.HasIndex(x => new { x.Status, x.DueAt });
            e.HasOne<Quotation>().WithMany().HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<Job>(e =>
        {
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => x.QuotationId).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.Number }).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.Status });
            e.HasIndex(x => new { x.CompanyId, x.AssignedUserId });
            e.Property(x => x.Number).HasMaxLength(40);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.Notes).HasMaxLength(4000);
            e.HasOne(x => x.Quotation).WithMany().HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<Invoice>(e =>
        {
            e.Property(x => x.RowVersion).IsRowVersion();
            // Gap-free numbering per company; drafts have no number yet.
            e.HasIndex(x => new { x.CompanyId, x.Number }).IsUnique().HasFilter("[Number] IS NOT NULL");
            // An invoice can be reversed only once.
            e.HasIndex(x => x.CancelledInvoiceId).IsUnique().HasFilter("[CancelledInvoiceId] IS NOT NULL");
            e.HasIndex(x => new { x.CompanyId, x.Status, x.DueDate });
            e.HasIndex(x => new { x.CompanyId, x.CustomerId });
            e.HasIndex(x => new { x.CompanyId, x.IssueDate });
            e.HasIndex(x => x.JobId);
            e.HasIndex(x => x.QuotationId);
            e.Property(x => x.Number).HasMaxLength(40);
            e.Property(x => x.QuotationNumber).HasMaxLength(40);
            e.Property(x => x.JobNumber).HasMaxLength(40);
            e.Property(x => x.CancelledInvoiceNumber).HasMaxLength(40);
            e.Property(x => x.Currency).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.RecipientAddress).HasMaxLength(500);
            e.Property(x => x.RecipientPostalCode).HasMaxLength(10);
            e.Property(x => x.RecipientCity).HasMaxLength(100);
            e.Property(x => x.RecipientCountry).HasMaxLength(2).IsFixedLength();
            e.Property(x => x.RecipientEmail).HasMaxLength(254);
            e.Property(x => x.RecipientVatId).HasMaxLength(20);
            e.Property(x => x.BuyerReference).HasMaxLength(100);
            e.Property(x => x.PaymentTerms).HasMaxLength(1000);
            e.Property(x => x.CancellationReason).HasMaxLength(1000);
            foreach (var p in new[] { nameof(Invoice.IntroText), nameof(Invoice.ClosingText), nameof(Invoice.InternalNotes) })
            {
                e.Property(p).HasMaxLength(4000);
            }

            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.LineItems).WithOne().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Events).WithOne().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Payments).WithOne().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId && x.DeletedAt == null);
        });

        b.Entity<InvoiceLineItem>(e =>
        {
            e.HasIndex(x => new { x.InvoiceId, x.Position });
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.TaxRatePercent).HasPrecision(5, 2);
        });

        b.Entity<InvoiceEvent>(e =>
        {
            e.HasIndex(x => new { x.InvoiceId, x.OccurredAt });
            e.Property(x => x.Details).HasMaxLength(500);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<InvoicePayment>(e =>
        {
            e.HasIndex(x => new { x.CompanyId, x.PaidOn });
            e.Property(x => x.Method).HasMaxLength(50);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<QuotationTemplate>(e =>
        {
            e.HasIndex(x => new { x.CompanyId, x.Name });
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Description).HasMaxLength(500);
            foreach (var p in new[] { nameof(QuotationTemplate.IntroText), nameof(QuotationTemplate.ClosingText), nameof(QuotationTemplate.Terms) })
            {
                e.Property(p).HasMaxLength(4000);
            }

            e.HasMany(x => x.LineItems).WithOne().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<TemplateLineItem>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.TaxRatePercent).HasPrecision(5, 2);
        });

        b.Entity<StoredFile>(e =>
        {
            e.HasIndex(x => x.ObjectKey).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.Status });
            e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.Property(x => x.ObjectKey).HasMaxLength(300);
            e.Property(x => x.FileName).HasMaxLength(150);
            e.Property(x => x.ContentType).HasMaxLength(100);
            e.Property(x => x.Sha256).HasMaxLength(64).IsFixedLength();
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<Notification>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.CompanyId, x.ReadAt });
            e.Property(x => x.Type).HasMaxLength(50);
            e.Property(x => x.Body).HasMaxLength(1000);
            e.Property(x => x.EntityType).HasMaxLength(50);
            e.HasQueryFilter(x => x.CompanyId == CurrentCompanyId);
        });

        b.Entity<AuditEvent>(e =>
        {
            e.HasIndex(x => new { x.CompanyId, x.OccurredAt });
            e.HasIndex(x => new { x.UserId, x.OccurredAt });
            e.Property(x => x.Action).HasMaxLength(80);
            e.Property(x => x.EntityType).HasMaxLength(50);
            e.Property(x => x.Summary).HasMaxLength(500);
        });

        b.Entity<Subscription>(e =>
        {
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => x.CompanyId).IsUnique();
            e.Property(x => x.Provider).HasMaxLength(30);
            e.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<BillingWebhookEvent>(e =>
        {
            e.HasIndex(x => new { x.Provider, x.ProviderEventId }).IsUnique();
            e.Property(x => x.Provider).HasMaxLength(30);
            e.Property(x => x.EventType).HasMaxLength(100);
        });
    }
}
