# Store Asset Inventory

Measured from the files in the repository at the time of writing (PNG header: width, height, colour type).
`screenshots/android/` was added by the mobile workstream while this document was written (see below); `screenshots/web/`
and iOS screenshots do not exist yet.

Related: [google-play.md](google-play.md) · [apple-app-store.md](apple-app-store.md) · [STORE-READINESS.md](STORE-READINESS.md)

## Existing assets

| File | Dimensions | Format | Alpha | Size | Use | Meets spec? |
|---|---|---|---|---|---|---|
| `store-assets/android/icon-512.png` | 512 × 512 | PNG (RGBA) | yes | 5,985 B | Play hi-res icon | ✔ Play requires 512×512, 32-bit PNG with alpha, ≤ 1024 KB |
| `store-assets/android/feature-graphic-1024x500.png` | 1024 × 500 | PNG (RGB) | no | 36,661 B | Play feature graphic | ✔ Play requires 1024×500, JPEG or 24-bit PNG without alpha |
| `store-assets/ios/app-icon-1024.png` | 1024 × 1024 | PNG (RGB) | no | 14,021 B | App Store icon | ✔ 1024×1024 opaque (size per Apple HIG: UNVERIFIED on official text; "no alpha" confirmed via Apple forum) |
| `apps/mobile/assets/images/icon.png` | 1024 × 1024 | PNG (RGB) | no | 14,021 B | Expo app icon (iOS/Android legacy) | ✔ |
| `apps/mobile/assets/images/adaptive-icon.png` | 1024 × 1024 | PNG (RGBA) | yes | 10,243 B | Android adaptive icon foreground (background `#2F45D8`) | ✔ |
| `apps/mobile/assets/images/adaptive-icon-monochrome.png` | 1024 × 1024 | PNG (RGBA) | yes | 7,892 B | Android 13+ themed icon | ✔ |
| `apps/mobile/assets/images/splash-icon.png` | 1024 × 1024 | PNG (RGBA) | yes | 10,243 B | Splash screen (rendered at 180 px width) | ✔ |
| `packages/brand/assets/icon.svg`, `icon-foreground.svg`, `logo.svg` | vector | SVG | – | 353 / 338 / 487 B | Source artwork | – |
| `screenshots/android/dashboard.png`, `quotation-list.png`, `quotation-editor.png`, `quotation-details.png`, `customers.png`, `jobs.png` | 1344 × 2992 each | PNG (RGBA) | **yes** | – | Play phone screenshots (candidates) | ✘ **not uploadable as-is**: Play requires no alpha channel, and the long side (2992) exceeds 2 × the short side (2688) |

The icon PNGs are rendered from the SVG sources by `apps/mobile/scripts/render-assets.mjs` (`npm run assets` in
`apps/mobile`).

## Missing assets

| Asset | Requirement | Source of requirement | Status |
|---|---|---|---|
| Google Play phone screenshots | min. **2**, up to 8 per device type; JPEG or 24-bit PNG (no alpha); each side 320–3840 px; long side ≤ 2 × short side; for promotion eligibility ≥ **4** at **1080×1920** portrait | <https://support.google.com/googleplay/android-developer/answer/9866151> (verified 2026-10-12) | six candidates exist in `screenshots/android/` but must be **flattened (remove alpha) and cropped/resized to ≤ 2:1** (e.g. 1080×1920 or 1344×2688) |
| Apple iPhone screenshots | 1–10 per size, PNG/JPEG, no alpha; required: iPhone with Dynamic Island (medium, 6.3"): **1206×2622 or 1179×2556** portrait. Optional 6.9": 1320×2868 / 1290×2796 / 1260×2736; 6.5" (1284×2778 / 1242×2688) required only if no 6.9" set is provided | <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/> (no page date; © 2026) – rule changed recently, re-check at upload | **missing**; blocked until an iOS build exists |
| iPad screenshots | only if the app supports iPad | same | not needed (`supportsTablet: false`) |
| Web app screenshots | none required by stores; useful for README/landing | – | planned in `screenshots/web/` |
| Play promo video | optional | – | not planned |
| Apple app preview video | optional | – | not planned |

## Screenshot guidance

- Use the demo company (fictitious data, `*.example` addresses) – never real customer data.
- Android: capture at 1080×1920 (9:16) portrait against the production or a local API with demo data. Modern
  emulator profiles such as 1080×2400 violate the "long side ≤ 2 × short side" rule (2400 > 2160) and must be
  cropped or resized.
- Suggested set (both stores): Dashboard, quotation list, quotation editor with line items and totals, quotation
  detail with send options, customer acceptance page / PDF, jobs list.
- Store files without alpha channel (flatten on white/brand background).
