# AngebotPilot – Android & iOS app

Native React Native app (Expo SDK 57, React Native 0.86, Expo Router, TypeScript). UI language German.
`apps/mobile` is a **standalone npm project** (own `package-lock.json`, not part of the root workspaces); the shared
packages are linked via `file:../../packages/*` and compiled from source by Metro (see `metro.config.js`).

> Use `npx -y npm@11` instead of `npm` on this machine (npm 10 crashes).

## Daily commands

```sh
npx -y npm@11 install          # install
npm run typecheck              # tsc --noEmit (strict)
npm run lint                   # eslint-config-expo
npm test                       # jest-expo + React Native Testing Library (__tests__/)
npm run bundle:check           # expo export --platform android (bundling smoke test)
npm run assets                 # re-render icons/splash + store artwork from packages/brand/assets
```

## Configuration (`app.config.ts`)

| Env var | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `https://angebotpilot.runasp.net` | API origin (without `/api/v1`). Emulator → local API: `http://10.0.2.2:5080`. Cleartext HTTP is then allowed **only** for 10.0.2.2/localhost (`plugins/withLocalCleartext.js`); store builds never contain it. |
| `APP_ID` | `com.certidevelopment.angebotpilot` | Android package + iOS bundle identifier. |
| `ANDROID_CMAKE_DIR` | – | Windows only: CMake used for native modules (see below). |

`android/` and `ios/` are generated (Continuous Native Generation) and git-ignored; all native settings live in
`app.config.ts` and `plugins/`.

## Android

### Windows prerequisite: CMake ≥ 3.30
The SDK's default CMake 3.22.1 ships ninja 1.10, which fails with *"Filename longer than 260 characters"* on React
Native codegen objects. Install a newer CMake once and point the build at it:

```sh
sdkmanager "cmake;3.31.6"
set ANDROID_CMAKE_DIR=%ANDROID_HOME%\cmake\3.31.6     # PowerShell: $env:ANDROID_CMAKE_DIR = "$env:ANDROID_HOME\cmake\3.31.6"
```
`plugins/withLocalCmakeDir.js` writes it into the generated `android/local.properties` during prebuild.
Java: Android Studio's JBR (21) works – `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`.

### Local test APK against the local API (emulator)
```sh
set EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5080
npx expo prebuild --platform android --clean --no-install
cd android
gradlew assembleRelease -PreactNativeArchitectures=x86_64      # emulator ABI only; omit the flag for all ABIs
adb install -r app\build\outputs\apk\release\app-release.apk
```
Without an upload key configured, release builds are signed with the **debug key** (Gradle prints a warning) – fine for
local testing, never for upload.

### Release AAB for Google Play (upload key outside the repository)
`plugins/withAndroidReleaseSigning.js` adds a `release` signing config that reads these values from Gradle properties
or environment variables – nothing secret is stored in the repo. Put them into `%USERPROFILE%\.gradle\gradle.properties`:

```properties
ANGEBOTPILOT_UPLOAD_STORE_FILE=C:/Users/<you>/keystore/angebotpilot
ANGEBOTPILOT_UPLOAD_STORE_PASSWORD=...
ANGEBOTPILOT_UPLOAD_KEY_ALIAS=angebotpilot.key
ANGEBOTPILOT_UPLOAD_KEY_PASSWORD=...
```
(or pass them as environment variables / `-P` flags). Then, with the production API (the default):

```sh
set EXPO_PUBLIC_API_BASE_URL=
npx expo prebuild --platform android --clean --no-install
cd android
gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```
Verify the signer before uploading: `keytool -printcert -jarfile app\build\outputs\bundle\release\app-release.aab`
(must show the upload certificate, not `CN=Android Debug`). Bump `version` / `android.versionCode` in `app.config.ts`
for every upload. EAS alternative: `eas build -p android --profile production` (`credentialsSource: local` → needs a
`credentials.json` next to `eas.json`, git-ignored).

## iOS (requires macOS – not buildable on the Windows dev machine)
Configured in `app.config.ts`: bundle id, `buildNumber`, iPhone only, `ITSAppUsesNonExemptEncryption=false`, German
camera usage text, privacy manifest (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1;
no tracking). Build on a Mac (`npx expo prebuild -p ios && open ios/*.xcworkspace`) or in the cloud:
`eas build -p ios --profile production` (remote credentials).

## Tests
- Unit/integration: `npm test` (77 tests: session restore/expiry/logout, login, customer form validation, quotation
  list/filter/pagination, editor with German decimals + live totals, detail actions per status, PDF download/share,
  deep links/QR, offline + network errors, Android back on sheets).
- E2E: Maestro flow `tests/mobile/maestro/login-customer-quotation.yaml` (creates data – use a test account, not demo):
  `maestro test -e EMAIL=… -e PASSWORD=… tests/mobile/maestro/login-customer-quotation.yaml`
