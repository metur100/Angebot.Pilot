# Store Readiness

Status overview for Google Play and the Apple App Store. **No submission has been made and no approval exists.**
`[x]` = done and verifiable in the repository or provided by the owner; `[ ]` = open.

Related: [google-play.md](google-play.md) · [apple-app-store.md](apple-app-store.md) ·
[PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md) · [ASSET-INVENTORY.md](ASSET-INVENTORY.md) ·
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

## 1. Launch blockers outside the app

| Blocker | Why it matters for review | Owner action |
|---|---|---|
| Production database not migrated | The API cannot serve the app until the schema exists. Waiting for removal of another application's tables. | **Owner:** remove foreign tables → `scripts/migrate-database.ps1` |
| No email delivery (`Email:Provider=Capture`) | Users cannot verify their email address, reset passwords or send quotations by email; reviewers would hit `email_not_verified` when sending by email | **Owner:** SMTP provider + verified domain (SPF/DKIM/DMARC) |
| MonsterASP Free plan forbids commercial use; no backups, no scheduled tasks | Store apps for a paid B2B service need a production-grade backend | **Owner:** upgrade to Premium |
| Legal pages contain placeholders | Privacy policy URL is mandatory in both stores; Impressum required in Germany | **Owner:** fill placeholders, legal review |
| Review/demo account | Both stores need working login credentials | **Owner:** create on production after the blockers above |

## 2. Google Play

- [x] Package id `com.certidevelopment.angebotpilot`, app name "AngebotPilot"
- [x] Signed release bundle exists: `artifacts/android/angebotpilot-1.0.0-1-release.aab` (outside Git),
      versionName 1.0.0 / versionCode 1, upload key alias `angebotpilot-upload` (SHA-256 starts `DB:CC:77:22`),
      built with `ANDROID_CMAKE_DIR=$ANDROID_HOME/cmake/3.31.6` and the `ANGEBOTPILOT_UPLOAD_*` variables
- [ ] **Owner:** second offline copy of the upload keystore and passwords
- [ ] Target API 36 confirmed in the bundle manifest (Expo SDK 57 defaults to targetSdk 36)
- [x] Store icon 512×512 and feature graphic 1024×500 exist
- [ ] Phone screenshots (min. 2; recommended 4 × 1080×1920). Six candidates exist in `screenshots/android/`
      (1344×2992, RGBA) – they must be flattened (no alpha) and cropped/resized to ≤ 2:1 before upload
      ([ASSET-INVENTORY.md](ASSET-INVENTORY.md))
- [x] German listing texts drafted with character counts ([google-play.md](google-play.md))
- [x] Account deletion in the app (Mehr → Mein Konto → Konto löschen) and web URL `konto-loeschen.html`
      (required by Play: <https://support.google.com/googleplay/android-developer/answer/13327111>)
- [ ] Wording mismatch: `konto-loeschen.html` says "Mehr → Profil"; the app shows the row "Mein Konto" on the
      "Mehr" tab. **Owner:** align the landing page text (landing repo is outside this repository)
- [x] Data safety draft ([PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md))
- [ ] **Owner:** Play developer account, Play App Signing enrolment on first upload, closed test (≥ 12 testers,
      ≥ 14 days), content rating, target audience, DSA trader status
- [ ] Production smoke test of the release build against the production API

## 3. Apple App Store

- [x] Bundle id configured, `supportsTablet: false`, camera usage text, `ITSAppUsesNonExemptEncryption=false`
- [x] Privacy manifest block in `app.config.ts` (tracking false, required-reason APIs)
- [ ] Privacy manifest `NSPrivacyCollectedDataTypes` is empty – align with the App Privacy answers
- [x] App Store icon 1024×1024 without alpha exists
- [ ] **Blocked:** no iOS build – needs Apple Developer Program (99 USD/year) and EAS cloud build (no macOS)
- [ ] iPhone 6.3" screenshots (1206×2622 or 1179×2556)
- [x] German texts drafted with counts ([apple-app-store.md](apple-app-store.md))
- [ ] **Owner/legal:** guideline 3.1 implications before paid plans are sold outside the app
- [ ] **Owner:** age rating questionnaire, App Privacy, EU trader status, review account and notes

## 4. Shared requirements

| Requirement | Status |
|---|---|
| Privacy policy URL | page exists (`datenschutz.html`), **placeholders open** |
| Support URL | `support.html` exists |
| Account deletion in app + web | implemented; wording mismatch on web page (see above) |
| No ads / no tracking SDKs | true for `apps/mobile/package.json` at time of writing |
| Encryption in transit | HTTPS only for store builds |
| Content: no user-generated public content | true (data is private per company; customer page only via secret link) |
| Prices | preliminary on landing page; no in-app purchases; no payment provider |
