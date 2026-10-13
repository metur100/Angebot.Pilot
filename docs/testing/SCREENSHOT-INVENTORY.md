# Screenshot inventory

All screenshots were captured from the **running applications** against the **real AngebotPilot API**
(Development environment, SQL Server LocalDB) with the clearly labelled demo company
"Muster Elektrotechnik (Demo)" created by `seed-demo`. No mockups, no generated UI.

## Web (`screenshots/web/`)

Source: production build of `apps/web` served by `vite preview`, Chromium via Playwright
(`tests/web-e2e/screenshots.spec.ts`, run with `SCREENSHOTS=1`), viewport 1440×900, locale de-DE,
time zone Europe/Berlin. Captured 2026-10-13.

| File | Scenario |
|---|---|
| `landing-page.png` | Entry page of the web app (login/start). The marketing landing page is a separate site, see below |
| `login.png` | Login form with legal links to the landing site |
| `dashboard.png` | Dashboard with KPI cards, awaiting decision, expiring soon, follow-ups, activity |
| `customers.png` | Customer list with search/filters |
| `quotation-editor.png` | Quotation editor with line items, German number input, totals bar |
| `quotation-preview.png` | HTML document preview of a quotation |
| `quotation-pdf.png` | The real server-generated PDF rendered with pdf.js |
| `follow-up-history.png` | Quotation detail: reminders, email delivery status ("An Mailserver übergeben"), history |
| `jobs.png` | Job list |
| `settings.png` | Company settings |
| `public-quotation.png` | Public customer page reached via a real customer link |

The separate landing/legal site (https://metur100.github.io/Angebot.Pilot.Landing/) was checked by the landing-site
review at 390/768/1440 px (screenshots not stored in this repository).

## Android (`screenshots/android/`)

Source: release-mode build of `apps/mobile` (debug-signed test build pointing at the local API via `10.0.2.2:5080`),
Android emulator `Pixel_10_Pro_XL` (1344×2992), captured with `adb exec-out screencap -p`, status bar in demo mode.
Captured 2026-10-13.

| File | Scenario |
|---|---|
| `dashboard.png` | Übersicht with KPI cards and conversion-rate definition |
| `customers.png` | Customer list |
| `quotation-list.png` | Quotation list with status filter chips |
| `quotation-editor.png` | Step 3 "Positionen" of the quotation editor with live totals |
| `quotation-details.png` | Quotation detail incl. follow-ups and delivery history |
| `jobs.png` | Job list |

Store versions derived from these exact screenshots (no alpha, 9:16, 1080×1920 JPEG, with captions):
`store-assets/android/phone-screenshots/phone-01-dashboard.jpg` … `phone-06-jobs.jpg`, generated with
`scripts/store-screenshots.mjs`.

## iOS (`screenshots/ios/`)

**Not captured – blocked.** No macOS/Xcode/iOS Simulator is available on the build machine. Commands to capture once
a Mac (or EAS build + simulator) is available:

```bash
cd apps/mobile
npx expo prebuild -p ios --clean
npx expo run:ios --configuration Release --device "iPhone 17 Pro Max"   # 6.9" class
xcrun simctl io booted screenshot screenshots/ios/dashboard.png          # repeat per screen
```

Required App Store size: see `docs/store-listings/apple-app-store.md` (verify in App Store Connect at upload time).

## Store artwork (`store-assets/`)

| File | Size | Notes |
|---|---|---|
| `android/icon-512.png` | 512×512, 32-bit PNG | Play app icon |
| `android/feature-graphic-1024x500.png` | 1024×500, 24-bit PNG | Play feature graphic (brand, no UI) |
| `android/phone-screenshots/*.jpg` | 1080×1920 JPEG | Play phone screenshots (6) |
| `ios/app-icon-1024.png` | 1024×1024, opaque | App Store icon |
