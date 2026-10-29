# Google Play – Store Listing Draft

Status: **draft – nothing has been submitted.** App id `com.certidevelopment.angebotpilot`, owner Medin Turkes ·
Certi Development, contact certidevelopment@gmail.com. Language of the listing: German (de-DE).

Related: [STORE-READINESS.md](STORE-READINESS.md) · [PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md) ·
[ASSET-INVENTORY.md](ASSET-INVENTORY.md) · [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

## Main store listing

| Field | Limit | Value | Length |
|---|---|---|---|
| App name | 30 | `AngebotPilot` | 12 |
| Short description | 80 | `Angebote erstellen, als PDF senden, automatisch nachfassen, Aufträge gewinnen.` | 78 |
| Full description | 4000 | see below | 2769 |
| Category | – | Business (Geschäftlich) – owner to confirm | – |
| Contact email | – | certidevelopment@gmail.com | – |
| Website | – | https://metur100.github.io/Angebot.Pilot.Landing/ | – |
| Privacy policy | – | https://metur100.github.io/Angebot.Pilot.Landing/datenschutz.html | – |
| Account deletion URL | – | https://metur100.github.io/Angebot.Pilot.Landing/konto-loeschen.html | – |

Lengths were counted in Unicode characters (code points) of the exact text.

### Full description (de-DE)

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

Accuracy notes for the owner before publishing:
- "Versand per E-Mail" only works once production SMTP is configured (currently `Email:Provider=Capture`, nothing is
  delivered, and senders cannot verify their email address). Do not publish the listing before email works, or remove
  the email bullet.
- "kostenlose 30-tägige Testphase" matches `PlanCatalog.TrialLength`; no prices are mentioned because they are
  preliminary and no payment provider exists.
- "Keine Analyse-SDKs": based on `apps/mobile/package.json` at the time of writing – re-check before every release.

## App content (Play Console → Policy → App content)

| Declaration | Draft answer | Status |
|---|---|---|
| Privacy policy | URL above | **Owner:** legal review; fill placeholders on the page |
| Ads | No ads | ready |
| App access | Login required → provide a review account (email + password) for a demo company; the review account must not use real customer data | **Owner:** create account on production after launch blockers are resolved |
| Content rating | IARC questionnaire: business productivity tool; no user-to-user public content, no violence, no gambling. Note: the app lets companies send emails to their customers and shows customer data; no public social features | **Owner:** complete questionnaire |
| Target audience | 18+ (business users) | **Owner:** confirm |
| News app | No | ready |
| Data safety | See [PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md#google-play-data-safety) | **Owner:** confirm with legal review |
| Account deletion | In-app: Mehr → Mein Konto → Konto löschen (password confirmation). Web: konto-loeschen.html | ready in code; see discrepancy note in STORE-READINESS |
| Government app / financial features / health | No | ready |
| EU Digital Services Act trader status | Trader (business) – contact details shown publicly | **Owner:** UNVERIFIED requirement details for Play; decide and enter |

## Release

- Format: Android App Bundle (required for new apps since August 2021,
  <https://developer.android.com/guide/app-bundle>).
- Target API: new apps and updates must target **Android 16 (API 36)** since 31 Aug 2026
  (<https://developer.android.com/google/play/requirements/target-sdk>). Expo SDK 57 uses compileSdk/targetSdk 36
  (<https://docs.expo.dev/versions/latest/>) – verify in the built bundle's manifest.
- Current artefact: `artifacts/android/angebotpilot-1.0.0-2-release.aab` (outside Git), versionName `1.0.0`,
  versionCode `2` (2026-10-29, current `main`), signed with the owner's upload key (alias `angebotpilot-upload`, certificate SHA-256 starting
  `DB:CC:77:22…`). Not uploaded. Copy-paste checklist for every Console field: `store-assets/android/GOOGLE-PLAY-CONSOLE.md`.
- **Play App Signing:** new apps are enrolled automatically; Google holds the app signing key, the owner keeps the
  upload key (<https://support.google.com/googleplay/android-developer/answer/9842756>).
- New personal developer accounts (created after 13 Nov 2023) need a **closed test with ≥ 12 testers opted in for
  ≥ 14 consecutive days** before production access
  (<https://support.google.com/googleplay/android-developer/answer/14151465>).
- `eas.json` submit profile: track `internal`, release status `draft`.

## Graphics

See [ASSET-INVENTORY.md](ASSET-INVENTORY.md): icon 512×512 and feature graphic 1024×500 exist. Six phone screenshot
candidates exist in `screenshots/android/` (1344×2992 with alpha channel) but do not meet Play's rules as-is (no alpha;
long side ≤ 2 × short side); min. 2, up to 8; for promotion eligibility ≥ 4 at 1080×1920.
