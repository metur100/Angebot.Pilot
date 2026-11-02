# Screenshot inventory

All screenshots were captured from the **running applications** against a **real AngebotPilot API**. No mockups, no
generated UI. Store versions add only a caption and a frame (`scripts/store-screenshots.mjs`).

## Web (`screenshots/web/`)

Source: production build of `apps/web` served by `vite preview`, Chromium via Playwright
(`tests/web-e2e/screenshots.spec.ts`, run with `SCREENSHOTS=1`), viewport 1440×900, locale de-DE,
time zone Europe/Berlin, local API with the seeded demo company "Muster Elektrotechnik (Demo)". Captured 2026-10-13.

| File | Scenario |
|---|---|
| `landing-page.png` | Entry page of the web app (login/start). The marketing landing page is a separate site |
| `login.png` | Login form with legal links to the landing site |
| `dashboard.png` | Dashboard with KPI cards, awaiting decision, expiring soon, follow-ups, activity |
| `customers.png` | Customer list with search/filters |
| `quotation-editor.png` | Quotation editor with line items, German number input, totals bar |
| `quotation-preview.png` | HTML document preview of a quotation |
| `quotation-pdf.png` | The real server-generated PDF rendered with pdf.js |
| `follow-up-history.png` | Quotation detail: reminders, email delivery status, history |
| `jobs.png` | Job list |
| `settings.png` | Company settings |
| `public-quotation.png` | Public customer page reached via a real customer link |

## Mobile – store captures (captured 2026-11-02)

Source for every mobile capture below: the **Android release build 1.0.0 (versionCode 3)** – the universal APK built
by `gradlew app:bundleRelease app:assembleRelease` in the same run as the Play AAB and signed with the same upload key
– installed on the emulator AVD `Pixel_10_Pro_XL`, signed in as the review account `berkcan@gentlegroup.de` (demo
company "Berkcan Malerbetrieb GmbH", fictitious customers) against the **production API**
`https://angebotpilot.runasp.net`. Status bar in Android demo mode (09:30, full battery and Wi-Fi, no notifications).
Captured with `adb exec-out screencap -p`; screen size/density changed with `adb shell wm size/density` and reset
afterwards. German UI; dark mode switched in the app (Mehr → Darstellung → Dunkel) and back to System afterwards.

| Folder | Screen metrics | Files | Used for |
|---|---|---|---|
| `screenshots/android/` | 1080 × 1920 px, density 400 (432 dp wide) | `dashboard`, `quotation-list`, `quotation-details`, `quotation-editor`, `jobs`, `invoices`, `customers`, `dashboard-dark`, (`invoice-details` from 2026-10-29, unused) | Play phone set |
| `screenshots/android/tablet-7/` | 1200 × 1920 px, density 320 (600 dp) | `dashboard`, `quotation-list`, `jobs`, `invoices`, `customers` | Play 7" tablet set |
| `screenshots/android/tablet-10/` | 1600 × 2560 px, density 320 (800 dp) | same five | Play 10" tablet set |
| `screenshots/ios/iphone/` | 1320 × 2868 px, density 480 (440 dp – the iPhone 6.9" logical width) | same eight as phone | App Store iPhone 6.9" and 6.3" sets |
| `screenshots/ios/ipad/` | 2064 × 2752 px, density 320 (1032 dp – the iPad 13" logical width) | `dashboard`, `quotation-list`, `jobs`, `invoices`, `customers` | App Store iPad 13" set |

The App Store sets are made from Android captures because there is no Mac/iOS Simulator; the app is the same
React Native/JavaScript code on both platforms. The Android status bar and navigation bar are cropped away before
composition (iPhone 156/72 px, iPad 146/64 px), so no Android system UI is visible. Native iOS elements (system
fonts, iOS status bar) therefore do not appear. Once an iOS build exists (EAS), the sets can be re-captured
on an iOS Simulator with `xcrun simctl io booted screenshot <file>` (needs a Mac) and composed with the same profiles.

Dashboard figures cover the current month. Before the capture, four quotations were created in the demo company
through the normal app actions (AN-2026-0013 … -0016: duplicate, hand over, record acceptance/rejection – no emails),
so November shows real figures.

## Store versions

| Folder | Count | Pixels |
|---|---|---|
| `store-assets/android/phone-screenshots/` | 8 | 1080 × 1920 JPEG |
| `store-assets/android/tablet-7-screenshots/` | 5 | 1200 × 2134 JPEG |
| `store-assets/android/tablet-10-screenshots/` | 5 | 1620 × 2880 JPEG |
| `store-assets/ios/iphone-6.9/` | 8 | 1320 × 2868 JPEG |
| `store-assets/ios/iphone-6.3/` | 8 | 1206 × 2622 JPEG |
| `store-assets/ios/ipad-13/` | 5 | 2064 × 2752 JPEG |

Regenerate (fonts from the API's PDF renderer; `@napi-rs/canvas@0.1.65` installed in a scratch folder, copy the
script next to its `node_modules`):

```bash
F=apps/api/src/AngebotPilot.Infrastructure/Pdf/Fonts
node store-screenshots.mjs screenshots/android            store-assets/android/phone-screenshots     $F phone
node store-screenshots.mjs screenshots/android/tablet-7   store-assets/android/tablet-7-screenshots  $F tablet-7
node store-screenshots.mjs screenshots/android/tablet-10  store-assets/android/tablet-10-screenshots $F tablet-10
node store-screenshots.mjs screenshots/ios/iphone         store-assets/ios/iphone-6.9                $F iphone-6.9 156 72
node store-screenshots.mjs screenshots/ios/iphone         store-assets/ios/iphone-6.3                $F iphone-6.3 156 72
node store-screenshots.mjs screenshots/ios/ipad           store-assets/ios/ipad-13                   $F ipad-13 146 64
```

## Store artwork (`store-assets/`)

See [ASSET-INVENTORY.md](../store-listings/ASSET-INVENTORY.md) (icon 512 × 512 and feature graphic 1024 × 500 for
Play, 1024 × 1024 App Store icon – all opaque).
