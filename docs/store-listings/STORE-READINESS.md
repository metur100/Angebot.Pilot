# Store Readiness

Status overview for Google Play and the Apple App Store, as of 2026-11-02. **No submission has been made and no
approval exists.** `[x]` = done and verified in the repository / on the build machine; `[ ]` = open.

Related: [google-play.md](google-play.md) · [apple-app-store.md](apple-app-store.md) ·
[GOOGLE-PLAY-CONSOLE.md](../../store-assets/android/GOOGLE-PLAY-CONSOLE.md) ·
[PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md) · [ASSET-INVENTORY.md](ASSET-INVENTORY.md) ·
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

## 1. Open items outside the app

| Item | Why it matters for review | Owner action |
|---|---|---|
| Legal pages still contain `[PLATZHALTER: …]` for operator identity (address, phone, VAT ID, legal form, jurisdiction) and two contract periods (AGB §13, AVV §6/§9); hosting/email providers and retention periods filled in 2026-11-02 | Privacy policy URL is reviewed by both stores; Impressum required in Germany | **Owner:** fill placeholders, legal review |
| MonsterASP Free plan forbids commercial use | A store app for a paid B2B service needs a production-grade backend | **Owner:** upgrade before taking paying customers |
| Review account trial ends **2026-11-28** | After expiry the company is read-only (reviewers can sign in but not edit) | **Owner:** extend the trial of "Berkcan Malerbetrieb GmbH" before then – no admin endpoint exists; needs an operator endpoint + deploy or a manual SQL update (see GOOGLE-PLAY-CONSOLE.md section 7) |
| Review account password | Kept in GentleHub only (this repository is public) | **Owner:** paste it into Play Console (App access) and App Store Connect (Sign-in information) |

Resolved since the first draft: production database migrated, email delivery via SMTP works, legal/landing site on
`https://angebot.gentlegroup.de`, web app on `https://angebot-app.gentlegroup.de`, review account exists and signs in
against production (checked 2026-11-02).

## 2. Google Play

- [x] Package id `com.certidevelopment.angebotpilot`, app name "AngebotPilot"
- [x] Signed release bundle `artifacts/android/angebotpilot-1.0.0-3-release.aab` (versionName 1.0.0, versionCode 3),
      upload key alias `angebotpilot-upload` (cert SHA-256 `DB:CC:77:22:…:8B:AF:F9`), `jarsigner -verify` OK,
      production API – see [GOOGLE-PLAY-CONSOLE.md](../../store-assets/android/GOOGLE-PLAY-CONSOLE.md#2-release-artefact-test-and-release--internal-testing--closed-testing--create-new-release)
- [x] targetSdk 36 confirmed in the bundle manifest
- [x] Universal APK of the same build (same signature) installed on the emulator; login, lists, details, editor and
      dark mode work against production (used for the store screenshots)
- [x] Icon 512 × 512 and feature graphic 1024 × 500 (opaque)
- [x] Phone (8), 7" tablet (5) and 10" tablet (5) screenshots from the versionCode 3 release build
- [x] de-DE and en-US listing texts within limits (`node scripts/check-store-texts.mjs`)
- [x] Account deletion in the app (Mehr → Mein Konto → Konto löschen) and on the web (`konto-loeschen.html`, which
      now uses the same wording "Mehr → Mein Konto")
- [x] Data safety, content rating, target audience, app access answers drafted (checklist section 5)
- [ ] **Owner:** second offline copy of the upload keystore and its password file
- [ ] **Owner:** Play developer account, create the app, upload to internal/closed testing, closed test (≥ 12
      testers, ≥ 14 days), fill the App content forms, DSA trader status

## 3. Apple App Store

- [x] Bundle id configured, `supportsTablet: false`, camera usage text (de/en), `ITSAppUsesNonExemptEncryption=false`
- [x] Privacy manifest in `app.config.ts` (tracking false, required-reason APIs, collected data types incl. Other
      Financial Info, Emails or Text Messages, Product Interaction – matches the App Privacy answers in
      [apple-app-store.md](apple-app-store.md#7-app-privacy-app-store-connect--app-privacy))
- [x] App Store icon 1024 × 1024 without alpha
- [x] Screenshots: iPhone 6.9" (8 × 1320 × 2868), iPhone 6.3" (8 × 1206 × 2622), iPad 13" (5 × 2064 × 2752 – only
      needed if iPad support is enabled), no Android system bars
- [x] de-DE and en-US texts, review notes, age rating and App Privacy answers ([apple-app-store.md](apple-app-store.md))
- [ ] **Blocked:** no iOS build – needs Apple Developer Program (99 USD/year) and EAS cloud build (no Mac)
- [ ] **Owner/legal:** guideline 3.1 implications before paid plans are sold outside the app
- [ ] **Owner:** contact phone for App Review, EU trader status

## 4. Shared requirements

| Requirement | Status |
|---|---|
| Privacy policy URL | `https://angebot.gentlegroup.de/datenschutz.html` (200), only operator-identity placeholders open |
| Support URL | `https://angebot.gentlegroup.de/support.html` (200) |
| Account deletion in app + web | implemented; web page `konto-loeschen.html` / `en/delete-account.html` (200) |
| No ads / no tracking SDKs | true for `apps/mobile/package.json` on 2026-11-02 |
| Encryption in transit | HTTPS only for store builds (no cleartext config in the release manifest) |
| Content: no public user-generated content | true (data is private per company; customer page only via secret link) |
| Prices | no in-app purchases; no payment provider; free 30-day trial |
