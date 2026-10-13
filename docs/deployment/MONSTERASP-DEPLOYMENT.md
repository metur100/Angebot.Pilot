# API Deployment on MonsterASP.NET

Target: site `angebotpilot.runasp.net` (HTTPS works), MonsterASP MS SQL database, Web Deploy from the owner's
Windows workstation. Scripts: `scripts/migrate-database.ps1`, `scripts/deploy-api.ps1`, `scripts/smoke-test.mjs`.

Related: [ENVIRONMENT-VARIABLES.md](ENVIRONMENT-VARIABLES.md) · [BACKUP-AND-RESTORE.md](BACKUP-AND-RESTORE.md) ·
[ROLLBACK.md](ROLLBACK.md) · [SECURITY-CHECKLIST.md](../security/SECURITY-CHECKLIST.md)

## 0. Plan limits and the commercial-use blocker

Facts from the provider (verified 2026-10-12 unless marked):

| Topic | Free plan | Premium |
|---|---|---|
| Commercial use | **Not allowed** – ToS 3.2: free plans are for development, testing, learning, evaluation and "may not be used for commercial purposes" (<https://www.monsterasp.net/Terms/>) | allowed |
| Price | $0 | Premium Single $1.95/month first year, renews at $2.50/month, billed annually (<https://www.monsterasp.net/Pricing>) |
| Resources | 1 site, 5 GB disk, 256 MB RAM (app pool recycled at the limit), 1 MSSQL DB of 1 GB | 25 GB, 512 MB RAM (scalable), 2 DBs × 2 GB |
| Scheduled tasks | **not available** ("Planned tasks are Premium only") | available |
| Outgoing email | **not available** (use external SMTP) | email included |
| Backups | **none** (ToS 3.2(b)) | daily backups |
| Custom domain | no (`*.runasp.net` only) | yes, with Let's Encrypt self-service |
| Other | may be suspended/deleted without notice, no SLA; upgrading causes ~30 min downtime | 14-day money back |

Sources: <https://www.monsterasp.net/ASP.NET-Freehosting/>, <https://www.monsterasp.net/.NET10-Hosting>,
<https://www.monsterasp.net/Pricing>, <https://www.monsterasp.net/Terms/>.

- [ ] **Owner (launch blocker):** upgrade to a paid plan (Premium) **before taking paying customers**. Plan ~30 minutes
  of downtime for the upgrade.

UNVERIFIED (ask MonsterASP support): request/upload size limits, idle timeout of the app pool, bandwidth numbers,
whether `IHostedService` keeps running when idle, database port (1433 assumed), access-log retention.

## 1. One-time preparation (control panel)

- [ ] Website → enable **Web Deploy**; download the publish profile (`*.publishSettings`) and store it **outside Git**
  (the script's default location is the git-ignored `input/` folder; a password manager is better).
- [ ] Website → .NET runtime: ASP.NET Core **.NET 10**; hosting model **InProcess** (MonsterASP's recommendation; the
  published `web.config` uses the SDK default).
- [ ] HTTPS active for `angebotpilot.runasp.net` (done). On Free it is activated by support ticket; Premium has
  self-service (<https://help.monsterasp.net/books/https/page/how-to-activate-https-with-lets-encrypt-certificate>).
- [ ] Database → note the **internal** server name (used by the app) and the **public** remote host
  `dbXXXX.public.databaseasp.net` (used only for migrations/backups). Remote access is disabled by default; enable it
  under Databases → Users → Remote access only while you need it. Repeated failed logins block the IP for 24 h
  (<https://help.monsterasp.net/books/databases/page/remote-access-for-database>).
- [ ] Install Microsoft Web Deploy V3 locally (`C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe`).

## 2. Production settings

Secrets go either into MonsterASP **environment variables** (control panel → Scripting → Environment variables,
values masked, then *Restart application*; keys use `__`, e.g. `Jwt__SigningKey`) – preferred – or into an
`appsettings.Production.json` that `deploy-api.ps1` copies into the package. That file must never be committed
(`.gitignore` covers it). Template – placeholders only:

```json
{
  "ConnectionStrings": {
    "Default": "Server=<internal SQL host from the control panel>;Database=<database name>;User Id=<db user>;Password=<db password>;Encrypt=True;TrustServerCertificate=True"
  },
  "Jwt": {
    "SigningKey": "<48 random bytes, base64>"
  },
  "Jobs": {
    "EnableHostedScheduler": true,
    "TriggerSecret": "<at least 32 random characters – same value as GitHub secret JOBS_TRIGGER_SECRET>"
  },
  "Email": {
    "Provider": "Capture"
  },
  "Billing": {
    "Provider": "mock",
    "MockAllowsSelfService": false,
    "WebhookSecret": ""
  },
  "Storage": {
    "Provider": "Local",
    "LocalRoot": "App_Data/storage"
  },
  "Database": {
    "MigrateOnStartup": false
  }
}
```

Notes:
- `ASPNETCORE_ENVIRONMENT` does not need to be set: ASP.NET Core defaults to `Production`.
- `App:*`, `Cors:AllowedOrigins`, `Auth:*` defaults in `appsettings.json` already match the production URLs.
- `Email:Provider=Capture` means **no email is delivered** (warning in the log). When SMTP credentials exist, switch to:
  `"Provider": "Smtp", "SmtpHost": "<host>", "SmtpPort": 587, "SmtpSecurity": "StartTls", "SmtpUsername": "<user>",
  "SmtpPassword": "<secret>", "FromAddress": "<no-reply@your-verified-domain>", "FromName": "AngebotPilot"`.
- Keep `Billing:WebhookSecret` empty while the mock provider is the only billing provider (see
  [threat model T11](../security/THREAT-MODEL.md#t11-subscription-and-authorisation-bypass)).
- For Cloudflare R2 see [CLOUDFLARE-R2.md](CLOUDFLARE-R2.md).

## 3. Backup first

Before every migration and every deployment that contains a migration: export the database
([BACKUP-AND-RESTORE.md](BACKUP-AND-RESTORE.md#2-manual-database-export-bacpac)) and copy `App_Data`.

## 4. Database migration (owner-gated)

> **Status: pending.** The production database still contains ~32 tables created by a different application.
> AngebotPilot never drops foreign tables. The first migration must wait until the owner has removed them.

- [ ] **Owner:** back up the database as it is now (it contains the other application's data).
- [ ] **Owner:** remove the other application's tables (e.g. via SSMS on the public host), leaving an empty database.
      Do not let any script of this repository do this.
- [ ] Enable remote access, then from the repository root (PowerShell):

```powershell
$env:ANGEBOTPILOT_MIGRATION_CONNECTION = 'Server=dbXXXX.public.databaseasp.net;Database=<db>;User Id=<user>;Password=<password>;Encrypt=True;TrustServerCertificate=True'
./scripts/migrate-database.ps1 -ScriptOnly     # writes artifacts/migrations-idempotent.sql – review it
./scripts/migrate-database.ps1                 # applies pending migrations (refuses DROP/ALTER COLUMN without -AllowDestructive)
Remove-Item Env:ANGEBOTPILOT_MIGRATION_CONNECTION
```

- [ ] Disable remote access again.
- [ ] Verify: table `__EFMigrationsHistory` contains `20261012202456_InitialCreate`.

The script also sets `ASPNETCORE_ENVIRONMENT=Production` for the PowerShell session and does not remove it
afterwards; close the session or `Remove-Item Env:ASPNETCORE_ENVIRONMENT` before running other local commands.

## 5. Deploy the API

```powershell
./scripts/deploy-api.ps1 -WhatIf     # dry run: shows what would change
./scripts/deploy-api.ps1             # publish (Release) and sync via Web Deploy
# custom locations:
./scripts/deploy-api.ps1 -PublishSettings <path>.publishSettings -ProductionSettings <path>\appsettings.Production.json
```

What the script does (`scripts/deploy-api.ps1`):
1. `dotnet publish -c Release` into `artifacts/api-publish` (git-ignored).
2. Copies the production settings file into the package; removes `appsettings.Development.json`.
3. `msdeploy -verb:sync` with `-enableRule:AppOffline` (takes the site offline while files are replaced),
   `-retryAttempts:3`, and **skips `App_Data`** (stored logos and PDFs when `Storage:Provider=Local`).
4. Masks the Web Deploy password in the output. It does **not** run migrations.

Known limitations: uses `-allowUntrusted` (no TLS certificate validation of the Web Deploy endpoint) and passes the
password on the `msdeploy` command line. Run it only from a trusted network and machine.

## 6. Verify

```bash
curl -s https://angebotpilot.runasp.net/health          # {"status":"ok",...}
curl -s https://angebotpilot.runasp.net/health/ready    # {"status":"ready"} = database reachable
node scripts/smoke-test.mjs https://angebotpilot.runasp.net https://metur100.github.io
```

The smoke test creates two throw-away accounts (`…@example.invalid`), runs company → customer → quotation → PDF →
manual send with customer link → public acceptance → job → CSV, checks tenant isolation, CORS and security headers,
then deletes both accounts. It does not test email delivery.

Also check: the log does not show "Emails are captured in memory only and NOT delivered" once SMTP is configured; the
PDF step succeeded (proves `App_Data/storage` is writable).

## 7. Scheduled jobs

The in-process scheduler stops when IIS unloads the idle app pool, and the Free plan has no scheduled tasks.

- [ ] Set a `Jobs:TriggerSecret` (≥ 32 characters) in production.
- [ ] In the public repo `Angebot.Pilot.App`, add the Actions secret `JOBS_TRIGGER_SECRET` with the same value. The
      workflow `.github/workflows/scheduled-jobs.yml` (source: `deploy/pages-repo/…`, copied by `scripts/publish-web.sh`)
      calls `POST /api/internal/jobs/run` every 15 minutes.
- [ ] Run it once manually (*Actions → Scheduled API jobs → Run workflow*) and check HTTP 200.
- GitHub limits: shortest interval 5 min, runs may be delayed or dropped, scheduled workflows in public repos are
  disabled after **60 days without repository activity** – re-enable or push a commit periodically
  (<https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>).
- Alternative: Cloudflare Workers Cron Trigger (Free: 5 cron triggers per account, UTC,
  <https://developers.cloudflare.com/workers/configuration/cron-triggers/>).
- With a paid MonsterASP plan, the provider's scheduled tasks can call the same endpoint.

## 8. Operations notes

- Logs: Serilog writes to the console (stdout). Whether MonsterASP persists stdout is UNVERIFIED; enable
  `stdoutLogEnabled` in `web.config` only temporarily for troubleshooting (it writes files to the site folder).
- App-pool recycles (memory limit, idle) clear the in-memory rate limiter and the email capture buffer; all business
  state is in the database.
- Every deployment briefly takes the site offline (App_Offline rule).
