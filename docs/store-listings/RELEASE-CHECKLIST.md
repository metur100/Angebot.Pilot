# Release Checklist

For each release of API, web app and mobile apps. Items marked **Owner:** need the owner's accounts, keys or
decisions. This checklist does not record results – the release process documents them separately.

Related: [STORE-READINESS.md](STORE-READINESS.md) · [MONSTERASP-DEPLOYMENT.md](../deployment/MONSTERASP-DEPLOYMENT.md) ·
[GITHUB-PAGES.md](../deployment/GITHUB-PAGES.md) · [ROLLBACK.md](../deployment/ROLLBACK.md)

## 1. Quality gates (all components)

- [ ] `dotnet build AngebotPilot.sln -c Release` and `dotnet format … --verify-no-changes --severity error`
- [ ] `dotnet test AngebotPilot.sln` (unit + SQL Server integration)
- [ ] `npm run test:contracts`, `npm run typecheck`, `npm run lint`, `npm run test:web`
- [ ] `cd apps/mobile && npm run verify`
- [ ] Dependency audit: `dotnet list AngebotPilot.sln package --vulnerable --include-transitive`,
      `npx -y npm@11 audit --omit=dev` (root and `apps/mobile`)
- [ ] CI green on the release commit (including gitleaks)
- [ ] Note the release commit SHA

## 2. API

- [ ] Database export taken ([BACKUP-AND-RESTORE.md](../deployment/BACKUP-AND-RESTORE.md))
- [ ] New migrations? → `./scripts/migrate-database.ps1 -ScriptOnly`, review, then apply. **First production
      migration is owner-gated** (foreign tables must be removed first)
- [ ] `./scripts/deploy-api.ps1 -WhatIf`, then `./scripts/deploy-api.ps1`
- [ ] `/health`, `/health/ready`, `node scripts/smoke-test.mjs https://angebotpilot.runasp.net https://metur100.github.io`
- [ ] Scheduled-jobs workflow run succeeds (HTTP 200)

## 3. Web app

- [ ] `bash scripts/publish-web.sh` (builds with production `VITE_*` values and pushes to the Pages repo)
- [ ] Open `https://metur100.github.io/Angebot.Pilot.App/`: login, create quotation, open customer link, PDF view
- [ ] CSP meta tag present in the deployed `index.html`

## 4. Android

### 4.1 Version

- [ ] Increase `version` (versionName) and `android.versionCode` in `apps/mobile/app.config.ts`
      (current release artefact: `1.0.0` / `2`). Every Play upload needs a higher `versionCode`.

### 4.2 Build (Windows, local)

Signing values come from Gradle properties or environment variables – never from the repo
(`apps/mobile/plugins/withAndroidReleaseSigning.js`). Example `%USERPROFILE%\.gradle\gradle.properties`:

```properties
ANGEBOTPILOT_UPLOAD_STORE_FILE=C:/Users/TurkesMedin/keystore/angebotpilot
ANGEBOTPILOT_UPLOAD_KEY_ALIAS=angebotpilot-upload
ANGEBOTPILOT_UPLOAD_STORE_PASSWORD=<from password manager>
ANGEBOTPILOT_UPLOAD_KEY_PASSWORD=<from password manager>
```

```bat
cd apps\mobile
set ANDROID_CMAKE_DIR=%ANDROID_HOME%\cmake\3.31.6
rem EXPO_PUBLIC_API_BASE_URL must be unset or https://angebotpilot.runasp.net for store builds
npm run prebuild:android
cd android
gradlew.bat app:bundleRelease
```

- [ ] `ANDROID_CMAKE_DIR` set (required on Windows: the default CMake 3.22.1/ninja fails on paths > 260 characters;
      `plugins/withLocalCmakeDir.js` writes `cmake.dir` into `android/local.properties`)
- [ ] Output `android/app/build/outputs/bundle/release/app-release.aab` copied to
      `artifacts/android/angebotpilot-<versionName>-<versionCode>-release.aab` (git-ignored)
- [ ] **Verify the signature** – if the `ANGEBOTPILOT_UPLOAD_*` values are missing, the plugin silently falls back to
      the **debug** key:
      `keytool -printcert -jarfile artifacts\android\angebotpilot-<v>-<code>-release.aab`
      → certificate SHA-256 must start with `DB:CC:77:22` (owner's upload certificate), not the Android debug cert
- [ ] Manifest uses `targetSdkVersion 36` (Play requirement since 31 Aug 2026) – check the generated
      `android/app/build.gradle` / merged manifest
- [ ] App starts against production on a real device or emulator (login, quotation list, PDF share, QR scanner)
- [ ] Verify that no cleartext permission/network config is present in the store build (`withLocalCleartext` is only
      applied for `http://` API URLs)

### 4.3 Upload key safety

- [ ] **Owner:** keep a **second copy** of the upload keystore `C:\Users\TurkesMedin\keystore\angebotpilot`
      (alias `angebotpilot-upload`) **and** its passwords in a separate, offline, encrypted location (e.g. encrypted
      USB stick in a different place + password manager entry). Never in Git, never in cloud folders that sync to
      shared machines.
- [ ] **Owner:** record the upload certificate fingerprints (SHA-256 starting `DB:CC:77:22`, plus SHA-1) next to the
      backup.
- Losing the upload key does not lose the app when Play App Signing is used: Google holds the app signing key and
  offers an upload-key reset via Play Console support (verify the current procedure in Play Console help when
  needed).

### 4.4 Play Console

- [ ] **Owner:** Google Play developer account; EU DSA trader information as applicable
- [ ] Create the app (default language German), package `com.certidevelopment.angebotpilot`
- [ ] **Play App Signing:** accept Google-managed app signing on the first upload (new apps are enrolled
      automatically; your own signing key can only be supplied before the first open-testing/production release –
      <https://support.google.com/googleplay/android-developer/answer/9842756>). Afterwards note the **app signing
      key** SHA-256 shown in *Setup → App integrity*.
- [ ] Upload the AAB to **Internal testing** first (`eas.json` submit profile uses track `internal`, status `draft`)
- [ ] **Closed testing with ≥ 12 testers opted in for ≥ 14 consecutive days** (new personal accounts) before applying
      for production (<https://support.google.com/googleplay/android-developer/answer/14151465>)
- [ ] Store listing, graphics, screenshots ([google-play.md](google-play.md), [ASSET-INVENTORY.md](ASSET-INVENTORY.md))
- [ ] App content: privacy policy, ads (none), app access (review account), content rating, target audience, Data
      safety ([PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md)), account deletion URL
- [ ] Release notes (de-DE)

## 5. iOS (blocked – no macOS)

- [ ] **Owner:** Apple Developer Program (99 USD/year), App Store Connect app record, EU trader status
- [ ] Increase `ios.buildNumber`
- [ ] `eas build -p ios --profile production` (cloud), then `eas submit -p ios` → TestFlight
- [ ] Verify privacy manifest and `ITSAppUsesNonExemptEncryption=false` in the built app
- [ ] App Privacy answers, screenshots (6.3" set), review account, review notes ([apple-app-store.md](apple-app-store.md))

## 6. After release

- [ ] Monitor `/health/ready`, failed emails (`EmailDeliveries.Status = Failed`), scheduled-jobs workflow runs
- [ ] Update `docs/` if behaviour or configuration changed
- [ ] Keep the previous API artefact/commit available for rollback ([ROLLBACK.md](../deployment/ROLLBACK.md))
