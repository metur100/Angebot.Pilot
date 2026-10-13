# Pre-launch Security Checklist

`[x]` = implemented in code/config and verifiable in this repository. `[ ]` = open. Items marked **Owner:** need
accounts, money, legal decisions or access only the owner has. This list does not record test results; see the test
report produced by the release process.

Related: [THREAT-MODEL.md](THREAT-MODEL.md) · [MONSTERASP-DEPLOYMENT.md](../deployment/MONSTERASP-DEPLOYMENT.md) ·
[ENVIRONMENT-VARIABLES.md](../deployment/ENVIRONMENT-VARIABLES.md)

## 1. Code-level controls (implemented)

- [x] Route-scoped membership check with 404 for foreign companies (`CompanyMemberFilter`)
- [x] Fail-closed EF Core tenant query filters
- [x] JWT (HS256, 15 min) with ≥ 32-byte key enforced at startup
- [x] Rotating refresh tokens, SHA-256 hashed, family revocation on reuse, security stamp
- [x] Account lockout (5 failures / 15 min), password policy (≥ 10 chars, letter + digit)
- [x] Rate limiting (global + `auth`, `password-reset`, `public`, `send`, `upload`, `jobs`)
- [x] Public links: 256-bit tokens, hash only, expiry, revocation, `no-store`, `noindex`
- [x] One customer decision only (row version + idempotency)
- [x] Logo upload: extension allow-list + magic bytes + size limits; private storage; server-generated keys
- [x] CSV formula-injection guard
- [x] Security headers on API responses (nosniff, DENY, no-referrer, CSP `default-src 'none'`)
- [x] HSTS + HTTPS redirect outside Development/Testing
- [x] Problem details without stack traces; route templates instead of raw paths in logs
- [x] Scheduled-job endpoint: secret ≥ 32 chars, constant-time compare, rate-limited, DB lock
- [x] Billing: mock provider only, self-service plan changes refused in production, signed webhooks
- [x] Migrations only via explicit script with destructive-statement guard; `MigrateOnStartup=false` in production
- [x] Demo seed refuses Production by default
- [x] CI: vulnerable NuGet check, `npm audit` (web/contracts), gitleaks secret scan

## 2. Code fixes recommended before launch

- [ ] Validate `UpdateMemberRequest.Role` (`IsInEnum`) and disallow integer enum values in JSON – privilege escalation
      Admin → effective Owner ([T2](THREAT-MODEL.md#t2-unauthorised-quotation-access-and-role-abuse-inside-a-company))
- [ ] Purge or redact `EmailDeliveries.BodyText/BodyHtml` after hand-off; define retention
      ([T13](THREAT-MODEL.md#t13-log-and-data-leakage))
- [ ] Fix double-encoded German strings (mojibake) in `AuthService.cs`, `QuotationService.cs` (incl. CSV header "Gültig bis")
- [ ] Add `npm audit` for `apps/mobile` to CI; pin GitHub Actions to commit SHAs
- [ ] Add automated tests for rate limiting (tests currently run with `RateLimits:Scale=1000`)
- [ ] Consider: generic registration response (enumeration), MFA for owners, IP partition for the `jobs` limiter,
      re-encoding uploaded logos, transaction around company deletion

## 3. Secrets and configuration

- [x] No secrets in `appsettings.json`; production settings file and publish profile excluded from Git
- [ ] **Owner:** generate fresh production secrets (do not reuse development values):
  - [ ] `Jwt:SigningKey` – ≥ 32 random bytes (e.g. 48 bytes base64)
  - [ ] `Jobs:TriggerSecret` – ≥ 32 random characters; same value as GitHub secret `JOBS_TRIGGER_SECRET`
  - [ ] `Billing:WebhookSecret` – **leave empty** in production while only the mock provider exists
  - [ ] Database password, SMTP password, R2 keys (when used)
- [ ] **Owner:** rotate every secret that appeared in chats, terminal logs, screenshots or the `input/` folder history
- [ ] Prefer MonsterASP environment variables over `appsettings.Production.json` on disk
- [ ] **Owner:** keep the MonsterASP publish profile and DB credentials in a password manager; enable 2FA on
      MonsterASP, GitHub, Google Play Console, Apple, Cloudflare, email provider accounts
- [ ] Verify `Billing:MockAllowsSelfService=false`, `Database:MigrateOnStartup=false`,
      `Network:TrustForwardedHeaders=false` (unless a header-overwriting proxy is confirmed) in production

## 4. Hosting (MonsterASP.NET)

- [x] HTTPS works on `https://angebotpilot.runasp.net` (owner-confirmed)
- [ ] **Owner:** upgrade to a **paid plan** before commercial use – the Free plan terms (ToS 3.2) forbid commercial
      use; Free has no scheduled tasks, no outgoing email, no automatic backups. Premium: $1.95/month first year,
      $2.50/month renewal, billed annually (<https://www.monsterasp.net/Pricing>, verified 2026-10-12)
- [ ] **Owner:** remove the foreign application's tables from the production database, then run the first migration
      (gating step, see [MONSTERASP-DEPLOYMENT.md](../deployment/MONSTERASP-DEPLOYMENT.md#4-database-migration-owner-gated))
- [ ] Disable database remote access again after migrations (re-enable only for maintenance)
- [ ] Confirm with MonsterASP: access-log retention (tokens in request paths), backup retention, data location (EU/Germany)
- [ ] Remove `-allowUntrusted` from `scripts/deploy-api.ps1` if the Web Deploy endpoint has a valid certificate

## 5. Email

- [ ] **Owner (launch blocker):** choose a transactional email provider (e.g. Brevo 300 emails/day free; Resend
      3,000/month and 100/day free – see [research sources](../deployment/ENVIRONMENT-VARIABLES.md#email)), set
      `Email:Provider=Smtp` and SMTP credentials. Until then **no email is delivered**: no email verification, so
      sending quotations by email is impossible in production; no password-reset or invitation emails
- [ ] **Owner:** own sending domain with **SPF, DKIM and DMARC** records; `Email:FromAddress` on that domain
- [ ] Disable open/click tracking at the email provider (the privacy policy draft assumes it is off)
- [ ] Monitor bounces/complaints; set up provider alerts

## 6. Web app hardening

- [x] CSP meta tag in production builds; `no-referrer`; `noindex`
- [ ] **Owner:** custom domain (same site as the API) and switch to `Auth:WebRefreshTransport=Cookie`
      (requires web client change to `credentials: 'include'`) – removes refresh tokens from `localStorage`
- [ ] Until then: no other script-carrying GitHub Pages sites under `metur100.github.io` (shared origin), or move
      the app to its own domain
- [ ] Clickjacking: `frame-ancestors` needs a real response header (custom domain + Cloudflare `_headers`)

## 7. Storage and backups

- [ ] **Owner:** decide object storage: Cloudflare R2 (requires an R2 subscription checkout; payment method likely
      required – UNVERIFIED) or keep `Storage:Provider=Local` **with** regular `App_Data` backups
- [ ] Database backups: paid MonsterASP plan (daily backups on Premium) plus own periodic `.bacpac` export
      ([BACKUP-AND-RESTORE.md](../deployment/BACKUP-AND-RESTORE.md))
- [ ] Perform and document one restore drill before launch

## 8. Mobile

- [x] Refresh token in Keystore/Keychain (`expo-secure-store`); cleartext only for local emulator builds
- [x] Minimal Android permissions (camera, internet, network state); storage/media/audio blocked
- [ ] **Owner:** keep a second, offline copy of the Android upload keystore and its passwords
      (`C:\Users\TurkesMedin\keystore\angebotpilot`, alias `angebotpilot-upload`)
- [ ] Enrol in Play App Signing; verify the upload certificate fingerprint before each upload
- [ ] iOS: privacy manifest present in `app.config.ts`; verify after `expo prebuild` / EAS build

## 9. Legal and compliance

- [ ] **Owner:** fill all `[PLATZHALTER: …]` / `[zu prüfen]` markers on the landing site (Impressum, Datenschutz,
      konto-loeschen) and obtain legal review of Impressum, Datenschutzerklärung, AGB, AVV
- [ ] **Owner:** data processing agreements (AVV/DPA) with every processor: MonsterASP (hosting + DB), email
      provider, Cloudflare (if R2/Pages are used), GitHub (Pages hosting of the app), Google/Apple as applicable
- [ ] **Owner:** record of processing activities (Art. 30 GDPR), TOMs, deletion/retention concept
      (incl. `EmailDeliveries`, `AuditEvents`, backups, server logs)
- [ ] **Owner:** legal review of the online-acceptance wording ("Willenserklärung, keine qualifizierte elektronische Signatur")
- [ ] **Owner:** QuestPDF Community licence eligibility (annual gross revenue < USD 1M, consolidated) – re-check yearly
- [ ] Prices on the landing site marked preliminary until a payment provider is live

## 10. Verification before go-live

- [ ] Dependency audit: `dotnet list package --vulnerable --include-transitive`, `npx -y npm@11 audit` (root and
      `apps/mobile`)
- [ ] **Owner:** external penetration test or at least an authenticated OWASP ASVS L1 review of the deployed system
- [ ] Smoke test against production: `node scripts/smoke-test.mjs https://angebotpilot.runasp.net`
- [ ] Manual check of security headers on the API and CSP on the web app
- [ ] Monitoring/alerting: uptime check on `/health/ready`, alert on 5xx rate, on failed scheduled-jobs workflow runs
      (GitHub notifies on failure), on `EmailDeliveries` in `Failed`; log retention/collection decided (console logs on
      MonsterASP are not persisted by the app)
- [ ] Incident response: who rotates secrets, how users are informed (Art. 33/34 GDPR, 72 h)
