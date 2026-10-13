# Test report

Status of all quality gates with the **actual results** of the commands that were executed.
Legend: ✅ passed · ❌ failed · ⏭️ skipped (with reason) · ⛔ blocked (missing access/infrastructure) · ⏳ pending.

Environment: Windows 11, .NET SDK 10.0.301, Node 22.16.0 (npm 11 via `npx -y npm@11`), SQL Server LocalDB 17
(SQL Server 2025 engine), Java 21, Android SDK 36/37, emulator Pixel_10_Pro_XL. Date: 2026-10-13.

## Summary

| Gate | Command | Result |
|---|---|---|
| C# build (warnings as errors, analyzers) | `dotnet build AngebotPilot.sln` | ✅ 0 warnings, 0 errors |
| C# formatting | `dotnet format AngebotPilot.sln --verify-no-changes --severity error` | ✅ |
| Backend unit tests | `dotnet test tests/api-unit` | ✅ 112/112 |
| Backend integration tests (real SQL Server) | `dotnet test tests/api-integration` | ✅ 44/44 (LocalDB, fresh database per run, dropped afterwards) |
| Contracts package tests | `npm run test:contracts` | ✅ 7/7 |
| Web typecheck | `npm run typecheck --workspace apps/web` | ✅ |
| Web lint (ESLint 9, typescript-eslint, jsx-a11y, react-hooks) | `npm run lint --workspace apps/web` | ✅ |
| Web unit tests (Vitest + RTL + MSW) | `npm run test --workspace apps/web` | ✅ 56/56 (3 files) |
| Web production build | `npm run build --workspace apps/web` (via Playwright webServer) | ✅ |
| Web E2E + accessibility (Playwright, real API) | `npx playwright test` in `apps/web` | ✅ 34 passed, ⏭️ 2 skipped by design (desktop: mobile-only off-canvas test; screenshot capture is opt-in) |
| Mobile typecheck | `npm run typecheck` in `apps/mobile` | ✅ |
| Mobile lint (eslint-config-expo incl. React Compiler rules) | `npm run lint` | ✅ |
| Mobile tests (Jest + RNTL) | `npx jest --ci` | ✅ 77/77 (9 suites) |
| Mobile bundle | `npx expo export --platform android` | ✅ (5.6 MB Hermes bundle) |
| Mobile UI automation (Maestro 2.11.0) | `maestro test tests/mobile/maestro/login-customer-quotation.yaml` | ✅ passed against the real API on the emulator (2 min 14 s) |
| Android release AAB (upload-key signed) | `gradlew bundleRelease` | ✅ signature verified (certificate SHA-256 `DB:CC:77:22:…:AF:F9`) |
| Android emulator run | install + launch on Pixel_10_Pro_XL | ✅ (debug-signed release APK against the local API) |
| iOS build / simulator tests | – | ⛔ no macOS/Xcode; EAS cloud build needs an Expo account + Apple Developer Program |
| Local deployment smoke test | `node scripts/smoke-test.mjs http://localhost:5080` | ✅ 13/13 |
| Production database migration | `scripts/migrate-database.ps1` (idempotent script, destructive-statement guard) | ✅ `20261012202456_InitialCreate` applied to db73174 (SQL Server 2025 Express) |
| Deployed API smoke test (MonsterASP) | `node scripts/smoke-test.mjs https://angebotpilot.runasp.net` | ✅ 13/13 (HTTPS redirect, headers, CORS, auth, PDF on host, public accept, job, isolation, CSV, cleanup) |
| Production email (netcup SMTP, implicit TLS 465) | app outbox → SMTP | ✅ messages handed off to the mail server; reserved test domains are refused without contacting SMTP |
| Scheduled jobs trigger | GitHub Actions `Scheduled API jobs` (workflow_dispatch) in `Angebot.Pilot.App` | ✅ success (endpoint 200 with secret, 401 without) |
| Deployed web smoke (Playwright, GitHub Pages → MonsterASP) | `npm run e2e:deployed` with a temporary account on a reserved domain (deleted afterwards) | ✅ 8/8 (desktop + mobile: CSP, legal links, hash deep links, public-link handling, real sign-in) |
| NuGet vulnerability scan | `dotnet list package --vulnerable --include-transitive` | ✅ no vulnerable packages |
| npm audit web/contracts (prod deps) | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| npm audit mobile (prod deps) | `npm audit --omit=dev` in `apps/mobile` | ⚠️ 63 advisories, all transitive – see "Accepted findings" |
| Secret scan of commits | `git diff`/`git log -p` scan for known credentials + gitleaks in CI | ✅ no credentials in history (production settings live only in the git-ignored `input/` folder) |

## What the backend tests cover

- **Unit (112):** decimal calculation and rounding (half away from zero, VAT per rate group, discounts, special tax modes),
  invalid inputs, quotation state machine (exhaustive transition table, late acceptance rule, revisions), follow-up
  planning (09:00 local, DST, minimum gap, never after validity), job lifecycle, entitlements, validators (password,
  IBAN checksum, line items, customer types, send options), CSV (BOM, quoting, formula injection), secure tokens,
  email templates (no tracking pixels, opt-out link, HTML encoding), PDF rendering (German text, € amounts, VAT lines,
  multi-page numbering, draft watermark, § 19 note, extractable quotation numbers), source-encoding guard.
- **Integration (44, real SQL Server):** registration/login/lockout, refresh rotation + reuse detection + multi-tab grace
  window, logout, password reset, account export and deletion, company creation defaults, settings validation,
  invitations and role enforcement, privilege-escalation attempts with numeric/undefined roles, last-owner protection,
  plan limits and read-only expired trial, mock billing webhook signature, logo upload validation and privacy, customer
  CRUD/search/archive/concurrency/anonymisation/CSV, sequential and **concurrent** quotation numbering (20 parallel),
  draft vs. sent editing, stale row versions, PDF generation and freezing, duplicate/revision/supersede, list filters
  and CSV, templates, email outbox (verified sender, retries, permanent failure, idempotency), reminders sent once and
  cancelled on acceptance, expiry, external job trigger auth, concurrent job runs (lock), public page (data minimisation,
  accept once, **concurrent decisions**, invalid/revoked/expired links, hashed tokens, opt-out), job conversion once
  (concurrent), **tenant isolation** (foreign company ids, foreign record ids, CSV, token lookup), migrations applied with
  no pending model changes, health/security headers, and the complete 14-step business workflow.

## Defects found by testing and fixed

| Defect | Found by | Fix |
|---|---|---|
| Web bundle published with wrong asset base path (Git Bash converted `/Angebot.Pilot.App/` to a Windows path) | deployed Playwright smoke | MSYS env-conversion exclusion + guard in `scripts/publish-web.sh` |
| Jobs trigger rejected by IIS (HTTP 411, POST without Content-Length) | deployed workflow run | explicit empty body |
| Smoke-test registrations emailed reserved test domains (bounces) | production outbox review | reserved domains refused; queued emails cancelled on account deletion |
| Stale quotation edits with identical content were accepted (EF skipped the UPDATE) | integration test | explicit row-version comparison before saving |
| Concurrent job conversion produced HTTP 500 (serializable deadlock) | integration test | read-committed + unique index, SQL conflicts mapped to 409 |
| Concurrent customer decisions produced HTTP 500 (idempotency key collision) | integration test | treated as "already decided" (409) |
| Account deletion failed when the user had memberships | integration test | change tracker cleared, set-based delete |
| Public tokens appeared in request logs | test log review | route templates only, request-path enricher |
| Quotation numbers in PDFs were not copyable (font contextual alternates) | PDF text extraction | `calt` disabled |
| Admin could escalate to a numeric role value above Owner | documentation/security review | string-only enums, validators, `Enum.IsDefined` guards + test |
| Double-encoded German texts in three backend files | security review | repaired + guard test |
| Mobile: empty customer picker, dead close button, price formatting, wrapping tax field | emulator testing | fixed in `apps/mobile` |

## Accepted findings

- **npm audit (mobile):** 63 advisories stem from 5 transitive packages. `braces`, `node-forge`, `sprintf-js` have **no
  patched release** and are only used by the Expo/Metro/Jest build tooling. `uuid@7` is used by the iOS project editor
  `xcode` during prebuild (tooling). `decode-uri-component@0.2.2` (via `expo-router` → `query-string@7`) is part of the app
  bundle; the patched 0.5.0 is ESM-only and cannot be loaded by `query-string@7`'s CommonJS `require`. Impact: a crafted
  deep link could make the client hang (local DoS only, no data exposure). Re-check with the next Expo SDK update.
- Rate limits are scaled ×1000 in integration tests and are not load-tested.

## Not executed / blocked

- iOS build, simulator tests and screenshots: no macOS (see `docs/testing/SCREENSHOT-INVENTORY.md`).
- Inbox delivery to real customer mailboxes depends on SPF/DKIM/DMARC of gentlegroup.de (owner check).
