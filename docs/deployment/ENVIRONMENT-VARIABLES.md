# Configuration and Environment Variables

ASP.NET Core reads configuration from `appsettings.json` → `appsettings.{Environment}.json` → user-secrets
(Development only) → environment variables → command line. In environment variables, `:` becomes `__`
(e.g. `Jwt:SigningKey` → `Jwt__SigningKey`); array items use an index (`Cors__AllowedOrigins__0`).
On MonsterASP set them under *Scripting → Environment variables* and restart the application
(<https://help.monsterasp.net/books/development/page/environment-variables-as-configuration-store>).

"Default" = value in `appsettings.json` (or the code default when the key is absent there).
"Prod" = what production needs. **Secret** values must never be committed.

## API (`apps/api`)

### Core

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `ConnectionStrings:Default` | `ConnectionStrings__Default` | `""` (Development: LocalDB) | **yes**, all envs | **yes** | Startup throws if null. Prod: internal MonsterASP SQL host, `Encrypt=True;TrustServerCertificate=True`. |
| `ASPNETCORE_ENVIRONMENT` | same | `Production` when unset | – | no | `Development` enables user-secrets, Swagger, dev email endpoint, demo seeding, auto-migration (via `appsettings.Development.json`). |
| `AllowedHosts` | `AllowedHosts` | `*` | no | no | Host filtering; can be narrowed to `angebotpilot.runasp.net`. |

### App

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `App:WebBaseUrl` | `App__WebBaseUrl` | `https://metur100.github.io/Angebot.Pilot.App/#` (code default `http://localhost:5173/#`) | prod | no | Base of links in emails (`/q/{token}`, `reset-password`, `verify-email`, `invite`). Must end with `#` for hash routing. |
| `App:ApiBaseUrl` | `App__ApiBaseUrl` | `https://angebotpilot.runasp.net` | prod | no | Public API URL. |
| `App:LandingUrl` | `App__LandingUrl` | `https://metur100.github.io/Angebot.Pilot.Landing/` | no | no | Legal site. |
| `App:ProductName` | `App__ProductName` | `AngebotPilot` (code) | no | no | Used in email texts. |
| `App:PublicLinkGraceDays` | `App__PublicLinkGraceDays` | `60` | no | no | Public link stays viewable this many days after `ValidUntil`. |

### Authentication

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `Jwt:SigningKey` | `Jwt__SigningKey` | `""` | **yes**, all envs | **yes** | ≥ 32 bytes (UTF-8); startup fails otherwise. Rotating it invalidates all access tokens (≤ 15 min impact). |
| `Jwt:Issuer` | `Jwt__Issuer` | `angebotpilot-api` | no | no | |
| `Jwt:Audience` | `Jwt__Audience` | `angebotpilot-clients` | no | no | |
| `Auth:AccessTokenLifetime` | `Auth__AccessTokenLifetime` | `00:15:00` | no | no | `TimeSpan`. |
| `Auth:RefreshTokenLifetime` | `Auth__RefreshTokenLifetime` | `30.00:00:00` | no | no | `TimeSpan`. |
| `Auth:WebRefreshTransport` | `Auth__WebRefreshTransport` | `Body` | no | no | `Body` (cross-site, GitHub Pages) or `Cookie` (same-site custom domain; also enables `AllowCredentials` in CORS; needs a web client change). |
| `Auth:MaxFailedLogins` | `Auth__MaxFailedLogins` | `5` (code) | no | no | |
| `Auth:LockoutDuration` | `Auth__LockoutDuration` | `00:15:00` (code) | no | no | |
| `Cors:AllowedOrigins` | `Cors__AllowedOrigins__0`, `__1`, … | `["https://metur100.github.io"]` | prod | no | Exact origins (scheme + host + port). Development adds localhost origins. |

### Storage

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `Storage:Provider` | `Storage__Provider` | `Local` | no | no | `Local`, `S3`, `Memory` (tests). |
| `Storage:LocalRoot` | `Storage__LocalRoot` | `App_Data/storage` | no | no | Relative to the content root. Excluded from Web Deploy sync. |
| `Storage:S3ServiceUrl` | `Storage__S3ServiceUrl` | – | if `S3` | no | R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `Storage:S3Bucket` | `Storage__S3Bucket` | – | if `S3` | no | |
| `Storage:S3AccessKeyId` | `Storage__S3AccessKeyId` | – | if `S3` | **yes** | |
| `Storage:S3SecretAccessKey` | `Storage__S3SecretAccessKey` | – | if `S3` | **yes** | |
| `Storage:S3Region` | `Storage__S3Region` | `auto` | no | no | |

See [CLOUDFLARE-R2.md](CLOUDFLARE-R2.md).

### Email

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `Email:Provider` | `Email__Provider` | `Capture` | prod: `Smtp` for real delivery | no | `Capture` in Production delivers **nothing** (warning logged). |
| `Email:FromAddress` | `Email__FromAddress` | `no-reply@example.invalid` | with `Smtp` | no | Must be on a domain with SPF/DKIM/DMARC at the provider. |
| `Email:FromName` | `Email__FromName` | `AngebotPilot` | no | no | Shown as "{Company} via {FromName}". |
| `Email:SmtpHost` | `Email__SmtpHost` | – | with `Smtp` (startup fails without) | no | |
| `Email:SmtpPort` | `Email__SmtpPort` | `587` | no | no | |
| `Email:SmtpSecurity` | `Email__SmtpSecurity` | `StartTls` | no | no | `StartTls` or `SslOnConnect` (port 465). |
| `Email:SmtpUsername` | `Email__SmtpUsername` | – | provider-specific | yes (treat as secret) | |
| `Email:SmtpPassword` | `Email__SmtpPassword` | – | provider-specific | **yes** | |
| `Email:CaptureDirectory` | `Email__CaptureDirectory` | – (Development: `App_Data/emails`) | no | no | Capture only: also write `.eml` files. Leave unset in production. |

Free SMTP options from the research (verified 2026-10-12 unless noted):

| Provider | Free allowance | SMTP | Domain verification | Source |
|---|---|---|---|---|
| Brevo | 300 emails/day; "Sent with Brevo" branding on free plan (applicability to transactional SMTP UNVERIFIED); account approval needed | yes | recommended – details UNVERIFIED | <https://help.brevo.com/hc/en-us/articles/208580669> (via search snippet), <https://www.brevo.com/free-smtp-server/> |
| Resend | 3,000/month, 100/day | `smtp.resend.com`, ports 25/465/587/2465/2587, user `resend`, password = API key | **required** | <https://resend.com/pricing>, <https://resend.com/docs/send-with-smtp> |
| Mailjet | 6,000/month, 200/day | yes | sender validation (details UNVERIFIED) | <https://www.mailjet.com/pricing/> |
| SMTP2GO | 1,000/month, 200/day | yes | unverified sender limited to 25/hour | <https://www.smtp2go.com/pricing/> |

### Billing

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `Billing:Provider` | `Billing__Provider` | `mock` | no | no | Only `mock` exists. |
| `Billing:MockAllowsSelfService` | `Billing__MockAllowsSelfService` | `false` (Development: `true`) | no | no | Must stay `false` in production. |
| `Billing:WebhookSecret` | `Billing__WebhookSecret` | `""` | Development (for self-service) | **yes** | **Leave empty in production** while only the mock provider exists; empty = all webhooks rejected. |

### Jobs, database, network, logging

| Key | Env var | Default | Required | Secret | Notes |
|---|---|---|---|---|---|
| `Jobs:EnableHostedScheduler` | `Jobs__EnableHostedScheduler` | `true` | no | no | In-process scheduler. |
| `Jobs:Interval` | `Jobs__Interval` | `00:01:00` | no | no | Full job run interval. |
| `Jobs:TriggerSecret` | `Jobs__TriggerSecret` | `""` | prod (external trigger) | **yes** | ≥ 32 characters, else `POST /api/internal/jobs/run` returns 404. Same value as GitHub secret `JOBS_TRIGGER_SECRET`. |
| `Database:MigrateOnStartup` | `Database__MigrateOnStartup` | `false` (Development: `true`) | no | no | Keep `false` in production. |
| `Network:TrustForwardedHeaders` | `Network__TrustForwardedHeaders` | `false` | no | no | Trusts **any** `X-Forwarded-For/Proto` when `true`; only behind a proxy that overwrites them. |
| `RateLimits:Scale` | `RateLimits__Scale` | `1` (Development `20`, tests `1000`) | no | no | Multiplies all rate limits. |
| `Serilog:MinimumLevel:Default` | `Serilog__MinimumLevel__Default` | `Information` | no | no | Other Serilog settings can be added (`ReadFrom.Configuration`). |

### Operator / tooling variables (not read by the running API)

| Variable | Used by | Secret | Notes |
|---|---|---|---|
| `ANGEBOTPILOT_MIGRATION_CONNECTION` | `scripts/migrate-database.ps1` | **yes** | Public MonsterASP host for migrations. |
| `DEMO_PASSWORD` | `seed-demo` | yes | Optional fixed demo password (development only). |
| `TEST_SQLSERVER_CONNECTION` | integration tests | yes | Defaults to LocalDB. |
| `TEST_ARTIFACTS_DIR` | `tests/api-unit/PdfRendererTests.cs` | no | Optional output folder for rendered test PDFs. |
| `API_RUN_DIR`, `API_URLS` | `scripts/run-dev-api.sh` | no | Publish folder and listen URLs. |
| `PAGES_REPO` + `VITE_*` | `scripts/publish-web.sh` | no | Target Pages repository and build values. |
| `MSSQL_SA_PASSWORD` | `docker-compose.yml` via `.env` | yes | Local Docker SQL Server only. |
| `JOBS_TRIGGER_SECRET` | GitHub Actions secret in `Angebot.Pilot.App` | **yes** | Scheduled-jobs workflow. |

## Web app (`apps/web`, build time)

All `VITE_*` values are compiled into the public JavaScript bundle – **never put secrets here.**

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | production build: `https://angebotpilot.runasp.net`; dev: `http://localhost:5080` | API origin without `/api/v1`. Also added to the CSP `connect-src`/`img-src`. |
| `VITE_LANDING_URL` | `https://metur100.github.io/Angebot.Pilot.Landing/` | Legal links (Impressum, Datenschutz, AGB, Preise). |
| `VITE_BASE_PATH` | `/Angebot.Pilot.App/` (build) | Vite `base`. Use `/` for a root deployment. |
| `VITE_USE_MOCKS` | `false` | Dev server only: in-browser MSW mocks. Ignored in production builds. |

## Mobile app (`apps/mobile`, build time)

| Variable | Default | Secret | Notes |
|---|---|---|---|
| `APP_ID` | `com.certidevelopment.angebotpilot` | no | Android package and iOS bundle identifier. |
| `EXPO_PUBLIC_API_BASE_URL` | `https://angebotpilot.runasp.net` | no | Compiled into the app. `http://10.0.2.2:5080` for the emulator (enables cleartext for 10.0.2.2/localhost only). `eas.json` sets it per profile. |
| `ANDROID_CMAKE_DIR` | – | no | Windows long-path workaround, e.g. `%ANDROID_HOME%\cmake\3.31.6` (`plugins/withLocalCmakeDir.js`). |
| `ANGEBOTPILOT_UPLOAD_STORE_FILE` | – | path only | Upload keystore path (outside the repo). If unset, release builds are signed with the **debug** key. |
| `ANGEBOTPILOT_UPLOAD_STORE_PASSWORD` | – | **yes** | Keystore password. |
| `ANGEBOTPILOT_UPLOAD_KEY_ALIAS` | – | no | Owner's key alias: `angebotpilot-upload`. |
| `ANGEBOTPILOT_UPLOAD_KEY_PASSWORD` | – | **yes** | Key password. |

The four `ANGEBOTPILOT_UPLOAD_*` values can be Gradle properties (`~/.gradle/gradle.properties`), `-P` flags or
environment variables (`apps/mobile/plugins/withAndroidReleaseSigning.js`).
