# Google Play – store listing overview

Status as of 2026-11-02: **nothing has been submitted.** App id `com.certidevelopment.angebotpilot`, developer
Medin Turkes · Certi Development, contact certidevelopment@gmail.com. Listing languages: German (de-DE, default) and
English (en-US).

**All texts, answers and file paths to paste into Play Console are in one place:
[store-assets/android/GOOGLE-PLAY-CONSOLE.md](../../store-assets/android/GOOGLE-PLAY-CONSOLE.md)** (copy-paste
checklist, section by section). This page only summarises it; do not keep a second copy of the texts here.

Related: [apple-app-store.md](apple-app-store.md) · [STORE-READINESS.md](STORE-READINESS.md) ·
[PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md) · [ASSET-INVENTORY.md](ASSET-INVENTORY.md) ·
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

## Listing fields and character counts

Counted with `node scripts/check-store-texts.mjs` (Unicode code points of the exact text in GOOGLE-PLAY-CONSOLE.md).

| Field | Limit | de-DE | en-US |
|---|---|---|---|
| App name | 30 | `AngebotPilot` – 12 | `AngebotPilot` – 12 |
| Short description | 80 | `Angebote & Rechnungen erstellen, als PDF senden, automatisch nachfassen.` – 72 | `Create quotes and invoices, send them as PDF and follow up automatically.` – 73 |
| Full description | 4000 | 3219 | 2891 |
| Release notes 1.0.0 (3) | 500 | 364 | 339 |

| Field | Value |
|---|---|
| Category | Business (Geschäftlich) |
| Contact email | certidevelopment@gmail.com |
| Website | https://angebot.gentlegroup.de/ |
| Privacy policy | https://angebot.gentlegroup.de/datenschutz.html (en: /en/privacy.html) |
| Account deletion URL | https://angebot.gentlegroup.de/konto-loeschen.html (en: /en/delete-account.html) |
| App access | review account `berkcan@gentlegroup.de`, password in GentleHub (see checklist section 5) |
| Ads / content rating / target audience / data safety | see checklist section 5 and [PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md#google-play-data-safety) |

The description matches the app on `main` (2026-11-02): quotations with templates, revisions and duplicates; PDF and
customer link with online acceptance; automatic follow-ups; jobs; invoices with ZUGFeRD/Factur-X e-invoice, payments,
payment reminders and cancellation invoices; QR scanner; German/English UI and dark mode; data export and account
deletion in the app. The Apple description is identical (checked by comparing the two text blocks).
Re-check "keine Analyse-SDKs / no analytics SDKs" against `apps/mobile/package.json` before each release.

## Release

- Current bundle: `artifacts/android/angebotpilot-1.0.0-3-release.aab` (git-ignored; copy next to the key in
  `C:\Users\TurkesMedin\keystore\`), versionName `1.0.0`, versionCode `3`, signed with the upload key (alias
  `angebotpilot-upload`, certificate SHA-256 `DB:CC:77:22:…:8B:AF:F9`), production API. Not uploaded.
  versionCodes 1 and 2 were built but never uploaded – skip them.
- Format: Android App Bundle; target API 36 (Play requirement since 31 Aug 2026).
- Play App Signing: accept Google-managed signing on the first upload; keep the upload key.
- New personal developer accounts need a **closed test with ≥ 12 testers opted in for ≥ 14 consecutive days**
  before production access.

## Graphics

| Asset | File | Size |
|---|---|---|
| App icon | `store-assets/android/icon-512.png` | 512 × 512 PNG, opaque |
| Feature graphic | `store-assets/android/feature-graphic-1024x500.png` | 1024 × 500 PNG, opaque |
| Phone screenshots (8) | `store-assets/android/phone-screenshots/` | 1080 × 1920 JPEG |
| 7" tablet screenshots (5) | `store-assets/android/tablet-7-screenshots/` | 1200 × 2134 JPEG |
| 10" tablet screenshots (5) | `store-assets/android/tablet-10-screenshots/` | 1620 × 2880 JPEG |

Details and Play's rules: [ASSET-INVENTORY.md](ASSET-INVENTORY.md).
