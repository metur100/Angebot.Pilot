# Release report – AngebotPilot 1.0.0

Date: 2026-10-13 · Owner: Medin Turkes · Certi Development. All results below come from commands that were actually executed;
details and command lines are in [docs/testing/TEST-REPORT.md](docs/testing/TEST-REPORT.md).

## Live environments

| What | Where | Verified |
|---|---|---|
| API (ASP.NET Core .NET 10) | https://angebotpilot.runasp.net (MonsterASP.NET, site98194) | `/health` + `/health/ready` OK, production smoke test 13/13 |
| Database | MonsterASP SQL Server 2025 Express `db73174` | migration `20261012202456_InitialCreate` applied |
| Web app | https://metur100.github.io/Angebot.Pilot.App/ (public repo `metur100/Angebot.Pilot.App`, built bundle only) | deployed Playwright smoke 8/8 (desktop + mobile, real sign-in) |
| Landing + legal pages | https://metur100.github.io/Angebot.Pilot.Landing/ (public repo `metur100/Angebot.Pilot.Landing`) | pages return 200; axe 0 violations (landing review) |
| Scheduled jobs | GitHub Actions cron (every 15 min) in `Angebot.Pilot.App` → authenticated `/api/internal/jobs/run` | manual run succeeded |
| Email | netcup SMTP (implicit TLS 465) as `AngebotPilot <office@gentlegroup.de>` | messages handed off by the production outbox |
| Source code | private repo – see "Repository" below | – |

## Implemented features

Registration/login with rotating refresh tokens, email verification, password reset, account export/deletion; companies
with Owner/Admin/Employee roles, invitations, deactivation; strict tenant isolation; customers (business/private, search,
archive, delete or anonymise, CSV); quotation editor with server-side decimal calculation and VAT per rate, templates,
revisions, duplicates, concurrency-safe numbering; professional PDFs (QuestPDF, embedded Inter, QR code, frozen after
sending); email sending with PDF and secure customer link, outbox with retries/idempotency, automatic reminders with
opt-out; public customer page with accept/reject once; conversion to jobs with lifecycle; dashboard with defined
conversion rate; notifications and activity; company/branding/document/notification settings with logo upload; billing
abstraction with a clearly labelled mock provider (no payments); web app (React) and native Android/iOS app (Expo)
on the same API.

## Build and test results

| Area | Result |
|---|---|
| .NET build (warnings as errors) / format | ✅ 0 warnings, 0 errors / ✅ |
| Backend unit / integration (real SQL Server) | ✅ 112/112 / ✅ 44/44 |
| Contracts | ✅ 7/7 |
| Web typecheck / lint / unit / E2E + a11y | ✅ / ✅ / ✅ 56/56 / ✅ 34 passed, 2 skipped by design |
| Mobile typecheck / lint / Jest / Maestro | ✅ / ✅ / ✅ 77/77 / ✅ 1 flow |
| Production smoke (API) / deployed web smoke | ✅ 13/13 / ✅ 8/8 |
| NuGet / npm (web) vulnerabilities | ✅ none |
| npm (mobile) | ⚠️ 63 transitive advisories in Expo tooling + one client-side DoS in deep-link parsing; no compatible fix – accepted, see TEST-REPORT |

**Not executed (blocked):** iOS build, simulator tests and iOS screenshots – no macOS/Xcode available.

## Artifacts

| Artifact | Location | Notes |
|---|---|---|
| Android App Bundle 1.0.0 (versionCode 1) | `artifacts/android/angebotpilot-1.0.0-1-release.aab` (git-ignored, local) | signed with the upload key `C:\Users\TurkesMedin\keystore\angebotpilot` (alias `angebotpilot-upload`, cert SHA-256 `DB:CC:77:22:…:AF:F9`); SHA-256 of file `e677e632…1f55`; built against the production API; **not uploaded** |
| iOS build | – | not built (blocked) |
| Screenshots | `screenshots/web/` (11), `screenshots/android/` (6) | genuine, see [inventory](docs/testing/SCREENSHOT-INVENTORY.md) |
| Store artwork | `store-assets/` | Play icon, feature graphic, 6 Play screenshots; iOS icon |
| Store texts & questionnaires | `docs/store-listings/` | prepared, **not submitted** |

## Security

Security review findings and their status are in [docs/security/THREAT-MODEL.md](docs/security/THREAT-MODEL.md) and
[docs/security/SECURITY-CHECKLIST.md](docs/security/SECURITY-CHECKLIST.md). Fixed before release: role escalation via
numeric enum values, one-time links stored in email bodies, mock billing webhook reachable in production, emails
reported as sent without a provider, double-encoded German texts, tokens in request logs, stale-edit concurrency gap,
concurrency 500s. Accepted residual risks: refresh token in browser storage on the shared `metur100.github.io` origin
(fix: own domain + cookie transport), tokens in hoster access logs, client-side DoS in Expo's deep-link parsing.

## Hosting notes and known limitations

- **MonsterASP Free plan forbids commercial use** – upgrade to a paid plan before taking paying customers.
- Files (logos, sent PDFs) are stored on the MonsterASP disk (`App_Data`, excluded from deployments); back them up or switch to Cloudflare R2.
- No payment provider: plan changes are refused in production; prices on the landing page are marked preliminary.
- GitHub may delay scheduled runs and disables schedules after 60 days without repository activity; the API also runs jobs while it is awake.

## Manual actions for the owner

See [docs/REMAINING-TASKS.md](docs/REMAINING-TASKS.md) – in short: paid hosting plan, SPF/DKIM/DMARC for gentlegroup.de and
AVV with netcup, legal placeholders + legal review on the landing site, backup of the Android upload key, Google Play and
Apple developer accounts (closed test with 12 testers for 14 days on Play), payment provider.

## Repository

- Private repository: https://github.com/metur100/Angebot.Pilot (visibility verified: private)
- Release commit: `97d73440eb69b41de0766e6455bd78b80f999bd4` on `main` – verified identical on the remote (`git ls-remote`), 493 files, no secrets, keys, build output or owner credentials in the tree or history
- All quality gates in this report were run on that commit. This file and `docs/REMAINING-TASKS.md` were updated afterwards in a documentation-only commit.
