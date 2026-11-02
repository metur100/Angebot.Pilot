# Apple App Store – App Store Connect copy-paste sheet (AngebotPilot 1.0.0)

Status as of 2026-11-02: **nothing has been submitted; no iOS build exists yet** (no Mac – build with EAS, see
below). Bundle id `com.certidevelopment.angebotpilot`, developer Medin Turkes · Certi Development, contact
certidevelopment@gmail.com. Primary language **German (de-DE)**, second localization **English (U.S.)**.
Texts match the app as of `main` on 2026-11-02 (quotations, jobs, invoices with e-invoice and payments, German/English
UI, light/dark mode) and are identical in substance to the Google Play listing
([GOOGLE-PLAY-CONSOLE.md](../../store-assets/android/GOOGLE-PLAY-CONSOLE.md)).

Character limits are checked with `node scripts/check-store-texts.mjs` (counts every `(max N)` block in this file in
Unicode code points). Results are in the table at the end of this file.

Related: [STORE-READINESS.md](STORE-READINESS.md) · [PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md#apple-app-privacy) ·
[ASSET-INVENTORY.md](ASSET-INVENTORY.md) · [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

## 1. New app (Apps → + → New App)

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | `AngebotPilot` |
| Primary language | German |
| Bundle ID | `com.certidevelopment.angebotpilot` (register it under Certificates, IDs & Profiles first, or let EAS create it) |
| SKU | `angebotpilot-ios` |
| User access | Full access |

## 2. App information (General → App Information)

| Field | Value |
|---|---|
| Category | Primary **Business**, secondary **Productivity** |
| Content rights | "Does your app contain, show, or access third-party content?" → **No** |
| Age rating | see section 6 (expected result **4+**) |
| EU Digital Services Act | **Trader** – name, address, email, phone are shown on the EU storefronts. Use the same address as the Impressum once its placeholder is filled in |
| License agreement | Apple standard EULA |

### de-DE

Name (max 30):
```text
AngebotPilot
```

Subtitle (max 30):
```text
Angebote, Aufträge, Rechnungen
```

Privacy policy URL:
```text
https://angebot.gentlegroup.de/datenschutz.html
```

### en-US (add localization: English (U.S.))

Name (max 30):
```text
AngebotPilot
```

Subtitle (max 30):
```text
Quotes, jobs and invoices
```

Privacy policy URL:
```text
https://angebot.gentlegroup.de/en/privacy.html
```

## 3. Pricing and availability

- Price: **Free** (USD 0). No in-app purchases, no subscriptions sold in the app. Paid plans are not sold anywhere yet;
  before selling them outside the app check guideline 3.1 (3.1.1 / 3.1.3) – **owner/legal open question**.
- Availability: start with **Germany, Austria, Switzerland** (documents are German), same as Google Play.
- iPad / Mac / Vision Pro: the app is iPhone-only (`supportsTablet: false`). Untick "Make this app available on Mac"
  and Apple Vision Pro unless tested.

## 4. Version page (iOS App → 1.0 Prepare for Submission)

### de-DE

Promotional text (max 170):
```text
Angebote und Rechnungen unterwegs erstellen, online annehmen lassen und automatisch nachfassen – mit E-Rechnung (ZUGFeRD). Ohne Werbung, ohne Tracking.
```

Keywords (max 100):
```text
Angebot,Rechnung,E-Rechnung,ZUGFeRD,Kostenvoranschlag,Handwerk,Handwerker,Auftrag,Kunden,PDF,KMU
```

Description (max 4000):
```text
AngebotPilot hilft kleinen Betrieben aus Handwerk und Dienstleistung, Angebote schnell zu erstellen, professionell zu versenden, zuverlässig nachzufassen, angenommene Angebote in Aufträge zu überführen und abzurechnen.

ANGEBOTE ERSTELLEN
• Positionen mit Menge, Einheit, Einzelpreis, Rabatt und Steuersatz
• Exakte Berechnung: Umsatzsteuer je Steuersatz, kaufmännisch gerundet
• Regelbesteuerung, Kleinunternehmerregelung (§ 19 UStG) oder Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG) – Sie wählen und bestätigen die steuerliche Behandlung selbst
• Fortlaufende Angebotsnummern, die nie doppelt vergeben werden
• Vorlagen für wiederkehrende Leistungen, Angebote duplizieren
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

RECHNUNGEN
• Rechnung direkt aus Auftrag oder Angebot erzeugen
• Fortlaufende Rechnungsnummern, Leistungszeitraum und Zahlungsziel
• E-Rechnung im Format ZUGFeRD/Factur-X (PDF mit eingebettetem XML)
• Zahlungseingänge und Teilzahlungen erfassen, überfällige Rechnungen sofort erkennen
• Zahlungserinnerung per E-Mail senden
• Stornorechnung mit einem Tipp

KUNDEN
• Geschäfts- und Privatkunden mit Rechnungs- und Leistungsadresse
• Suche, Archiv, CSV-Export
• Löschen oder Anonymisieren, wenn Angebote aufbewahrt werden müssen

IM TEAM ARBEITEN
• Rollen für Inhaber:in, Administrator:in und Mitarbeiter:in
• Mehrere Unternehmen in einem Konto
• Team- und Nachfass-Einstellungen verwalten Sie in der Web-App

IN DER APP
• Übersicht über offene und angenommene Angebote, Aufträge, offene und überfällige Rechnungen
• Angebote unterwegs anlegen, prüfen und versenden
• QR-Code eines ausgedruckten Angebots scannen und das Angebot direkt öffnen
• PDF teilen, Kundenlink teilen
• Deutsch oder Englisch, heller oder dunkler Modus

DATENSCHUTZ
• Keine Werbung, kein app- oder websiteübergreifendes Tracking, keine Analyse-SDKs
• Verschlüsselte Übertragung (HTTPS)
• Datenexport und Kontolöschung direkt in der App

Für die Nutzung ist ein AngebotPilot-Konto erforderlich. Neue Unternehmen starten mit einer kostenlosen 30-tägigen Testphase. AngebotPilot ersetzt keine Steuerberatung.
```

Support URL:
```text
https://angebot.gentlegroup.de/support.html
```

Marketing URL:
```text
https://angebot.gentlegroup.de/
```

### en-US

Promotional text (max 170):
```text
Create quotes and invoices on the go, let customers accept online and follow up automatically – with e-invoicing (ZUGFeRD). No ads, no tracking.
```

Keywords (max 100):
```text
quote,quotation,invoice,e-invoice,ZUGFeRD,estimate,tradesman,contractor,jobs,customers,PDF,business
```

Description (max 4000):
```text
AngebotPilot helps small trade and service businesses create quotations quickly, send them professionally, follow up reliably, turn accepted quotations into jobs and invoice them.

CREATE QUOTATIONS
• Line items with quantity, unit, unit price, discount and VAT rate
• Exact calculation: VAT per rate, commercially rounded
• Standard VAT, German small-business scheme (§ 19 UStG) or reverse charge (§ 13b UStG) – you choose and confirm the tax treatment yourself
• Sequential quotation numbers that are never assigned twice
• Templates for recurring work, duplicate quotations
• Revisions: rework a sent quotation, the old version is replaced automatically

PROFESSIONAL PDF
• With your logo, your company details and optionally your bank details
• The PDF that was sent is frozen and never changes
• When sent with a customer link: a QR code that opens the quotation online

SEND AND LET CUSTOMERS ACCEPT ONLINE
• Send by email with PDF attachment and/or a personal customer link
• Or hand it over yourself and mark it as sent
• Your customer views the quotation in the browser and can accept or decline it with their name – no account needed
• You see when the customer link was opened (customers are informed about this)

AUTOMATIC FOLLOW-UP
• Reminders after configurable days and before the quotation expires
• Sent at 9 am local time, with a minimum gap and never after expiry
• Customers can unsubscribe from reminders with one click
• Reminders stop automatically on acceptance, rejection, cancellation or expiry

JOBS
• Turn accepted quotations into jobs with one tap
• Status, planned start, due date and assignee at a glance

INVOICES
• Create an invoice straight from a job or quotation
• Sequential invoice numbers, service period and payment terms
• E-invoice in ZUGFeRD/Factur-X format (PDF with embedded XML)
• Record payments and partial payments, spot overdue invoices instantly
• Send payment reminders by email
• Cancellation invoice with one tap

CUSTOMERS
• Business and private customers with billing and service address
• Search, archive, CSV export
• Delete or anonymise when quotations must be retained

WORK AS A TEAM
• Roles for owner, administrator and employee
• Several companies in one account
• Team and follow-up settings are managed in the web app

IN THE APP
• Overview of open and accepted quotations, jobs, open and overdue invoices
• Create, review and send quotations on the go
• Scan the QR code of a printed quotation and open it directly
• Share the PDF, share the customer link
• German or English, light or dark mode

PRIVACY
• No ads, no cross-app or cross-site tracking, no analytics SDKs
• Encrypted transmission (HTTPS)
• Data export and account deletion right in the app

An AngebotPilot account is required. New companies start with a free 30-day trial. AngebotPilot is not tax advice. Quotation and invoice documents are created in German.
```

Support URL:
```text
https://angebot.gentlegroup.de/en/support.html
```

Marketing URL:
```text
https://angebot.gentlegroup.de/en/
```

### Shared version fields

| Field | Value |
|---|---|
| Version | `1.0.0` (from `version` in `apps/mobile/app.config.ts`); build number `1` (`ios.buildNumber`) |
| Copyright | `2026 Medin Turkes` |
| Routing app coverage file | none |
| Sign-in with Apple | not offered (email/password only, no third-party login → guideline 4.8 does not apply) |
| Release | Manually release this version |

"What's New in This Version" is not shown for the first version. For the next update (max 4000), e.g.:
```text
<de-DE> Fehlerbehebungen und Verbesserungen.
<en-US> Bug fixes and improvements.
```

### Screenshots (App Store Connect → Previews and Screenshots)

Real captures of the Android **release build** (versionCode 3, same JavaScript bundle as the iOS app) against the live
API with the demo company "Berkcan Malerbetrieb GmbH" (fictitious customers, `@example.com` addresses), captured at
the iPhone/iPad logical screen sizes; Android status and navigation bars are cropped away. Same captions and framing as
the Play set. Regenerate with `scripts/store-screenshots.mjs` (profiles `iphone-6.9`, `iphone-6.3`, `ipad-13`).
Captions are German – use the same set for en-US or leave en-US empty (falls back to the primary language).

| Display size | Folder | Files | Pixels |
|---|---|---|---|
| iPhone 6.9" | `store-assets/ios/iphone-6.9/` | 8 × JPEG (no alpha) | 1320 × 2868 |
| iPhone 6.3" | `store-assets/ios/iphone-6.3/` | 8 × JPEG (no alpha) | 1206 × 2622 |
| iPad 13" | `store-assets/ios/ipad-13/` | 5 × JPEG (no alpha) | 2064 × 2752 |

Order: 01 Übersicht · 02 Angebote · 03 Angebotsdetails · 04 Angebotseditor · 05 Aufträge · 06 Rechnungen · 07 Kunden ·
08 Dunkelmodus (iPad: Übersicht, Angebote, Aufträge, Rechnungen, Kunden).
Upload the 6.9" set (App Store Connect scales it down for smaller iPhones); the 6.3" set is optional. **The iPad set
only applies if `ios.supportsTablet` is switched to `true`** – with the current iPhone-only build App Store Connect does
not ask for iPad screenshots. App icon: `store-assets/ios/app-icon-1024.png` (1024 × 1024, opaque) – taken from the
build, not uploaded separately.

## 5. App Review information

| Field | Value |
|---|---|
| Sign-in required | **Yes** |
| User name | `berkcan@gentlegroup.de` |
| Password | from GentleHub → project → Testfirma-Login (never commit it – this repository is public) |
| Contact first / last name | Medin / Turkes |
| Contact phone | **owner to fill** (required by App Store Connect) |
| Contact email | `certidevelopment@gmail.com` |
| Attachment | none |

Notes (max 4000):
```text
AngebotPilot is a business tool for small trade and service companies in Germany: create quotations, send them to customers, follow up, turn accepted quotations into jobs and invoice them. Sign-in is required; please use the demo account above (email + password, no 2FA). It belongs to the fictitious demo company "Berkcan Malerbetrieb GmbH" with sample customers (@example.com addresses), quotations in every status, jobs and invoices.

- The UI follows the account language (German). Switch to English under "Mehr" (More) > "Sprache" (Language) > "English".
- Please do not send quotations or invoices by email; use "Selbst übergeben" (Hand over myself) / "Als versendet markieren" (Mark as sent) so no emails go to the sample addresses.
- Customers accept or decline a quotation on a web page opened from the customer link; this is not part of the app.
- The camera is used only to scan the QR code printed on a quotation PDF; it opens quotations of the signed-in company only. Camera frames are processed on the device and never uploaded.
- Account deletion: "Mehr" > "Mein Konto" > "Konto löschen" (password confirmation). Please do not delete the demo account.
- No in-app purchases, no ads, no tracking. New companies get a free 30-day trial; no payment is taken anywhere.
- Backend: https://angebotpilot.runasp.net (production).
```

## 6. Age rating (App Information → Age Rating → Edit)

Apple's age-rating questionnaire (current version with 13+/16+/18+ tiers). Answer:

| Section | Question | Answer |
|---|---|---|
| Features | Parental controls | No |
| | Age assurance | No |
| | Unrestricted web access (in-app browser to arbitrary sites) | No – only the company's own legal pages open in the system browser sheet |
| | User-generated content (shared with other users/the public) | No – business documents are private to the company and its own customers; nothing is published |
| | Messaging and chat | No |
| | Advertising | No |
| | Social-media capabilities | No |
| Mature themes | Profanity, horror/fear, alcohol/tobacco/drugs, mature/suggestive themes | None |
| Medical / wellness | Medical or treatment information, health topics | None |
| Sexuality / nudity | all | None |
| Violence | cartoon, realistic, prolonged/graphic, guns | None |
| Chance-based activities | Gambling, simulated gambling, contests, loot boxes | None / No |

Expected rating: **4+**. Made for Kids: **No**.

## 7. App Privacy (App Store Connect → App Privacy)

Privacy policy URL: `https://angebot.gentlegroup.de/datenschutz.html`. Full reasoning:
[PRIVACY-QUESTIONNAIRE.md](PRIVACY-QUESTIONNAIRE.md#apple-app-privacy).

"Do you or your third-party partners collect data from this app?" → **Yes**. For every type below: **Linked to the
user: Yes · Used for tracking: No · Purpose: App Functionality** only.

| Category | Data type | Collected |
|---|---|---|
| Contact Info | Name | Yes (account name; customer names the user enters) |
| Contact Info | Email Address | Yes |
| Contact Info | Phone Number | Yes (optional fields) |
| Contact Info | Physical Address | Yes (company/customer addresses) |
| Financial Info | Other Financial Info | Yes (amounts on quotations/invoices, recorded payments, optional bank details) |
| User Content | Emails or Text Messages | Yes (message text when sending a quotation/invoice by email) |
| User Content | Other User Content | Yes (quotations, invoices, jobs, templates, notes) |
| Identifiers | User ID | Yes (internal account id) |
| Usage Data | Product Interaction | **Owner decision** – server-side activity history of business actions, no UI analytics. Conservative: Yes |

Not collected: Health & Fitness, Location, Sensitive Info, Contacts, Browsing/Search History, Purchases, Diagnostics,
Device ID, Advertising Data, Photos or Videos (camera frames stay on the device), Audio, Other Data. Tracking: **No**.

The privacy manifest in `apps/mobile/app.config.ts` (`ios.privacyManifests.NSPrivacyCollectedDataTypes`) currently
lists Email, Name, Phone, Physical Address, User ID and Other User Content. **Before the first iOS build add**
`NSPrivacyCollectedDataTypeOtherFinancialInfo` and `NSPrivacyCollectedDataTypeEmailsOrTextMessages` (and
`NSPrivacyCollectedDataTypeProductInteraction` if declared above) so the manifest matches these answers.

## 8. Compliance items

| Topic | Answer / implementation | Status |
|---|---|---|
| Export compliance | Only standard HTTPS through the OS → exempt. `ITSAppUsesNonExemptEncryption: false` is set in `app.config.ts`, so App Store Connect does not ask per build | set |
| Account deletion (5.1.1(v)) | In-app: Mehr → Mein Konto → Konto löschen (password). Web: `https://angebot.gentlegroup.de/konto-loeschen.html` | implemented |
| Camera permission text | `NSCameraUsageDescription`: "Die Kamera wird nur zum Scannen von Angebots-QR-Codes verwendet." (localized en in `locales/en.json`) | set |
| Push notifications / tracking (ATT) | not used | – |
| Build requirements | uploads must be built with the current Xcode/iOS SDK; Expo SDK 57 via EAS Build uses a compliant image | via EAS |

## 9. Build path (blocked on the owner)

- No macOS/Xcode on the build machine → **EAS Build (cloud)** + **EAS Submit**; `eas.json` profile `production`.
- Needs the **Apple Developer Program** (99 USD/year) and an Expo account.
- [ ] **Owner:** enrol, create the app record (section 1), `cd apps/mobile && npx eas build -p ios --profile production`,
      then `npx eas submit -p ios` → TestFlight → submit for review.

## 10. Character counts (`node scripts/check-store-texts.mjs`, 2026-11-02)

| Field | Limit | de-DE | en-US |
|---|---|---|---|
| Name | 30 | 12 | 12 |
| Subtitle | 30 | 30 | 25 |
| Promotional text | 170 | 151 | 144 |
| Keywords (comma-separated, no spaces) | 100 | 96 | 99 |
| Description | 4000 | 3219 | 2891 |
| Review notes (shared) | 4000 | 1336 | – |
