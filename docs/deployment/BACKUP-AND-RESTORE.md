# Backup and Restore

Two things hold state: the **SQL Server database** and, while `Storage:Provider=Local`, the folder
**`App_Data/storage`** on the MonsterASP site (logos, frozen quotation PDFs). Both contain personal data – store
backups encrypted and delete them according to the retention concept.

Related: [MONSTERASP-DEPLOYMENT.md](MONSTERASP-DEPLOYMENT.md) · [ROLLBACK.md](ROLLBACK.md) ·
[DATABASE.md](../architecture/DATABASE.md)

## 1. What the host provides

| Plan | Database/site backups | Source |
|---|---|---|
| Free | **none** (ToS 3.2(b) "no backups") | <https://www.monsterasp.net/Terms/>, <https://www.monsterasp.net/ASP.NET-Freehosting/> |
| Premium | daily backups | <https://www.monsterasp.net/Pricing> |

Retention period and self-service restore of Premium backups: **UNVERIFIED** – check in the control panel after the
upgrade and record it here and in the privacy policy (`[PLATZHALTER: Aufbewahrungsdauer der Backups]`).
Host backups do not replace your own exports: keep at least one off-site copy you control.

## 2. Manual database export (.bacpac)

Prerequisites: SqlPackage (`dotnet tool install -g microsoft.sqlpackage`), database remote access enabled in the
MonsterASP control panel, public host `dbXXXX.public.databaseasp.net`.

```powershell
$cs = 'Server=dbXXXX.public.databaseasp.net;Database=<db>;User Id=<user>;Password=<password>;Encrypt=True;TrustServerCertificate=True'
$file = "D:\Backups\AngebotPilot\angebotpilot-$(Get-Date -Format yyyyMMdd-HHmm).bacpac"
SqlPackage /Action:Export /SourceConnectionString:$cs /TargetFile:$file
Remove-Variable cs
```

- A `.bacpac` export is **not transactionally consistent** while the app writes. For a consistent copy, take the site
  offline during the export (upload an `app_offline.htm` to the site root, remove it afterwards) or export during a
  quiet period.
- Whether the MonsterASP database user has all permissions SqlPackage needs for export is UNVERIFIED – test once.
- Disable remote access again afterwards.
- Encrypt the file at rest (e.g. BitLocker volume or an encrypted archive) and keep a second copy off the workstation.

Suggested schedule: before every migration/deployment with schema changes, and at least weekly while on the Free
plan (no host backups).

## 3. App_Data backup

`scripts/deploy-api.ps1` never touches `App_Data`, so the folder only exists on the server. Copy it down with Web
Deploy (values from the publish profile; run with `-whatif` first):

```powershell
& 'C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe' -verb:sync `
  -source:contentPath="<msdeploySite>/App_Data",ComputerName="https://<publishUrl>:8172/msdeploy.axd?site=<msdeploySite>",UserName="<user>",Password="<password>",AuthType=Basic `
  -dest:contentPath="D:\Backups\AngebotPilot\App_Data-$(Get-Date -Format yyyyMMdd)" `
  -allowUntrusted
```

Alternatively use FTP/SFTP from the control panel. Back up `App_Data` together with the database export – the
`Files` table references the object keys inside `App_Data/storage`.

With Cloudflare R2 (`Storage:Provider=S3`) this step is replaced by an R2 copy/sync of the bucket (R2 has no built-in
versioning via the S3 API).

## 4. Restore

### 4.1 Database

`SqlPackage /Action:Import` requires an **empty** target database.

```powershell
SqlPackage /Action:Import /TargetConnectionString:$cs /SourceFile:<file>.bacpac
```

On the Free plan there is only one database: restoring into production means emptying it first (destructive – only
after taking a fresh export of the current state). With Premium (2 databases) import into the second database, verify,
then switch `ConnectionStrings:Default` and restart.

After a restore:
1. Run `./scripts/migrate-database.ps1 -ScriptOnly` – the script must report no pending migrations, or apply the
   missing ones if the backup is older than the deployed code.
2. Restore `App_Data` from the same point in time (upload with Web Deploy/FTP; reverse source and destination above).
3. Restart the application and run `node scripts/smoke-test.mjs https://angebotpilot.runasp.net`.
4. Consider rotating `Jwt:SigningKey` if the incident involved credential exposure; refresh tokens in the restored
   database become valid again – revoke them if needed
   (`UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME(), RevokedReason = 'restore' WHERE RevokedAt IS NULL`).

Emails queued in the outbox at backup time (`Pending`/`RetryScheduled`) will be sent again after a restore; check
`EmailDeliveries` before starting the app if this is not wanted.

### 4.2 Restore drill (do once before launch, then quarterly)

- [ ] Export production (§2) and `App_Data` (§3).
- [ ] Import the `.bacpac` into a local SQL Server (LocalDB or `docker compose up -d`).
- [ ] Point a local API at it (`ConnectionStrings__Default`, `Storage__LocalRoot` → restored `App_Data/storage`,
      `ASPNETCORE_ENVIRONMENT=Development`, **`Email__Provider=Capture`** so no customer emails are sent,
      `Jobs__EnableHostedScheduler=false`).
- [ ] Verify row counts of `Companies`, `Customers`, `Quotations`; open a sent quotation's PDF; check a logo.
- [ ] Record duration and problems in this file; delete the local copies afterwards.
