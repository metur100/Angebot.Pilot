# Remaining tasks

Living checklist for AngebotPilot. `[x]` = done and verified, `[ ]` = open. Items marked **Owner** need
access, accounts, money or legal decisions only the owner can provide.

## Engineering

### Backend (apps/api)
- [x] Layered .NET 10 API, EF Core + SQL Server, migrations
- [x] Auth: register/login/refresh rotation with reuse detection, logout, lockout, password reset, email verification
- [x] Companies, memberships, roles (Owner/Admin/Employee), invitations, deactivation
- [x] Fail-closed tenant query filters + route-scoped membership check
- [x] Customers (CRUD, search, archive, delete vs. anonymise, CSV)
- [x] Quotations (decimal calculation, VAT per rate, revisions, duplicate, concurrency-safe numbering, CSV)
- [x] PDF generation (QuestPDF, embedded Inter, QR code, frozen after sending)
- [x] Email outbox, retries, idempotency, follow-up planning/cancellation, opt-out
- [x] Public customer page (hashed tokens, revoke/expiry, accept/reject once, PDF)
- [x] Jobs (conversion once, lifecycle), templates, dashboard, notifications, activity
- [x] Billing abstraction + clearly labelled mock provider, entitlements and plan limits
- [x] Scheduled jobs: hosted scheduler + authenticated external trigger with DB lock
- [x] Unit tests (101) and SQL Server integration tests (42) passing locally
- [x] Smoke test script (`scripts/smoke-test.mjs`) passing locally (13/13)

### Web (apps/web)
- [ ] Finish remaining screens and visual QA (agent in progress)
- [ ] Unit tests (Vitest + RTL) – none written yet at last check
- [ ] Playwright E2E against the real API + accessibility checks
- [ ] Official screenshots in `screenshots/web/`

### Mobile (apps/mobile)
- [ ] Finish screens, emulator verification against the real API (agent in progress)
- [ ] Official Android screenshots in `screenshots/android/`
- [ ] Signed release AAB with the owner's upload key (stored outside the repo)
- [ ] iOS build/screenshots – **blocked**: no macOS/Xcode; EAS cloud build needs an Expo account and Apple Developer membership

### Documentation
- [ ] Architecture, database, threat model, security checklist, deployment, store listings (in progress)
- [ ] TEST-REPORT, SCREENSHOT-INVENTORY, RELEASE-REPORT with actual results

## Deployment
- [x] Production SQL Server reachable (encrypted connection verified)
- [ ] **Owner:** remove the other application's 32 tables from database `db73174` (created 2026-10-12 22:56 by a different app; AngebotPilot will not delete them). Then: `scripts/migrate-database.ps1`
- [ ] Deploy API with `scripts/deploy-api.ps1`, then `node scripts/smoke-test.mjs https://angebotpilot.runasp.net`
- [ ] Create public repos `Angebot.Pilot.App` (GitHub Pages, built bundle only) and `Angebot.Pilot.Landing`; enable Pages
- [ ] Add `JOBS_TRIGGER_SECRET` secret to `Angebot.Pilot.App` for the scheduled-jobs workflow
- [ ] Push private source repo `Angebot.Pilot` after all quality gates pass

## Owner actions before commercial launch
- [ ] **Owner:** MonsterASP Free plan forbids commercial use → upgrade to a paid plan (Premium) before taking paying customers
- [ ] **Owner:** choose a transactional email provider (e.g. Brevo, Resend), verify a sending domain (SPF/DKIM/DMARC) and provide SMTP credentials. Until then production uses the capture sink and **no email is delivered** (account verification and email sending of quotations are therefore not usable in production)
- [ ] **Owner:** decide on object storage (Cloudflare R2 requires a subscription checkout) or keep local storage with regular App_Data backups
- [ ] **Owner:** fill in legal placeholders on the landing site (address, phone, VAT ID, …) and obtain legal review of Impressum, Datenschutz, AGB, AVV
- [ ] **Owner:** sign data processing agreements with processors (hosting, email, storage)
- [ ] **Owner:** Google Play developer account (closed test with 12 testers for 14 days for new personal accounts), Apple Developer Program for iOS
- [ ] **Owner:** confirm preliminary prices and choose a payment provider before enabling paid plans
