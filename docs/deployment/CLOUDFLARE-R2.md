# Optional: Cloudflare R2 Object Storage

Status: **optional upgrade, not configured.** Production uses `Storage:Provider=Local` (files under
`App_Data/storage` on the MonsterASP disk, excluded from Web Deploy sync). The S3 provider
(`apps/api/src/AngebotPilot.Infrastructure/Storage/FileStorage.cs`, `S3FileStorage`) is implemented for Cloudflare R2.

What is stored: company logos (`companies/{companyId}/logos/…`) and frozen quotation PDFs
(`companies/{companyId}/documents/…`). All objects are private; downloads always stream through the API after a
membership or public-token check, so **no bucket CORS policy and no public bucket access are needed.** Presigned URLs
are implemented but not used.

## Prerequisite and cost

- [ ] **Owner:** a Cloudflare account with an **R2 subscription** – "Complete the checkout flow to add an R2
  subscription" (<https://developers.cloudflare.com/r2/get-started/>, Apr 21, 2026). Whether a payment method is
  required for that checkout is **UNVERIFIED** (widely reported yes; not stated on the official page).
- Free tier per month (Standard storage only): **10 GB-month storage, 1 million Class A operations, 10 million
  Class B operations, egress free**. Beyond: $0.015/GB-month, $4.50 per million Class A, $0.36 per million Class B.
  The free tier does not apply to Infrequent Access (<https://developers.cloudflare.com/r2/pricing/>, Oct 1, 2026).
- Expected usage pattern: the cleanup job lists up to 1,000 keys under `companies/` on every full job run
  (`ListObjectsV2` = Class A). With the hosted scheduler's default 1-minute interval that is up to ~43,200 list calls
  per 30 days while the app is loaded, plus one `PutObject` (Class A) per logo/sent quotation and one `GetObject`
  (Class B) per download/email attachment – within the free tier at small scale.

## Bucket setup

1. Cloudflare dashboard → R2 → *Create bucket*, e.g. `angebotpilot-prod`, location hint Europe (EU jurisdiction if
   offered for your account – to be decided by the owner).
2. **Keep the bucket private:** do not enable the `r2.dev` public URL and do not attach a public custom domain.
3. Use a **dedicated bucket**: the orphan cleanup deletes every object under `companies/` that has no active row in
   the `Files` table.
4. No CORS policy (not needed).
5. R2 → *Manage API tokens* → *Create API token*: permission **Object Read & Write**, **scoped to this bucket only**,
   no TTL or a documented rotation date. Note the Access Key ID and Secret Access Key (shown once) and the account id.

## API configuration

| Key | Value |
|---|---|
| `Storage:Provider` | `S3` |
| `Storage:S3ServiceUrl` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `Storage:S3Bucket` | `angebotpilot-prod` |
| `Storage:S3AccessKeyId` | from the API token (secret) |
| `Storage:S3SecretAccessKey` | from the API token (secret) |
| `Storage:S3Region` | `auto` (default) |

Environment-variable form: `Storage__Provider`, `Storage__S3ServiceUrl`, … (see
[ENVIRONMENT-VARIABLES.md](ENVIRONMENT-VARIABLES.md)). Startup fails if one of URL, bucket, key id or secret is missing.

Client settings applied in code (R2 compatibility): `ForcePathStyle = true`, `AuthenticationRegion = <S3Region>`,
`RequestChecksumCalculation = WHEN_REQUIRED`, `ResponseChecksumValidation = WHEN_REQUIRED`,
`DisablePayloadSigning = true` on uploads, content buffered to send `Content-Length`. Cloudflare documents R2 as
S3-compatible with region `auto` and lists unsupported features (object tagging, ACL headers, object lock, SSE other
than SSE-C) – none of them are used (<https://developers.cloudflare.com/r2/api/s3/api/>, Jul 31, 2026). Cloudflare's
own .NET example targets AWSSDK.S3 v3; this project uses v4 (4.0.104.3) – **test end to end** after switching.

## Switching from Local to R2 (migration of existing files)

Existing `Files` rows point to object keys that currently exist only on the MonsterASP disk. Switch in this order:

1. Back up `App_Data` ([BACKUP-AND-RESTORE.md](BACKUP-AND-RESTORE.md#3-app_data-backup)).
2. Upload the local tree `App_Data/storage/companies/**` to the bucket **with identical keys**
   (e.g. `companies/<id>/documents/<file>.pdf`) using any S3 tool configured for the R2 endpoint.
3. Set the configuration above and restart the application.
4. Verify: download a sent quotation PDF and a logo in the app; run the smoke test.

If step 2 is skipped, sent PDFs are missing from storage; the API then re-renders them on demand without the
originally embedded QR code, i.e. the frozen document is lost. The cleanup job never deletes database rows for
missing objects.

## Verification checklist

- [ ] Upload a logo → object appears under `companies/<companyId>/logos/` in the bucket
- [ ] Send a quotation → PDF under `companies/<companyId>/documents/`
- [ ] Bucket has no public access; API token limited to this bucket
- [ ] **Owner:** DPA with Cloudflare; privacy policy lists Cloudflare R2 as processor and storage location
