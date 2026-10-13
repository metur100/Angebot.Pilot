# AngebotPilot – Database

SQL Server via EF Core 10 (`apps/api/src/AngebotPilot.Infrastructure/Persistence/AppDbContext.cs`). Schema created by
the single migration `20261012202456_InitialCreate` (`Persistence/Migrations`). Production: MonsterASP MS SQL
(SQL Server 2025 Express per the hosting plan); development: SQL Server LocalDB or the Docker image in
`docker-compose.yml`; CI: `mcr.microsoft.com/mssql/server:2022-latest`.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [Backup & restore](../deployment/BACKUP-AND-RESTORE.md) ·
[Rollback](../deployment/ROLLBACK.md)

## Conventions

- Primary keys: `Guid Id` (`uniqueidentifier`) unless noted.
- Strings default to `nvarchar(200)` (`ConfigureConventions`); exceptions listed per table.
- Decimals default to `decimal(18,2)`; quantities `decimal(18,3)`; percentages `decimal(5,2)`.
- Instants: `datetimeoffset`, written as UTC. Business dates: `date` (`DateOnly`).
- Enums are stored as `int`.
- Optimistic concurrency: `rowversion` columns (`RowVersion`, `IsRowVersion()`) on **Companies, Customers, Quotations,
  Jobs, Subscriptions**. Clients send the base64 row version on update (`UpdateQuotationRequest`,
  `UpdateJobRequest`, customer and company updates); `AppDbContext.SetOriginalRowVersion` rejects stale versions even
  when the submitted values are unchanged.
- Soft delete: only `Quotations.DeletedAt` (drafts). Customers can be archived (`ArchivedAt`) or anonymised
  (`AnonymizedAt`). Templates are archived instead of deleted. Files are marked `Deleted` (metadata kept).

## Tables

24 application tables plus `__EFMigrationsHistory`.

### Identity

| Table | Key columns | Indexes / constraints | Relationships / delete behaviour |
|---|---|---|---|
| **Users** | `Email` (254), `NormalizedEmail` (254, upper-invariant), `DisplayName` (100), `PasswordHash` (500), `EmailVerifiedAt`, `FailedLoginCount`, `LockedUntil`, `SecurityStamp`, `IsDisabled`, `CreatedAt`, `LastLoginAt` | unique `IX_Users_NormalizedEmail` | – |
| **RefreshTokens** | `UserId`, `TokenHash` (char(64), SHA-256 hex), `FamilyId`, `Client`, `CreatedAt`, `ExpiresAt`, `RevokedAt`, `RevokedReason` (50), `ReplacedByTokenId`, `SecurityStamp` | unique `TokenHash`; `UserId`; `FamilyId` | → Users **cascade** |
| **UserTokens** | `UserId`, `Purpose` (EmailVerification/PasswordReset), `TokenHash` (char(64)), `CreatedAt`, `ExpiresAt`, `UsedAt` | unique `TokenHash`; `(UserId, Purpose, CreatedAt)` | → Users **cascade** |

### Companies and team

| Table | Key columns | Indexes / constraints | Relationships / delete behaviour |
|---|---|---|---|
| **Companies** | `Name`, address fields, `Country` (char(2)), `Email` (254), `Phone` (50), `Website`, `VatId` (20), `TaxNumber` (30), `LogoFileId`, `BrandColor` (7), `TimeZone` (64), `Language` (10), `IsDemo`, `CreatedAt`, `RowVersion` | – | parent of most tables |
| **CompanySettings** | PK = `CompanyId`; prefixes (8), `DefaultValidityDays`, `DefaultTaxMode`, default texts (4000), `PaymentTerms` (1000), bank details (`Iban` 34, `Bic` 11), `EmailSignature` (1000), `ReplyToEmail` (254), reminder settings, `AttachPdfToEmails`, `NotifyOnCustomerDecision` | PK | 1:1 → Companies **cascade** |
| **Memberships** | `CompanyId`, `UserId`, `Role` (0 Employee, 1 Admin, 2 Owner), `Status` (0 Active, 1 Deactivated), `JoinedAt`, `DeactivatedAt` | unique `(CompanyId, UserId)`; `UserId` | → Companies **cascade**; → Users **restrict** |
| **Invitations** | `CompanyId`, `Email`/`NormalizedEmail` (254), `Role`, `TokenHash` (char(64)), `InvitedByUserId`, `CreatedAt`, `ExpiresAt` (7 days), `AcceptedAt`, `RevokedAt` | unique `TokenHash`; `(CompanyId, NormalizedEmail)` | → Companies **cascade** |
| **TaxRates** | `CompanyId`, `Name` (100), `RatePercent` (5,2), `IsDefault`, `IsArchived`, `SortOrder` | `CompanyId` | → Companies **cascade** |
| **DocumentSequences** | PK `(CompanyId, Kind, Year)`, `LastValue` | PK | → Companies **cascade** |
| **Subscriptions** | `CompanyId`, `Plan`, `Status`, `TrialEndsAt`, `CurrentPeriodEnd`, `GraceUntil`, `CancelAtPeriodEnd`, `Provider` (30), provider ids, `UpdatedAt`, `RowVersion` | unique `CompanyId` | → Companies **cascade** |
| **BillingWebhookEvents** | `Provider` (30), `ProviderEventId`, `EventType` (100), `ReceivedAt`, `ProcessedAt` | unique `(Provider, ProviderEventId)` | none |

### Business data

| Table | Key columns | Indexes / constraints | Relationships / delete behaviour |
|---|---|---|---|
| **Customers** | `CompanyId`, `Type`, `CompanyName`, `Salutation` (30), `FirstName`/`LastName` (100), `Email` (254), `Phone` (50), billing + service address, `VatId` (20), `Notes` (4000), `FollowUpOptOut`, `FollowUpOptOutAt`, `ArchivedAt`, `AnonymizedAt`, `RowVersion` | `(CompanyId, ArchivedAt)`; `(CompanyId, CompanyName)`; `(CompanyId, LastName)` | → Companies **cascade** |
| **Quotations** | `CompanyId`, `CustomerId`, `Number` (40), `Title`, `Status`, `IssueDate`, `ValidUntil`, `TaxMode`, texts (4000), `PaymentTerms` (1000), `InternalNotes` (4000), `Currency` (char(3), `EUR`), totals, recipient snapshot (`RecipientName`, `RecipientContact`, `RecipientAddress` 500, `RecipientEmail` 254, `RecipientVatId` 20), `RootQuotationId`, `PreviousRevisionId`, `RevisionNumber`, `SourceTemplateId`, `SentPdfFileId`, sent/decision/expiry/cancel fields (`DecisionName` 150, `DecisionNote` 1000, `CancellationReason` 1000), `DeletedAt`, `RowVersion` | **unique `(CompanyId, Number)`**; `(CompanyId, Status, ValidUntil)`; `(CompanyId, CustomerId)`; `(CompanyId, IssueDate)`; `RootQuotationId`; `CustomerId` | → Companies **restrict**; → Customers **restrict**; `RootQuotationId`/`PreviousRevisionId`/`SourceTemplateId`/`SentPdfFileId` have **no FK** |
| **QuotationLineItems** | `QuotationId`, `Position`, `Title`, `Description` (2000), `Quantity` (18,3), `Unit` (20), `UnitPriceNet`, `DiscountPercent` (5,2), `TaxRatePercent` (5,2), `LineTotalBeforeDiscount`, `LineDiscount`, `LineNet` | `(QuotationId, Position)` | → Quotations **cascade** |
| **QuotationEvents** | `CompanyId`, `QuotationId`, `Type`, `OccurredAt`, `ActorType`, `ActorUserId`, `Details` (500) | `(QuotationId, OccurredAt)` | → Quotations **cascade** |
| **PublicQuotationAccesses** | `CompanyId`, `QuotationId`, `TokenHash` (char(64)), `CreatedAt`, `ExpiresAt`, `RevokedAt`, `FirstOpenedAt`, `LastOpenedAt`, `OpenCount` | **unique `TokenHash`**; `QuotationId` | → Quotations **cascade** |
| **FollowUpSchedules** | `CompanyId`, `QuotationId`, `Kind`, `DueAt`, `Status`, `EmailDeliveryId`, `CreatedAt`, `ProcessedAt`, `StatusReason` | **unique `(QuotationId, Kind)`**; `(Status, DueAt)` | → Quotations **cascade** |
| **Jobs** | `CompanyId`, `Number` (40), `CustomerId`, `QuotationId`, `Title`, `Description`/`Notes` (4000), `PlannedStartDate`, `DueDate`, `AssignedUserId`, `Status`, timestamps, `RowVersion` | **unique `QuotationId`** (convert once); **unique `(CompanyId, Number)`**; `(CompanyId, Status)`; `(CompanyId, AssignedUserId)`; `CustomerId` | → Customers **restrict**; → Quotations **restrict**; `AssignedUserId` no FK |
| **Invoices** | `CompanyId`, `Number` (40, **null for drafts**), `Kind` (Invoice/Cancellation), `Status`, `CustomerId`, `Title`, `IssueDate`, `ServiceDateFrom`/`ServiceDateTo`, `DueDate`, `TaxMode`, texts (4000), `BuyerReference` (100), totals, recipient snapshot (incl. structured street/postcode/city/country for the e-invoice), `QuotationId`/`QuotationNumber`, `JobId`/`JobNumber`, `CancelledInvoiceId`/`Number`/`IssueDate`, `CancellationInvoiceId`, `PdfFileId`, `XmlFileId`, `PaidAmount`, `PaidOn`, `ReminderCount`, `LastReminderAt`, timestamps, `DeletedAt`, `RowVersion` | **unique `(CompanyId, Number)` filtered `Number IS NOT NULL`**; **unique `CancelledInvoiceId` (filtered)**: an invoice is reversed once; `(CompanyId, Status, DueDate)`; `(CompanyId, CustomerId)`; `(CompanyId, IssueDate)`; `JobId`; `QuotationId` | → Customers **restrict**; → Companies **restrict**; quotation/job/cancellation references are plain columns (no FK) |
| **InvoiceLineItems** | same columns as QuotationLineItems | `(InvoiceId, Position)` | → Invoices **cascade** |
| **InvoiceEvents** | `CompanyId`, `InvoiceId`, `Type`, `OccurredAt`, `ActorType`, `ActorUserId`, `Details` (500) | `(InvoiceId, OccurredAt)` | → Invoices **cascade** |
| **InvoicePayments** | `CompanyId`, `InvoiceId`, `Amount`, `PaidOn`, `Method` (50), `Note` (500), `CreatedAt`, `CreatedByUserId` | `(CompanyId, PaidOn)` | → Invoices **cascade** |
| **Templates** | `CompanyId`, `Name` (100), `Description` (500), texts (4000), `TaxMode`, `ArchivedAt` | `(CompanyId, Name)` (not unique) | → Companies **cascade** |
| **TemplateLineItem** (singular table name) | `TemplateId`, `Position`, `Title`, `Description` (2000), `Quantity`, `Unit`, `UnitPriceNet`, `DiscountPercent`, `TaxRatePercent` (nullable) | `TemplateId` | → Templates **cascade** |

### Platform / operational

| Table | Key columns | Indexes / constraints | Relationships / delete behaviour |
|---|---|---|---|
| **EmailDeliveries** | `CompanyId` (nullable), `QuotationId` (nullable), `Kind`, `IdempotencyKey` (120), `ToAddress` (254), `ReplyToAddress`, `FromDisplayName`, `Subject`, `BodyText`/`BodyHtml` (`nvarchar(max)`), `AttachmentFileId`, `AttachmentFileName`, `Status`, `Attempts`, `NextAttemptAt`, `LockedUntil`, `HandedOffAt`, `ProviderMessageId` (200), `LastError` (300), `CreatedByUserId` | **unique `IdempotencyKey`**; `(Status, NextAttemptAt)`; `QuotationId`; `(CompanyId, CreatedAt)` | **no FKs** |
| **Files** | `CompanyId`, `Purpose`, `ObjectKey` (300), `FileName` (150), `ContentType` (100), `SizeBytes`, `Sha256` (char(64)), `Status`, `CreatedAt`, `CreatedByUserId`, `DeletedAt` | **unique `ObjectKey`**; `(CompanyId, Status)`; `(Status, CreatedAt)` | no FKs |
| **Notifications** | `CompanyId`, `UserId`, `Type` (50), `Title`, `Body` (1000), `EntityType` (50), `EntityId`, `CreatedAt`, `ReadAt` | `(UserId, CompanyId, ReadAt)` | no FKs |
| **AuditEvents** | `CompanyId` (nullable), `UserId` (nullable), `Action` (80), `EntityType` (50), `EntityId`, `Summary` (500), `OccurredAt` | `(CompanyId, OccurredAt)`; `(UserId, OccurredAt)` | no FKs (kept after deletions, company reference nulled) |

Note: `EmailDeliveries.BodyText`/`BodyHtml` contain the full email text, including one-time links (verification,
password reset, invitation, public quotation links with raw tokens). There is no automatic purge of delivered emails.
See the [threat model](../security/THREAT-MODEL.md#t13-log-and-data-leakage).

## Tenant filter coverage

Global query filter `CompanyId == CurrentCompanyId` (fail closed when no tenant is set):

| Filtered | Not filtered – how access is scoped instead |
|---|---|
| Invitations, TaxRates, Customers, Quotations (+ `DeletedAt == null`), QuotationEvents, PublicQuotationAccesses, FollowUpSchedules, Jobs, Invoices (+ `DeletedAt == null`), InvoiceEvents, InvoicePayments, Templates, Files, Notifications | **Users, RefreshTokens, UserTokens**: always queried by the authenticated user id or token hash. **Companies, CompanySettings, Memberships, Subscriptions, DocumentSequences**: queried by `member.CompanyId` from the verified membership. **QuotationLineItems, InvoiceLineItems, TemplateLineItem**: only loaded via their filtered parent. **EmailDeliveries**: queried with explicit `CompanyId == member.CompanyId` (e.g. `QuotationService.DeliveriesAsync`, `CompanyService.ExportAsync`) or by the job runner. **AuditEvents**: explicit `CompanyId == member.CompanyId` (`DashboardService.ActivityAsync`) or `UserId == current user` (account export). **BillingWebhookEvents**: platform-level. |

`IgnoreQueryFilters()` call sites (all with explicit predicates): `PublicQuotationService`, `JobRunner`,
`CompanyService` (invitation lookup, company deletion), `AuthService.DeleteAccountAsync`, `QuotationService.ReviseAsync`,
`FollowUpCanceller`, `PublicLinks.RevokeAllAsync`, `BillingService.EnsureQuotationQuotaAsync`, `FileService`,
`CustomerService.DeleteAsync`.

## Concurrency-relevant constraints

| Constraint | Protects against |
|---|---|
| `MERGE … WITH (HOLDLOCK)` on `DocumentSequences` | duplicate document numbers |
| unique `(CompanyId, Number)` on Quotations and Jobs | duplicate numbers (last line of defence, incl. revision numbers) |
| unique `Jobs.QuotationId` | converting a quotation twice |
| unique filtered `(CompanyId, Number)` on Invoices; number assigned inside the issuing transaction | duplicate or skipped invoice numbers (gap-free numbering) |
| unique filtered `Invoices.CancelledInvoiceId` | two cancellation invoices for one invoice |
| unique `EmailDeliveries.IdempotencyKey` | duplicate emails from retries / overlapping job runs |
| unique `(QuotationId, Kind)` on FollowUpSchedules | duplicate reminders |
| unique `(Provider, ProviderEventId)` on BillingWebhookEvents | applying a webhook twice |
| `rowversion` on Quotations | two simultaneous decisions (public + manual) |
| `sp_getapplock` `angebotpilot-jobs` | overlapping job runs |

## Migration strategy

- Migrations live in `apps/api/src/AngebotPilot.Infrastructure/Persistence/Migrations`; tooling `dotnet-ef` 10.0.12
  (local tool, `dotnet-tools.json`).
- **Production migrations are applied only by an explicit operator step**: `scripts/migrate-database.ps1`.
  1. Reads the connection string from `ANGEBOTPILOT_MIGRATION_CONNECTION` (never from files in Git). For MonsterASP
     use the **public** host `dbXXXX.public.databaseasp.net`; remote access must be enabled in the control panel.
  2. Generates an idempotent script `artifacts/migrations-idempotent.sql` for review (`dotnet ef migrations script --idempotent`).
  3. Refuses to continue if the script matches `DROP TABLE|DROP COLUMN|ALTER COLUMN` unless `-AllowDestructive` is
     passed (take a backup first). `-ScriptOnly` stops after writing the script.
  4. Publishes the API and runs `dotnet AngebotPilot.Api.dll migrate` with `ASPNETCORE_ENVIRONMENT=Production`, the
     hosted scheduler disabled and a throw-away JWT key.
- `Database:MigrateOnStartup` is `false` in `appsettings.json` (production) and `true` only in
  `appsettings.Development.json`. Keep it `false` in production.
- Migrations are **forward-only**: no down-migration is run in production. Roll back by restoring a backup (see
  [ROLLBACK.md](../deployment/ROLLBACK.md)).
- Always take a backup before migrating ([BACKUP-AND-RESTORE.md](../deployment/BACKUP-AND-RESTORE.md)).
- Guard limitations: the pattern check does not catch `DROP INDEX`, `DROP CONSTRAINT`, `DELETE`, `sp_rename` or data
  migrations; and because the idempotent script contains *all* migrations, a historical `ALTER COLUMN` will make every
  later run require `-AllowDestructive`. Review the script manually every time.

### Production status

- [ ] **Owner (gating):** the production database currently contains tables of another application. Remove them
  (AngebotPilot will not drop foreign tables), then run `scripts/migrate-database.ps1` for the first time. Until this is
  done the API cannot serve requests against production. Steps: [MONSTERASP-DEPLOYMENT.md](../deployment/MONSTERASP-DEPLOYMENT.md#4-database-migration-owner-gated).

## Development seed

- `dotnet run --project apps/api/src/AngebotPilot.Api -- seed-demo` (or `dotnet AngebotPilot.Api.dll seed-demo`).
- Creates one clearly labelled demo company "Muster Elektrotechnik (Demo)" (`IsDemo = true`) with fictitious
  customers (`*.example` addresses), quotations and templates through the regular services
  (`apps/api/src/AngebotPilot.Api/Infrastructure/DemoSeeder.cs`). Login `demo@angebotpilot.example`.
- **No fixed password:** uses `DEMO_PASSWORD` if set, otherwise generates a random one and prints it once to the log.
- Idempotent: does nothing if the demo user exists.
- Refuses to run when `ASPNETCORE_ENVIRONMENT=Production` (`Program.cs`) – unless the explicit override flag
  `--allow-production-demo` is passed. Do not use that flag against the production database.
- Never runs automatically.
