# AngebotPilot

Quotations (Angebote), customers, automated follow-ups (Nachfassen), jobs (Aufträge) and invoices (Rechnungen) for small German businesses
in trades and services. Web app, Android/iOS app and a .NET API in one monorepo.

© 2026 Medin Turkes · Certi Development – proprietary, see [LICENSE](LICENSE).

## Features

- **Customers** – business and private customers, billing and service address, search, archive, CSV export,
  delete or anonymise (when quotations must be retained).
- **Quotations** – line items with quantity, unit, price, discount and VAT rate; exact decimal calculation with VAT per
  rate; standard VAT, small-business rule (§ 19 UStG) or reverse charge (§ 13b UStG); concurrency-safe sequential
  numbers that are never reused; templates; duplicate; revisions that supersede the previous version.
- **PDF** – quotation PDFs: A4 with logo, company data, optional bank details and a QR code to the customer page; the sent PDF is
  frozen.
- **Sending** – by email (PDF and/or customer link) or "mark as sent"; email outbox with retries and idempotency.
- **Customer page** – customers view, accept (with name and binding confirmation) or reject online via a secret link;
  opt-out of reminders.
- **Follow-ups** – reminders at 09:00 company time, minimum 48 h apart, never after validity, stopped automatically on
  decision, cancellation or expiry.
- **Jobs** – convert an accepted quotation once into a job with status, dates and assignee.
- **Invoices** – created from a job, from an accepted quotation or manually. Drafts are editable; issuing assigns a
  gap-free number (per company and year, assigned in the same transaction as the documents) and freezes the invoice
  (GoBD). Checks the § 14 UStG details (company address and tax number/VAT ID, customer address, date of supply or
  service period, due date). The PDF is PDF/A-3b with the e-invoice embedded (ZUGFeRD 2 / Factur-X, profile
  EN 16931; UN/CEFACT CII XML also downloadable) and an EPC GiroCode. Payments and partial payments, overdue status,
  manual and optional automatic payment reminders, cancellation invoices (Stornorechnung), CSV export.
  Validated with the Mustang ZUGFeRD validator (PDF/A-3b, EN 16931 schematron) for standard VAT, § 19, § 13b,
  mixed rates and cancellations. XRechnung (public-sector CIUS) is not supported.
- **Teams** – multiple companies per account; roles Owner, Admin, Employee; invitations.
- **Dashboard and notifications**, activity history, GDPR exports (account and company), account deletion.
- **Billing** – 30-day trial and plan limits; only a clearly labelled mock payment provider (no payments yet).

## Architecture

```
apps/web (React SPA, GitHub Pages) ─┐
apps/mobile (Expo, Android/iOS) ────┼─ HTTPS/JSON ─► apps/api (ASP.NET Core, .NET 10, MonsterASP) ─► SQL Server
customer browser (#/q/{token}) ─────┘                         │   ├─ storage: App_Data or Cloudflare R2
                                                               │   └─ SMTP (outbox dispatcher)
GitHub Actions cron ── POST /api/internal/jobs/run ────────────┘
```

Layered backend (Domain → Application → Infrastructure → Api), EF Core with fail-closed multi-tenant query filters,
JWT + rotating refresh tokens, rate limiting, QuestPDF rendering, background jobs with a SQL Server application lock.
Details: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## Repository layout

| Path | Content |
|---|---|
| `apps/api/src/AngebotPilot.Domain` | Entities, state machines, calculator, follow-up planner, plans |
| `apps/api/src/AngebotPilot.Application` | Services, validators, email templates, job runner |
| `apps/api/src/AngebotPilot.Infrastructure` | EF Core, migrations, storage, email, PDF, mock billing |
| `apps/api/src/AngebotPilot.Api` | Minimal API endpoints, auth, rate limiting, hosted scheduler, demo seeder |
| `apps/web` | React 19 + Vite web app (hash routing; German/English UI, light/dark theme) |
| `apps/mobile` | Expo SDK 57 / React Native app |
| `packages/api-contracts` | Shared TypeScript API types, client, schemas, money helpers |
| `packages/brand` | Design tokens and logo/icon sources |
| `tests/api-unit`, `tests/api-integration` | xUnit tests (integration tests against SQL Server) |
| `tests/web-unit`, `tests/web-e2e`, `tests/mobile/maestro` | Web unit-test setup, Playwright E2E specs, Maestro mobile flow |
| `scripts/` | Deployment, migration, smoke test, web publishing |
| `deploy/pages-repo/` | Files copied into the public GitHub Pages repository (scheduled-jobs workflow) |
| `store-assets/` | Store icons and feature graphic |
| `docs/` | Documentation (see below) |

## Quick start

Prerequisites: .NET 10 SDK, Node 22 (use `npx -y npm@11`), SQL Server LocalDB or Docker.

```bash
dotnet tool restore && dotnet restore AngebotPilot.sln
npx -y npm@11 ci
cd apps/api/src/AngebotPilot.Api && dotnet user-secrets set "Jwt:SigningKey" "<32+ random characters>" && cd -
npm run api        # API on http://localhost:5080 (creates/migrates the LocalDB database in Development)
npm run web        # web app on http://localhost:5173
dotnet run --project apps/api/src/AngebotPilot.Api -- seed-demo   # optional demo company
dotnet test AngebotPilot.sln
```

Full guide incl. mobile emulator: [docs/deployment/LOCAL-DEVELOPMENT.md](docs/deployment/LOCAL-DEVELOPMENT.md).

## Documentation

- Architecture: [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), [DATABASE.md](docs/architecture/DATABASE.md)
- Security: [THREAT-MODEL.md](docs/security/THREAT-MODEL.md), [SECURITY-CHECKLIST.md](docs/security/SECURITY-CHECKLIST.md), [SECURITY.md](SECURITY.md)
- Deployment: [LOCAL-DEVELOPMENT.md](docs/deployment/LOCAL-DEVELOPMENT.md),
  [MONSTERASP-DEPLOYMENT.md](docs/deployment/MONSTERASP-DEPLOYMENT.md),
  [GITHUB-PAGES.md](docs/deployment/GITHUB-PAGES.md), [CLOUDFLARE-PAGES.md](docs/deployment/CLOUDFLARE-PAGES.md),
  [CLOUDFLARE-R2.md](docs/deployment/CLOUDFLARE-R2.md), [ENVIRONMENT-VARIABLES.md](docs/deployment/ENVIRONMENT-VARIABLES.md),
  [BACKUP-AND-RESTORE.md](docs/deployment/BACKUP-AND-RESTORE.md), [ROLLBACK.md](docs/deployment/ROLLBACK.md)
- Stores: [STORE-READINESS.md](docs/store-listings/STORE-READINESS.md), [google-play.md](docs/store-listings/google-play.md),
  [apple-app-store.md](docs/store-listings/apple-app-store.md), [PRIVACY-QUESTIONNAIRE.md](docs/store-listings/PRIVACY-QUESTIONNAIRE.md),
  [RELEASE-CHECKLIST.md](docs/store-listings/RELEASE-CHECKLIST.md), [ASSET-INVENTORY.md](docs/store-listings/ASSET-INVENTORY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## Deployment targets

| Component | URL |
|---|---|
| API | https://angebotpilot.runasp.net |
| Web app | https://metur100.github.io/Angebot.Pilot.App/ |
| Landing & legal pages | https://metur100.github.io/Angebot.Pilot.Landing/ |
| Mobile app id | `com.certidevelopment.angebotpilot` (Android package and iOS bundle id) |

## Status

Release 1.0.0 (2026-10-13):

- API: https://angebotpilot.runasp.net (MonsterASP.NET, SQL Server) – health: [/health](https://angebotpilot.runasp.net/health)
- Web app: https://metur100.github.io/Angebot.Pilot.App/
- Landing & legal pages: https://metur100.github.io/Angebot.Pilot.Landing/
- Android: signed release AAB built locally (not uploaded to Google Play); iOS: configured, not built (no macOS)
- Test results: [docs/testing/TEST-REPORT.md](docs/testing/TEST-REPORT.md) · open items: [docs/REMAINING-TASKS.md](docs/REMAINING-TASKS.md) · release: [RELEASE-REPORT.md](RELEASE-REPORT.md)

## Contact

Medin Turkes · Certi Development – certidevelopment@gmail.com. Security issues: see [SECURITY.md](SECURITY.md).
