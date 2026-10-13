# Remaining tasks

Living checklist for AngebotPilot. `[x]` = done and verified, `[ ]` = open. Items marked **Owner** need
access, accounts, money or legal decisions only the owner can provide. Last updated: 2026-10-13.

## Engineering

### Backend (apps/api)
- [x] Layered .NET 10 API, EF Core + SQL Server, migrations
- [x] Auth: register/login/refresh rotation (reuse detection + 30 s multi-tab grace), logout, lockout, password reset, email verification
- [x] Companies, memberships, roles (Owner/Admin/Employee), invitations, deactivation; numeric/undefined enum values rejected
- [x] Fail-closed tenant query filters + route-scoped membership check
- [x] Customers, quotations, PDFs, email outbox with retries/idempotency, follow-ups, public customer page, jobs, templates, dashboard, notifications, billing abstraction
- [x] Stored email bodies scrubbed after the final send state (no one-time links at rest)
- [x] Unit tests (112) and SQL Server integration tests (44) passing locally
- [x] Smoke test script passing locally (13/13)

### Web (apps/web)
- [x] All screens, design system, CSP for GitHub Pages
- [x] Vitest unit tests (56), Playwright business workflow + axe accessibility (34 passed, 2 skipped by design)
- [x] Official screenshots in `screenshots/web/`

### Mobile (apps/mobile)
- [x] Expo SDK 57 app, 77 Jest tests, Maestro flow passed against the real API
- [x] Android screenshots (`screenshots/android/`) and Play-ready store screenshots (`store-assets/android/phone-screenshots/`)
- [x] Signed release AAB with the upload key (stored outside the repo)
- [ ] iOS build/screenshots – **blocked**: no macOS/Xcode; EAS cloud build needs an Expo account and Apple Developer membership

### Documentation
- [x] Architecture, database, threat model, security checklist, deployment, store listings
- [x] TEST-REPORT, SCREENSHOT-INVENTORY, RELEASE-REPORT with final results

## Deployment
- [x] Landing site live: https://metur100.github.io/Angebot.Pilot.Landing/
- [x] Production SQL Server reachable (encrypted connection verified)
- [x] SMTP (netcup, office@gentlegroup.de, port 465/TLS) authenticated successfully; configured in the git-ignored production settings
- [x] Foreign tables removed from `db73174` on the owner's request (JSON backup kept in the git-ignored `input/` folder), migrations applied
- [x] API deployed to https://angebotpilot.runasp.net – production smoke test 13/13
- [x] Web app live at https://metur100.github.io/Angebot.Pilot.App/ (public repo `Angebot.Pilot.App`, built bundle only) – deployed smoke 8/8
- [x] Scheduled jobs: GitHub Actions cron every 15 min with `JOBS_TRIGGER_SECRET` – manual run succeeded
- [x] Private source repo pushed after all quality gates: https://github.com/metur100/Angebot.Pilot (release commit 97d7344)

## Owner actions before commercial launch
- [ ] **Owner:** MonsterASP Free plan forbids commercial use → upgrade to a paid plan (Premium) before taking paying customers
- [ ] **Owner:** check SPF/DKIM/DMARC for gentlegroup.de so customer emails are not marked as spam; sign a data processing agreement (AVV) with netcup
- [ ] **Owner:** decide on object storage (Cloudflare R2 requires a subscription checkout) or keep local storage with regular App_Data backups
- [ ] **Owner:** fill in legal placeholders on the landing site (address, phone, VAT ID, …) and obtain legal review of Impressum, Datenschutz, AGB, AVV
- [ ] **Owner:** back up the Android upload key `C:\Users\TurkesMedin\keystore\angebotpilot` and its password file to a second secure location
- [ ] **Owner:** Google Play developer account (closed test with 12 testers for 14 days for new personal accounts), Apple Developer Program for iOS
- [ ] **Owner:** confirm preliminary prices and choose a payment provider before enabling paid plans
