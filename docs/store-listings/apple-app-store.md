# Apple App Store – Listing Draft

Status: **draft – nothing has been submitted; no iOS build exists yet.** Bundle id
`com.certidevelopment.angebotpilot`, owner Medin Turkes · Certi Development, contact certidevelopment@gmail.com.
Primary language: German.

Related: [STORE-READINESS.md](STORE-READINESS.md) · [PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md#apple-app-privacy) ·
[ASSET-INVENTORY.md](ASSET-INVENTORY.md)

## App information

| Field | Limit | Value | Length |
|---|---|---|---|
| Name | 30 | `AngebotPilot` | 12 |
| Subtitle | 30 | `Angebote senden & nachfassen` | 28 |
| Promotional text | 170 | `Angebote erstellen, online annehmen lassen und automatisch nachfassen – ohne Werbung und ohne Tracking.` | 103 |
| Keywords | 100 | `Angebot,Kostenvoranschlag,Handwerk,Handwerker,Dienstleister,Kunden,Auftrag,PDF,Nachfassen,KMU` | 93 |
| Description | 4000 | identical to the Google Play full description, see below | 2769 |
| Primary category | – | Business – owner to confirm | – |
| Support URL | – | https://metur100.github.io/Angebot.Pilot.Landing/support.html | – |
| Marketing URL | – | https://metur100.github.io/Angebot.Pilot.Landing/ | – |
| Privacy policy URL | – | https://metur100.github.io/Angebot.Pilot.Landing/datenschutz.html | – |
| Copyright | – | `2026 Medin Turkes` | – |

Lengths counted in Unicode characters. Keywords: comma-separated without spaces; the app name does not need to be
repeated.

### Description (de-DE)

```text
AngebotPilot hilft kleinen Betrieben aus Handwerk und Dienstleistung, Angebote schnell zu erstellen, professionell zu versenden, zuverlässig nachzufassen und angenommene Angebote in Aufträge zu überführen.

ANGEBOTE ERSTELLEN
• Positionen mit Menge, Einheit, Einzelpreis, Rabatt und Steuersatz
• Exakte Berechnung: Umsatzsteuer je Steuersatz, kaufmännisch gerundet
• Regelbesteuerung, Kleinunternehmerregelung (§ 19 UStG) oder Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG) – Sie wählen und bestätigen die steuerliche Behandlung selbst
• Fortlaufende Angebotsnummern, die nie doppelt vergeben werden
• Vorlagen für wiederkehrende Leistungen
• Revisionen: Ein versendetes Angebot überarbeiten, die alte Fassung wird automatisch ersetzt

PROFESSIONELLES PDF
• Mit Ihrem Logo, Ihren Firmendaten und optional Ihrer Bankverbindung
• Das versendete PDF wird eingefroren und bleibt unverändert
• Bei Versand mit Kundenlink: QR-Code, über den Ihre Kundschaft das Angebot online öffnet

VERSENDEN UND ONLINE ANNEHMEN LASSEN
• Versand per E-Mail mit PDF-Anhang und/oder persönlichem Kundenlink
• Oder selbst übergeben und als versendet markieren
• Ihre Kundschaft sieht das Angebot im Browser und kann es mit Namen verbindlich annehmen oder ablehnen – ohne eigenes Konto
• Sie sehen, wann der Kundenlink geöffnet wurde (darauf wird die Kundschaft hingewiesen)

AUTOMATISCH NACHFASSEN
• Erinnerungen nach einstellbaren Tagen und vor Ablauf der Gültigkeit
• Versand um 9 Uhr Ortszeit, mit Mindestabstand und nie nach Ablauf des Angebots
• Kundschaft kann Erinnerungen mit einem Klick abbestellen
• Erinnerungen enden automatisch bei Annahme, Ablehnung, Storno oder Ablauf

AUFTRÄGE
• Angenommene Angebote mit einem Tipp in Aufträge umwandeln
• Status, geplanter Start, Fälligkeit und Zuständigkeit im Blick

KUNDEN
• Geschäfts- und Privatkunden mit Rechnungs- und Leistungsadresse
• Suche, Archiv, CSV-Export
• Löschen oder Anonymisieren, wenn Angebote aufbewahrt werden müssen

IM TEAM ARBEITEN
• Rollen für Inhaber:in, Administrator:in und Mitarbeiter:in
• Mehrere Unternehmen in einem Konto
• Team- und Nachfass-Einstellungen verwalten Sie in der Web-App

IN DER APP
• Übersicht über offene und angenommene Angebote, Aufträge und anstehende Erinnerungen
• Angebote unterwegs anlegen, prüfen und versenden
• QR-Code eines ausgedruckten Angebots scannen und das Angebot direkt öffnen
• PDF teilen, Kundenlink teilen

DATENSCHUTZ
• Keine Werbung, kein app- oder websiteübergreifendes Tracking, keine Analyse-SDKs
• Verschlüsselte Übertragung (HTTPS)
• Datenexport und Kontolöschung direkt in der App

Für die Nutzung ist ein AngebotPilot-Konto erforderlich. Neue Unternehmen starten mit einer kostenlosen 30-tägigen Testphase. AngebotPilot ersetzt keine Steuerberatung.
```

The accuracy notes in [google-play.md](google-play.md#full-description-de-de) apply (email sending requires SMTP in
production).

## App Review information

| Item | Draft | Status |
|---|---|---|
| Sign-in required | Yes – provide demo account (email/password) for a demo company on the production API; guideline 2.1(a): "include demo account info (and turn on your back-end service!)" (<https://developer.apple.com/app-store/review/guidelines/>) | **Owner** |
| Notes for the reviewer (German/English) | Explain: B2B tool for quotations; customer acceptance happens on a web page (`…/#/q/{token}`); the QR scanner opens quotations of the reviewer's own company only; no purchases in the app | draft |
| Contact | Medin Turkes, certidevelopment@gmail.com, phone: **[PLATZHALTER]** | **Owner** |

## Compliance items

| Topic | Implementation / answer | Status |
|---|---|---|
| Account deletion (5.1.1(v)) | Initiated in the app: Mehr → Mein Konto → Konto löschen (password). Web page konto-loeschen.html as additional path. No Sign in with Apple (no token revocation needed). <https://developer.apple.com/support/offering-account-deletion-in-your-app/> | implemented in code |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` and `usesNonExemptEncryption: false` in `apps/mobile/app.config.ts` (only HTTPS via the OS) | set in config |
| Privacy manifest | `ios.privacyManifests` in `app.config.ts`: `NSPrivacyTracking: false`, no tracking domains, no collected data types declared there, required-reason APIs UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1`, DiskSpace `E174.1` | **verify** after the first EAS build (Expo guide: <https://docs.expo.dev/guides/apple-privacy/>) |
| App Privacy (nutrition label) | See [PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md#apple-app-privacy) | **Owner** confirm |
| Camera permission text | "Die Kamera wird nur zum Scannen von Angebots-QR-Codes verwendet." (`NSCameraUsageDescription`) | set |
| iPad | `supportsTablet: false` → iPhone only, no iPad screenshots | set |
| Age rating | New questionnaire (tiers 4+, 9+, 13+, 16+, 18+); since Sep 2026 declare whether the app has social-media capabilities (it does not) (<https://developer.apple.com/news/upcoming-requirements/>) | **Owner** |
| In-app purchases | None. Paid plans are not sold in the app and no payment exists yet. Before enabling paid plans: check guideline 3.1 (3.1.1 / 3.1.3) for subscriptions purchased outside the app | **Owner / legal: open question** |
| EU DSA trader status | Required to distribute in the EU; trader contact details are shown publicly (<https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>) | **Owner** |
| Build requirements | Since 28 Apr 2026 uploads must be built with Xcode 26 / iOS 26 SDK; Expo SDK 57 requires Xcode 26.4+ (<https://docs.expo.dev/versions/latest/>) | via EAS Build |

## Build path (blocked)

- No macOS/Xcode available. Use **EAS Build (cloud)** + **EAS Submit**
  (<https://docs.expo.dev/build/setup/>); `eas.json` profile `production` uses remote iOS credentials.
- Requires: **Apple Developer Program membership, 99 USD per year** (<https://developer.apple.com/programs/whats-included/>)
  and an Expo account (EAS free plan: up to 15 iOS builds, low-priority queue, 45-min timeout – monthly reset
  UNVERIFIED, <https://expo.dev/pricing>).
- [ ] **Owner:** enrol in the Apple Developer Program, create the app record with bundle id
      `com.certidevelopment.angebotpilot`, run `eas build -p ios --profile production`, then TestFlight.

## Screenshots

Required: at least one iPhone screenshot set for the 6.3" Dynamic Island class – **1206×2622 or 1179×2556** portrait
(1–10, PNG/JPEG, no alpha) according to Apple's specification page (no date; © 2026) – re-check in App Store Connect
at upload time because this rule changed recently
(<https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>).
None exist yet ([ASSET-INVENTORY.md](ASSET-INVENTORY.md)).
