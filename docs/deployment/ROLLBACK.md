# Rollback

Related: [MONSTERASP-DEPLOYMENT.md](MONSTERASP-DEPLOYMENT.md) · [BACKUP-AND-RESTORE.md](BACKUP-AND-RESTORE.md) ·
[GITHUB-PAGES.md](GITHUB-PAGES.md)

## Principles

- Every production deployment is tied to a Git commit of the private repo. Note the commit SHA of each release.
- Database migrations are **forward-only**. There is no automated down-migration in production.
- Code rollback is safe only if the database schema is still compatible with the older code. Additive migrations
  (new tables/nullable columns) usually are; renames, drops and type changes are not.
- Take a database export before every deployment that includes a migration – it is the only way back.

## 1. API – redeploy the previous version

`scripts/deploy-api.ps1` rebuilds from the working tree and deletes `artifacts/api-publish` on every run, so a
previous build artefact is not kept automatically.

Option A – rebuild from the previous commit:

```powershell
git switch --detach <previous-release-sha>
./scripts/deploy-api.ps1 -WhatIf
./scripts/deploy-api.ps1
git switch -
```

Option B – keep artefacts: after each successful deployment, copy `artifacts/api-publish` to
`artifacts/releases/<sha>` (git-ignored). To roll back, sync that folder with the same `msdeploy` arguments the script
uses (`-source:contentPath=<folder>`, skip rules for `App_Data`, `-enableRule:AppOffline`).

Then verify with `/health`, `/health/ready` and `node scripts/smoke-test.mjs https://angebotpilot.runasp.net`.

## 2. Database

| Situation | Action |
|---|---|
| Release had no migration | Redeploy code only. |
| Release had an additive migration, old code tolerates it | Redeploy code only; leave the schema. The `__EFMigrationsHistory` entry stays; the next forward deployment continues normally. |
| Migration is incompatible or corrupted data | Restore the export taken before the migration ([BACKUP-AND-RESTORE.md §4](BACKUP-AND-RESTORE.md#4-restore)), then redeploy the matching code. **Data written after the backup is lost** – export the current state first so it can be reconciled manually. |

Do not run `dotnet ef database update <OlderMigration>` against production; down-migrations are not reviewed or
tested.

## 3. Web app (GitHub Pages)

The Pages repo `Angebot.Pilot.App` contains one commit per publish ("Publish web app build <sha>").

- Fast: in the Pages repo, `git revert <bad-publish-commit>` and push (keeps the scheduled-jobs workflow).
- Or: check out the previous private commit and run `bash scripts/publish-web.sh`.

The web bundle must stay compatible with the deployed API (shared contracts in `packages/api-contracts`). Roll back
API and web together when a release changed both.

## 4. Mobile apps

Store releases cannot be rolled back. Options:
- Google Play: halt a staged rollout in the Play Console; ship a fixed build with a **higher `versionCode`**
  (`apps/mobile/app.config.ts`, `android.versionCode`).
- App Store: remove the version from sale or submit a fix (`ios.buildNumber` must increase).
- Keep the API backwards compatible with the app versions in the field.

## 5. Configuration switches (no redeploy needed)

There is no runtime feature-flag system. These settings act as kill switches (environment variables or
`appsettings.Production.json`, then restart the app):

| Switch | Effect |
|---|---|
| `Email__Provider=Capture` | Stops all outgoing email (outbox entries are marked handed off without delivery – they will **not** be resent later). |
| `Jobs__EnableHostedScheduler=false` | Stops the in-process scheduler (no expiry, reminders, email dispatch unless triggered externally). |
| `Jobs__TriggerSecret=` (empty) | Disables `POST /api/internal/jobs/run` (404). Also disable the GitHub workflow in the Pages repo. |
| `Billing__MockAllowsSelfService=false` | Refuses plan changes. |
| `Auth__WebRefreshTransport` | Body/cookie transport for the web app (must match the web client). |
| `RateLimits__Scale` | Integer multiplier for all rate limits (default 1). Can loosen limits; it cannot tighten them below the defaults. |
| Rotate `Jwt__SigningKey` | Invalidates all access tokens immediately (users refresh automatically if their refresh token is valid). |
| Revoke all refresh tokens (SQL) | `UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME(), RevokedReason = 'admin' WHERE RevokedAt IS NULL` – forces everyone to log in again. |
| `app_offline.htm` in the site root | Takes the API offline (maintenance). |
