# AngebotPilot – Threat Model

Scope: API (`apps/api`), web SPA (`apps/web`, GitHub Pages), mobile app (`apps/mobile`), public customer page,
scheduled jobs, deployment on MonsterASP.NET. Method: STRIDE per threat (S = Spoofing, T = Tampering,
R = Repudiation, I = Information disclosure, D = Denial of service, E = Elevation of privilege).

Each entry states the mitigation **as implemented** (with file references), the automated tests that cover it, and
the residual risk with a recommendation. Test names refer to `tests/api-unit` and `tests/api-integration`; this
document does not report test results.

Related: [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) · [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md)

## Assets and trust boundaries

| Asset | Where |
|---|---|
| Customer master data (names, addresses, emails, phone, VAT ids, notes) | `Customers`, quotation recipient snapshots, PDFs, CSV/JSON exports |
| Quotations, prices, internal notes | `Quotations`, `QuotationLineItems`, stored PDFs |
| Account credentials and sessions | `Users.PasswordHash`, refresh tokens (DB hash; client storage), JWT signing key |
| One-time tokens | public links, invitations, password reset, email verification |
| Secrets | `Jwt:SigningKey`, `Jobs:TriggerSecret`, `Billing:WebhookSecret`, SMTP/S3 credentials, DB connection string, MonsterASP publish profile, Android upload keystore |
| Company branding & bank details | `Companies`, `CompanySettings`, logo files |

Trust boundaries: browser/mobile ↔ API (internet, TLS); customer browser (unauthenticated, token) ↔ API;
GitHub Actions ↔ API (shared secret); API ↔ SQL Server (TLS, `Encrypt=True;TrustServerCertificate=True`);
API ↔ SMTP/R2 (TLS); operator workstation ↔ MonsterASP (Web Deploy, SQL remote access).

---

## Summary

| # | Threat | STRIDE | Residual risk |
|---|---|---|---|
| T1 | Cross-company data access | I, T, E | Low |
| T2 | Unauthorised quotation access / role abuse inside a company | E, T | **High until fixed** (role value not validated, see T2) |
| T3 | Public-link guessing or reuse | I, S | Low–Medium |
| T4 | Forged customer acceptance | S, R | Medium (inherent to click-acceptance) |
| T5 | Email abuse | S, D | Medium (no SMTP yet; sender domain auth pending) |
| T6 | Malicious uploads | T, E | Low |
| T7 | Token theft (web) | S, E | **Medium–High** (localStorage on shared github.io origin) |
| T8 | Insecure mobile storage | I | Low |
| T9 | Credential / secret leakage | I, E | Medium |
| T10 | Scheduled-job abuse | D, E | Low |
| T11 | Subscription / authorisation bypass | E | Medium (mock webhook secret) |
| T12 | CSV / formula injection | T | Low |
| T13 | Log and data leakage | I | Medium |
| T14 | Denial of service / rate limiting | D | Medium (single small host) |
| T15 | SQL injection | T, I | Low |
| T16 | Account enumeration, brute force, lockout abuse | S, D, I | Medium |
| T17 | Clickjacking and XSS in the web app | T, E | Low–Medium |
| T18 | Supply chain and build integrity | T, E | Medium |

---

## T1 Cross-company data access

**Threat.** A member of company A reads or modifies records of company B by changing ids in URLs or bodies.

**Mitigation (implemented).**
- Company-scoped routes `/api/v1/companies/{companyId}` with `CompanyMemberFilter`
  (`apps/api/src/AngebotPilot.Api/Infrastructure/ApiInfrastructure.cs`) → `CompanyAccess.ResolveAsync`
  (`Application/Companies/CompanyService.cs`): active membership of a non-disabled user required; otherwise **404**.
- Fail-closed EF Core global query filters on all tenant-owned sets
  (`Infrastructure/Persistence/AppDbContext.cs`); no tenant → no rows. `TenantContext.Set` refuses a tenant switch
  within a request (`Application/Abstractions/Abstractions.cs`).
- Foreign ids in bodies (customer, template, assignee) are resolved through filtered sets or explicit company
  predicates (`QuotationService.CreateAsync/UpdateAsync`, `ConvertToJobAsync` assignee check).
- `IgnoreQueryFilters()` only in reviewed places with explicit predicates (list in
  [DATABASE.md](../architecture/DATABASE.md#tenant-filter-coverage)).

**Tests.** `TenantIsolationTests.Another_company_cannot_read_or_modify_records`,
`TenantIsolationTests.Fail_closed_without_tenant`, `BusinessWorkflowTests.Company_to_job_with_isolation_and_export`,
smoke test step "tenant isolation" (`scripts/smoke-test.mjs`).

**Residual risk / recommendation.** Low. Tables without a filter (`EmailDeliveries`, `AuditEvents`, `Memberships`,
`Subscriptions`, …) depend on every query adding the company predicate – keep reviewing new queries against these
sets; consider adding filters for `EmailDeliveries` and `AuditEvents`.

## T2 Unauthorised quotation access and role abuse inside a company

**Threat.** An employee or admin performs actions beyond their role, or escalates their role.

**Mitigation (implemented).**
- Roles `Employee (0) < Admin (1) < Owner (2)`; `CurrentMember.Require(minimum)` (`Application/Common/Common.cs`).
- Admin+: company/settings updates, logo, tax rates, team management, invitations, CSV exports, customer deletion.
  Owner: company deletion, company JSON export, plan changes, granting/removing the Owner role. At least one active
  owner is enforced (`EnsureAnotherOwnerAsync`); invitations cannot grant Owner (`CreateInvitationRequestValidator`).
- Quotation actions (create, edit, send, record decision, cancel, revise, convert) are deliberately available to
  every active member.

**Tests.** `CompanyAndTeamTests.Invitation_flow_and_role_enforcement`,
`CompanyAndTeamTests.Last_owner_cannot_be_demoted_or_deactivated`.

**Finding – role value is not validated (privilege escalation).** `PATCH /companies/{id}/members/{membershipId}`
(`Api/Endpoints/Endpoints.cs`, members route) has no validator, and `JsonStringEnumConverter` accepts integer values by
default. `UpdateMemberRoleAsync` (`Application/Companies/CompanyService.cs`, lines 251–268) only blocks
`role == Owner`; an **Admin** can therefore set any membership – including their own – to an undefined value such as
`3`. Because `Require` compares numerically (`member.Role < minimum`), such a role passes every Owner check
(e.g. company deletion, company export). **Recommendation:** add `UpdateMemberRequestValidator` with
`IsInEnum()` and use it on the route; reject undefined enum values globally
(`new JsonStringEnumConverter(allowIntegerValues: false)`); add an integration test. Same pattern, lower impact:
`ChangePlanRequest.Plan` (undefined value → 500 via `PlanCatalog.For`) and `ChangeJobStatusRequest.Status`
(rejected by the state machine).

**Residual risk.** High until the finding is fixed; Low afterwards. Consider restricting "record decision" and
"cancel" to Admin+ if customers' companies want stricter separation.

## T3 Public-link guessing or reuse

**Threat.** An attacker guesses a token, or a forwarded/leaked link is used to view or decide on a quotation.

**Mitigation (implemented).** 256-bit tokens from `RandomNumberGenerator`, only SHA-256 hashes stored
(`SecureTokens`, `PublicLinks.Create`); format pre-check; expiry = end of `ValidUntil` + 60 days grace
(`App:PublicLinkGraceDays`); revocation by user, on cancellation, on supersede and when a new link is created; drafts
and deleted quotations return 410; responses `no-store` + `X-Robots-Tag: noindex, nofollow`; the web page sets
`<meta name="referrer" content="no-referrer">` and the token is in the URL fragment of the static site; rate limit
`public` 60/min/IP; tokens never in application logs (route templates only).

**Tests.** `PublicQuotationTests.Invalid_revoked_and_expired_links_are_refused`,
`PublicQuotationTests.Only_token_hashes_are_stored`, `PublicQuotationTests.Customer_sees_only_intended_data_and_can_accept_once`,
`SecureTokenTests.Tokens_are_random_url_safe_and_hashed`.

**Residual risk / recommendation.** Guessing: negligible. Reuse: anyone holding the link (forwarded email, shared
device, mailbox compromise) can view and decide – by design. Every reminder adds another valid token, so a quotation
can have several live links; "new link" revokes all of them. Tokens appear in API request paths and therefore
potentially in **IIS/hosting access logs** (see T13), and raw tokens are stored in `EmailDeliveries` bodies.
Recommendation: purge or redact email bodies after hand-off, and ask the host about access-log retention.

## T4 Forged customer acceptance

**Threat.** Someone other than the customer accepts a quotation, or the customer later denies having accepted it.

**Mitigation (implemented).** Acceptance requires possession of the link, a typed full name (3–150 chars) and the
explicit `confirmBinding` checkbox (`PublicAcceptRequestValidator`); only from `Sent` and before validity ends;
exactly one decision wins (row version + idempotency key; `409 already_decided`); the decision is stored with
timestamp, name and note (`Quotations.Decision*`), a `QuotationEvent` (actor `Customer`) and an audit event; the
company is notified in-app and (optionally) by email. The page states that the click acceptance is a declaration of
intent and **not** a qualified electronic signature (`apps/web/src/features/public/PublicQuotationPage.tsx`).

**Tests.** `PublicQuotationTests.Customer_sees_only_intended_data_and_can_accept_once`,
`PublicQuotationTests.Concurrent_decisions_produce_exactly_one_result`,
`QuotationLifecycleTests.Customer_cannot_accept_after_validity_but_user_may_record_late_acceptance`,
`ValidatorTests.Public_acceptance_requires_name_and_confirmation`.

**Residual risk / recommendation.** Medium, inherent: no identity proof, IP address and user agent are not stored.
For high-value quotations users should confirm acceptance through a second channel. Legal review of the acceptance
wording is an owner action. Optionally record a hash of the frozen PDF with the decision.

## T5 Email abuse

**Threat.** The platform is used to send spam/phishing to arbitrary addresses, to spoof senders, or to flood a
mailbox with invitations, resets or reminders.

**Mitigation (implemented).**
- Sending quotations by email requires a **verified** account email (`QuotationService.SendAsync`,
  `email_not_verified`) and an active subscription; rate limit `send` 30 per 10 min per user; plan quota of emails per
  rolling 24 h (`BillingService.EnsureEmailQuotaAsync`, Trial 50/day).
- Reset/verification emails: max. 3 per user per hour plus IP rate limits; `forgot-password` does not reveal whether
  the account exists. Invitations: Admin+, `auth` rate limit, member/plan limits.
- Reminders: max. three kinds per quotation (unique `(QuotationId, Kind)`), ≥ 48 h apart, never after validity,
  stop on decision/cancel/expiry, one-click opt-out for the customer, `Auto-Submitted: auto-generated` header.
- Sender: always the platform's `Email:FromAddress` with display name "{Company} via AngebotPilot"; company address
  only as Reply-To (`Infrastructure/Email/EmailSenders.cs`) – the platform does not spoof customer domains.
- Templates HTML-encode user content (`EmailTemplates.Enc`); emails contain no tracking pixels
  (`EmailTemplateTests.Quotation_email_contains_number_next_step_and_opt_out_but_no_tracking`).

**Tests.** `SendingAndFollowUpTests.Email_send_requires_verified_sender`,
`SendingAndFollowUpTests.Sending_queues_email_with_pdf_and_link_and_schedules_follow_ups`,
`SendingAndFollowUpTests.Due_reminder_is_sent_once_and_further_reminders_stop_after_acceptance`,
`AuthTests.Password_reset_via_emailed_single_use_token`.

**Residual risk / recommendation.** Medium. Production email currently uses the `Capture` sink, so nothing is
delivered and no abuse is possible yet – but also no verification emails (see launch blockers). Before enabling SMTP:
verify the sending domain with SPF, DKIM and DMARC; disable open/click tracking at the provider; monitor bounces and
complaints; the email quota is not applied to invitations and account emails.

## T6 Malicious uploads

**Threat.** Uploading executable content, oversized files or path-traversal names; serving uploads with a dangerous
content type.

**Mitigation (implemented).** Only company logos can be uploaded (Admin+, rate limit `upload` 20/10 min, endpoint
size limit 2 MiB, content ≤ 1 MiB); extension allow-list `.png/.jpg/.jpeg` **plus** magic-byte check; stored content
type from the allow-list, not from the client; server-generated object keys with regex and root-containment checks
(`Infrastructure/Storage/FileStorage.cs`); objects are private and only streamed through authenticated or
token-checked endpoints; API responses carry `nosniff` and `default-src 'none'` CSP.

**Tests.** `CompanyAndTeamTests.Logo_upload_validates_content_and_is_private`.

**Residual risk / recommendation.** Low. Images are not re-encoded, so metadata (EXIF) and polyglot payloads after a
valid header are kept; they are only rendered as images (`img-src`) and embedded in PDFs by QuestPDF. Consider
re-encoding logos server-side and stripping metadata.

## T7 Token theft (web)

**Threat.** An attacker obtains a refresh token from the browser and keeps a session for up to 30 days.

**Mitigation (implemented).** Access token in memory only (15 min); refresh token rotated on every use with family
revocation on reuse (`AuthService.RefreshAsync`); "remember me" off → `sessionStorage`; logout revokes the family;
password change/reset revokes all tokens; strict CSP via meta tag in production builds
(`apps/web/vite.config.ts`: `script-src 'self'`, `connect-src` limited to the API origin, `object-src 'none'`);
`no-referrer`; HTTPS only.

**Trade-off.** Because the SPA (`metur100.github.io`) and the API (`angebotpilot.runasp.net`) are on different sites,
an HttpOnly `SameSite` cookie would be a third-party cookie and is blocked by many browsers. The deployment therefore
uses `Auth:WebRefreshTransport=Body`, and the refresh token lives in `localStorage`/`sessionStorage`, readable by any
script running on the origin.

**Important:** `https://metur100.github.io` is shared by **all** GitHub Pages project sites of the account (the
landing site, the app, and any other repository published with Pages). Script on any of these pages runs in the same
origin and can read the app's `localStorage`; it is also an allowed CORS origin of the API.

**Tests.** `AuthTests.Refresh_rotates_tokens_and_reuse_revokes_the_family`,
`AuthTests.Logout_revokes_refresh_token_and_protected_endpoints_need_a_token`.

**Residual risk / recommendation.** Medium–High for the github.io setup. Hardening path (documented in
[CLOUDFLARE-PAGES.md](../deployment/CLOUDFLARE-PAGES.md) and [GITHUB-PAGES.md](../deployment/GITHUB-PAGES.md)):
1. Serve the app from its own custom domain on the same site as the API (e.g. `app.example.de` + `api.example.de`)
   and switch to `Auth:WebRefreshTransport=Cookie` (requires the web client to send `credentials: 'include'` – code
   change); restrict `Cors:AllowedOrigins` to that exact origin.
2. Until then: publish nothing else with untrusted scripts under `metur100.github.io`, keep the landing site
   script-free or same-reviewed, and advise users to leave "Angemeldet bleiben" off on shared devices.
3. Multiple tabs share the same `localStorage` token; simultaneous refreshes in two tabs can trigger reuse detection
   and log the user out (availability, not security).

## T8 Insecure mobile storage

**Threat.** Tokens or business data extracted from a lost/rooted device or backups.

**Mitigation (implemented).** Refresh token and active company id in `expo-secure-store` (Android Keystore / iOS
Keychain) (`apps/mobile/src/lib/session.ts`); access token in memory; secure-store plugin with
`configureAndroidBackup: true` (`apps/mobile/app.config.ts`); cleartext HTTP is only allowed for local emulator
builds (`plugins/withLocalCleartext.js` applied only when the API URL starts with `http://`); minimal permissions
(camera for QR scanning, internet, network state; storage/media/audio permissions explicitly blocked); logout wipes
SecureStore and the query cache.

**Tests.** `apps/mobile/__tests__/session.test.ts` (mobile Jest suite; results not reported here).

**Residual risk / recommendation.** Low. Query cache content is in memory; PDFs shared via `expo-sharing` leave the
app's control by user action. No certificate pinning (acceptable for this risk level). No app-level lock/biometrics.

## T9 Credential and secret leakage

**Threat.** Secrets committed to Git, leaked from build artefacts, CI logs or operator machines.

**Mitigation (implemented).** `.gitignore` excludes `.env*`, `appsettings.Production.json`, `appsettings.*.local.json`,
keystores (`*.jks`, `*.keystore`, `*.p12`, …), `*.publishSettings`, `input/`, `artifacts/`, native `android/`/`ios/`
folders; `appsettings.json` contains empty secrets; development secrets via `dotnet user-secrets`
(`UserSecretsId = angebotpilot-api-dev`); `deploy-api.ps1` reads the publish profile and production settings from
outside Git and masks the password in its output; `migrate-database.ps1` reads the connection string from an
environment variable and removes the variables afterwards; CI runs gitleaks with full history; the jobs secret is a
GitHub Actions secret; Android signing values come from Gradle properties/environment variables
(`apps/mobile/plugins/withAndroidReleaseSigning.js`).

**Residual risk / recommendation.** Medium.
- `appsettings.Production.json` lives on the MonsterASP file system next to the binaries; anyone with control-panel/FTP
  access can read it. Prefer MonsterASP environment variables (control panel → Scripting → Environment variables).
- `deploy-api.ps1` passes the Web Deploy password on the `msdeploy.exe` command line (visible to local process
  listings) and uses `-allowUntrusted` (no TLS certificate validation of the Web Deploy endpoint – credential exposure
  to a network attacker). Recommendation: drop `-allowUntrusted` if the endpoint presents a valid certificate.
- If the Android signing variables are missing, release builds silently fall back to the **debug** key (Gradle
  warning only) – verify the certificate before upload ([RELEASE-CHECKLIST.md](../store-listings/RELEASE-CHECKLIST.md)).
- Rotate every secret that ever appeared in a terminal transcript, chat or screenshot before launch.

## T10 Scheduled-job abuse

**Threat.** Unauthenticated callers trigger jobs (email floods, load) or brute-force the trigger secret.

**Mitigation (implemented).** `POST /api/internal/jobs/run` (`Api/Endpoints/Endpoints.cs`, `RunJobs`): disabled (404)
without a secret of ≥ 32 characters; bearer secret compared via SHA-256 digests and `FixedTimeEquals`; no parameters
(cannot target recipients); rate limit `jobs` 12/min; idempotent steps; SQL application lock serialises runs
(`SqlServerDistributedLock`); emails are claimed before sending.

**Tests.** `SendingAndFollowUpTests.External_job_trigger_requires_the_secret`,
`SendingAndFollowUpTests.Concurrent_job_runs_are_serialised_by_the_lock`.

**Residual risk / recommendation.** Low. The `jobs` limiter has a single shared partition, so anonymous requests can
exhaust it and delay the legitimate trigger (the in-process scheduler still runs while the app is loaded). Consider
partitioning by IP or checking the secret before the limiter.

## T11 Subscription and authorisation bypass

**Threat.** A company gains a paid plan or write access without paying; client-side state is trusted.

**Mitigation (implemented).** Entitlements are evaluated server-side from `Subscriptions` only
(`Domain/Billing/Billing.cs`, `BillingService.Ensure*`); plan changes require Owner and are refused in production
(`Billing:MockAllowsSelfService=false`, `MockBillingProvider.StartCheckoutAsync`); webhooks require a valid
HMAC-SHA256 signature (constant-time compare), are size-limited and deduplicated; without `Billing:WebhookSecret`
every webhook is rejected.

**Tests.** `EntitlementTests`, `CompanyAndTeamTests.Trial_limits_members_and_expired_trial_is_read_only`,
`CompanyAndTeamTests.Billing_webhook_rejects_invalid_signature`.

**Residual risk / recommendation.** Medium.
- The mock webhook endpoint is reachable in production. If `Billing:WebhookSecret` is set there, anyone holding the
  secret can activate any plan for any company id. **Leave `Billing:WebhookSecret` empty in production** until a real
  provider is integrated.
- Quotas are checked before the write without a lock; parallel requests can exceed monthly/daily quotas slightly.
- Some writes are allowed in read-only state by design (record decision, cancel, delete draft).
- See T2 for the role-escalation finding.

## T12 CSV / formula injection

**Threat.** Values such as `=HYPERLINK(...)` in customer data execute when an export is opened in Excel.

**Mitigation (implemented).** `Csv.Escape` (`Application/Common/Common.cs`) prefixes values starting with `=`, `+`,
`-`, `@`, tab or CR with `'` and quotes fields containing `;`, `"`, `,`, CR or LF; UTF-8 BOM, `;` separator. Exports
are Admin+ and audited.

**Tests.** `CsvTests.Guards_against_formula_injection`, `CsvTests.Writes_utf8_bom_semicolons_and_quotes`,
`CustomerTests.Csv_export_is_excel_friendly`.

**Residual risk / recommendation.** Low. Values starting with whitespace followed by `=` or with a leading LF are not
prefixed; consider trimming leading whitespace before the check.

## T13 Log and data leakage

**Threat.** Tokens, personal data or secrets end up in logs, error responses or long-lived tables.

**Mitigation (implemented).** Request logs use route templates; `RemoveRequestPathEnricher` drops raw path and query;
problem responses never include exception details; email errors are sanitised; quotation events store no tokens;
Development-only endpoints (`/api/v1/dev/emails`, OpenAPI, Swagger UI) are not mapped in Production.

**Tests.** `DatabaseTests.Health_endpoints_and_security_headers` (headers); no automated test asserts log content.

**Residual risk / recommendation.** Medium.
- **Email bodies with raw tokens are persisted** in `EmailDeliveries.BodyText/BodyHtml` (password-reset links valid
  60 min, verification links 48 h, invitation links 7 days, public links until validity + 60 days) and never purged.
  Anyone with database or backup access can use them. Recommendation: clear bodies after `HandedOff`/`Failed`, or
  render links at send time from a short-lived store; define a retention period for `EmailDeliveries`.
- In Production with `Email:Provider=Capture`, the last 500 emails (including such links) are also kept in process
  memory.
- The web server's own access logs (IIS on MonsterASP) may record raw request paths, including
  `/api/v1/public/quotations/{token}` and `/api/v1/invitations/{token}`. Outside application control – clarify
  retention with the host and document it in the privacy policy.
- `AuditEvents` keep the deleted user's id (pseudonymous) and summaries such as customer display names.

## T14 Denial of service / rate limiting

**Threat.** Request floods, expensive endpoints (PDF rendering, exports), large bodies.

**Mitigation (implemented).** Global limiter 600/min per user or IP plus the policy table in
[ARCHITECTURE.md §2.2](../architecture/ARCHITECTURE.md#22-rate-limiting); 4 MiB body limit; max. 200 line items;
paging with normalised page sizes; PDF of sent quotations is rendered once and cached; SQL command timeout 30 s;
job runs batch-limited (500 expiries, 100 follow-ups, 25 emails, 1,000 storage keys).

**Tests.** Integration tests run with `RateLimits:Scale=1000`; **rate limits are not covered by automated tests.**

**Residual risk / recommendation.** Medium. Limits are in-memory and per process; the 256 MB RAM / app-pool recycle
limits of the free plan make the API easy to exhaust. If the host puts a reverse proxy in front of the app, all
clients may share one IP partition – verify `RemoteIpAddress` in production before relying on IP limits (do not enable
`Network:TrustForwardedHeaders` unless the proxy overwrites `X-Forwarded-For`). Draft PDF previews are rendered on
every request. Consider a CDN/WAF in front of the API for launch.

## T15 SQL injection

**Mitigation (implemented).** All data access through EF Core LINQ (parameterised); the only raw SQL
(`AppDbContext.NextSequenceValueAsync`) and the application lock use parameters; search uses
`EF.Functions.Like` with escaped patterns (`Paging.EscapeLike`); sort keys are mapped from a fixed switch.

**Tests.** Indirect (`QuotationTests.List_filters_sorting_paging_and_csv`, `CustomerTests.Customer_crud_search_archive_and_concurrency`).

**Residual risk.** Low. Keep raw SQL out of services; any future `FromSqlRaw` must use parameters.

## T16 Account enumeration, brute force, lockout abuse

**Mitigation (implemented).** PBKDF2 password hashing; password policy (≥ 10 chars, letter + digit); lockout 5
failures / 15 min; `auth` rate limit 20/min/IP; dummy hash for unknown users; generic login error; `forgot-password`
always 202.

**Tests.** `AuthTests.Account_is_locked_after_repeated_failures`,
`AuthTests.Duplicate_registration_and_weak_password_are_rejected`, `ValidatorTests.Password_policy`.

**Residual risk / recommendation.** Medium.
- Registration answers `409 email_taken`, and a locked account returns a distinct message – both reveal that an
  account exists.
- Account lockout can be triggered deliberately by a third party (5 wrong passwords) to block a user for 15 minutes.
- No breached-password check, no MFA. Recommendation: generic registration response with email-based follow-up,
  optional TOTP for owners, breached-password screening.

## T17 Clickjacking and XSS in the web app

**Mitigation (implemented).** React escaping; CSP meta tag with `script-src 'self'`; API responses with
`frame-ancestors 'none'` and `X-Frame-Options: DENY`; email/PDF templates encode user input.

**Residual risk / recommendation.** Low–Medium. GitHub Pages cannot send response headers and `frame-ancestors`
is ignored in a `<meta>` CSP, so the web app itself can be framed (clickjacking on actions such as "Angebot
annehmen" requires user interaction but is possible). `style-src 'unsafe-inline'` is allowed. A custom domain behind
Cloudflare (headers via `_headers`) fixes both.

## T18 Supply chain and build integrity

**Mitigation (implemented).** Central package versions (`Directory.Packages.props`), exact versions in
`apps/web/package.json`, lock files, `dotnet list package --vulnerable`, `npm audit --omit=dev --audit-level=high`
(web/contracts), gitleaks, `TreatWarningsAsErrors`. The public Pages repo only receives built static files.

**Residual risk / recommendation.** Medium. The mobile app uses caret/tilde ranges and is not covered by `npm audit` in
CI; GitHub Actions are pinned to major tags (`@v4`), not SHAs; release AAB is built on the owner's workstation.
Recommendation: add `npm audit` for `apps/mobile`, pin actions to commit SHAs, keep the upload key and its backup
offline.

---

## Findings while documenting (code references)

| Severity | Finding | Location |
|---|---|---|
| High | Admin can assign undefined role values (e.g. 3) that pass Owner checks | `Api/Endpoints/Endpoints.cs:187` (members PATCH, no `.Validate<>`), `Application/Companies/CompanyService.cs:251-268`, `Application/Common/Common.cs:120` (`Require`), `Program.cs:52` (`JsonStringEnumConverter` allows integers) |
| Medium | Raw one-time tokens persisted in email bodies, no retention | `Application/Emails/EmailOutbox.cs:55-56`, `Domain/Misc/Entities.cs:11` (`EmailDelivery`) |
| Medium | Mock billing webhook live in production if `Billing:WebhookSecret` is set | `Api/Endpoints/Endpoints.cs:38`, `Infrastructure/Billing/MockBillingProvider.cs:50-74` |
| Medium | Garbled German (double-encoded UTF-8) in user-facing messages and the quotation CSV header ("GÃ¼ltig bis") | `Application/Auth/AuthService.cs` (7 lines), `Application/Quotations/QuotationService.cs` (13 lines), `Application/Abstractions/Abstractions.cs:180` |
| Low | Production `Capture` sink marks emails `HandedOff` although nothing is delivered | `Infrastructure/DependencyInjection.cs:59-69`, `Infrastructure/Email/EmailSenders.cs:157` |
| Low | Comment claims only additive migrations are auto-applied, code applies all | `Api/Program.cs:143-148` |
| Low | Demo seed can be forced in Production with `--allow-production-demo` | `Api/Program.cs:131` |
| Low | Shared `jobs` rate-limit partition can be exhausted anonymously | `Api/Program.cs:98` |
| Low | Company deletion is a sequence of `ExecuteDelete` calls without a transaction (partial deletion possible on failure) | `Application/Companies/CompanyService.cs:426-454` |
| Low | Web Deploy with `-allowUntrusted`, password on command line | `scripts/deploy-api.ps1:91-96` |
