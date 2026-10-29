# Google Play Console – copy-paste checklist (AngebotPilot 1.0.0, versionCode 2)

Everything needed to create the app in Play Console and submit the first release. Go top to bottom; each block
says which Console page it belongs to. Status as of 2026-10-29. Nothing has been uploaded yet.

| | |
|---|---|
| Package name | `com.certidevelopment.angebotpilot` |
| Developer | Medin Turkes · Certi Development |
| Version | versionName `1.0.0`, versionCode `2` (built from `main` with the English UI and dark mode) |
| Default language | German – de-DE (add English – en-US as a second listing language) |
| App or game | App · Free · no in-app purchases (the subscription is handled outside Google Play; none is sold yet) |

Related docs: [docs/store-listings/google-play.md](../../docs/store-listings/google-play.md) ·
[PRIVACY-QUESTIONNAIRE.md](../../docs/store-listings/PRIVACY-QUESTIONNAIRE.md) ·
[RELEASE-CHECKLIST.md](../../docs/store-listings/RELEASE-CHECKLIST.md)

> **Before you submit to production:** the legal pages on angebot.gentlegroup.de still contain
> `[PLATZHALTER: …]` markers (address, hosting provider, retention periods). Google reviews the privacy policy URL;
> fill those in first. Internal and closed testing can start before that.

---

## 1. Create app (All apps → Create app)

| Field | Value |
|---|---|
| App name | `AngebotPilot` |
| Default language | `Deutsch (Deutschland) – de-DE` |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick Developer Program Policies and US export laws |

## 2. Release artefact (Test and release → Internal testing / Closed testing → Create new release)

| Item | Path |
|---|---|
| Signed AAB (upload this) | `C:\Users\TurkesMedin\repos\Medin\Angebot.Pilot\artifacts\android\angebotpilot-1.0.0-2-release.aab` (git-ignored) |
| Copy next to the key | `C:\Users\TurkesMedin\keystore\angebotpilot-1.0.0-2-release.aab` |
| Upload keystore | `C:\Users\TurkesMedin\keystore\angebotpilot` (a file, not a folder) · alias `angebotpilot-upload` |
| Keystore password | in `C:\Users\TurkesMedin\keystore\angebotpilot-password.txt` – never commit, never paste anywhere |
| Upload certificate SHA-256 | `DB:CC:77:22:0A:19:D4:87:47:27:02:37:E0:8C:B9:A4:00:68:50:6C:CC:4A:D2:1A:F6:51:56:E7:90:8B:AF:F9` |
| AAB SHA-256 | `db5c7b061ae8f38bc66481d9101f8cc9439310e7255667f7c79c34a0b594ba6a` |
| Manifest | minSdk 24 · targetSdk 36 · permissions: INTERNET, CAMERA (QR scanner), ACCESS_NETWORK_STATE · no AD_ID |

- **Play App Signing:** accept the default (Google manages the app signing key; you keep the upload key above).
- New personal developer accounts: a **closed test with at least 12 testers opted in for 14 consecutive days** is
  required before production access.
- The older `angebotpilot-1.0.0-1-release.aab` (versionCode 1, Oct 13) is outdated; do not upload it. Because it was
  never uploaded, versionCode 1 is simply skipped.

### Release name and notes

Release name: `1.0.0 (2)`

```text
<de-DE>
Erste Version von AngebotPilot:
• Angebote mit Positionen, Rabatten und Umsatzsteuer erstellen
• PDF und persönlicher Kundenlink mit Online-Annahme
• Automatische Erinnerungen an offene Angebote
• Aus Zusagen Aufträge machen
• Rechnungen mit E-Rechnung (ZUGFeRD/Factur-X) und Zahlungseingängen
• Deutsch und Englisch, heller und dunkler Modus
</de-DE>
<en-US>
First release of AngebotPilot:
• Create quotations with line items, discounts and VAT
• PDF and personal customer link with online acceptance
• Automatic reminders for open quotations
• Turn accepted quotations into jobs
• Invoices with e-invoice (ZUGFeRD/Factur-X) and payments
• German and English, light and dark mode
</en-US>
```

## 3. Main store listing (Grow users → Store presence → Main store listing)

### de-DE

App name (max 30):
```text
AngebotPilot
```

Short description (max 80):
```text
Angebote erstellen, als PDF senden, automatisch nachfassen, Aufträge gewinnen.
```

Full description (max 4000):
```text
AngebotPilot hilft kleinen Betrieben aus Handwerk und Dienstleistung, Angebote schnell zu erstellen, professionell zu versenden, zuverlässig nachzufassen, angenommene Angebote in Aufträge zu überführen und abzurechnen.

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

RECHNUNGEN
• Rechnung direkt aus Auftrag oder Angebot erzeugen
• Fortlaufende Rechnungsnummern, Leistungszeitraum und Zahlungsziel
• E-Rechnung im Format ZUGFeRD/Factur-X (PDF mit eingebettetem XML)
• Zahlungseingänge und Teilzahlungen erfassen, überfällige Rechnungen sofort erkennen
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

### en-US (Add translation → English (United States) – en-US)

App name:
```text
AngebotPilot
```

Short description (max 80):
```text
Create quotations, send them as PDF, follow up automatically and win jobs.
```

Full description:
```text
AngebotPilot helps small trade and service businesses create quotations quickly, send them professionally, follow up reliably, turn accepted quotations into jobs and invoice them.

CREATE QUOTATIONS
• Line items with quantity, unit, unit price, discount and VAT rate
• Exact calculation: VAT per rate, commercially rounded
• Standard VAT, German small-business scheme (§ 19 UStG) or reverse charge (§ 13b UStG) – you choose and confirm the tax treatment yourself
• Sequential quotation numbers that are never assigned twice
• Templates for recurring work
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

### Graphics (same files for both languages)

| Console field | File (repo-relative) | Spec |
|---|---|---|
| App icon | `store-assets/android/icon-512.png` | 512×512 PNG, 32-bit |
| Feature graphic | `store-assets/android/feature-graphic-1024x500.png` | 1024×500 PNG, no alpha |
| Phone screenshots (8) | `store-assets/android/phone-screenshots/phone-01-dashboard.jpg` … `phone-08-dashboard-dark.jpg` | 1080×1920 JPEG |
| 7-inch tablet screenshots (5) | `store-assets/android/tablet-7-screenshots/tablet-7-01-dashboard.jpg` … `tablet-7-05-customers.jpg` | 1200×2134 JPEG |
| 10-inch tablet screenshots (5) | `store-assets/android/tablet-10-screenshots/tablet-10-01-dashboard.jpg` … `tablet-10-05-customers.jpg` | 1620×2880 JPEG |
| Video | – | none |

Phone order: 01 Übersicht · 02 Angebotsliste · 03 Angebotsdetails · 04 Angebotseditor · 05 Aufträge ·
06 Rechnungen · 07 Kunden · 08 Übersicht im Dunkelmodus. All screenshots show the release build (versionCode 2)
against the live API with the demo company “Berkcan Malerbetrieb GmbH” (fictitious customers, `@example.com`
addresses). Tablet screenshots are real renders of the app at tablet screen metrics. Raw captures are in
`screenshots/android/`; regenerate with `scripts/store-screenshots.mjs`. The captions are German; for the en-US
listing you can reuse them or skip localized screenshots (Play falls back to the default language).

## 4. Store settings (Grow users → Store presence → Store settings)

| Field | Value |
|---|---|
| App category | **Business** (Geschäftlich) |
| Tags (pick up to 5 from Play's list) | Business, Productivity, Invoicing / Billing, Small business, Office (choose the closest available ones) |
| Email address | `certidevelopment@gmail.com` |
| Phone | leave empty (optional) |
| Website | `https://angebot.gentlegroup.de/` |
| External marketing | your choice (default on) |

## 5. App content (Policy → App content)

### Privacy policy
```text
https://angebot.gentlegroup.de/datenschutz.html
```
(English version: `https://angebot.gentlegroup.de/en/privacy.html` – Play takes one URL; use the German one.)

### Ads
**No, my app does not contain ads.**

### App access
**All or some functionality is restricted** → Add instructions:

| Field | Value |
|---|---|
| Name | `Demo-Unternehmen / Demo company` |
| Username | `berkcan@gentlegroup.de` |
| Password | `Runderbaum12` |
| Any other information | see text below |

```text
Sign in with the credentials above (no 2FA, no OTP). The account belongs to the fictitious demo company "Berkcan Malerbetrieb GmbH" with sample customers, quotations in every status, jobs and invoices. The UI language follows the account (German); switch to English under "Mehr" → "Sprache" → "English". Please do not send quotations or invoices by email – use "Manual / mark as sent" so no emails go to the sample addresses. The QR scanner needs the camera only to read quotation QR codes.
```

### Content rating (IARC questionnaire)
- Email: `certidevelopment@gmail.com` · Category: **All Other App Types** (utility/productivity – not a game,
  not social, not a reference/news app).
- Violence, fear, sexuality, nudity, profanity/crude humour, drugs/alcohol/tobacco, gambling or simulated gambling,
  hate speech: **No** to every question.
- Does the app allow users to interact or exchange content with other users? **Yes** – team members of a company
  share business documents, and quotations are sent to customers via email/link. (Conservative answer; results in
  the "Users Interact" notice, which is accurate.) User-generated content is not public and not moderated by us.
- Does the app share the user's current physical location with other users? **No**
- Does the app allow users to purchase digital goods? **No**
- Is the app a web browser or search engine? **No**
- Expected result: rated for everyone / USK 0 / PEGI 3 with the "Users Interact" element.

### Target audience and content
- Target age group: **18 and over** only (business software for companies).
- Is the app appealing to children? **No**.

### News app
**No.**

### COVID-19 contact tracing and status apps
**My app is not a publicly available COVID-19 contact tracing or status app.**

### Data safety
Answer as in [PRIVACY-QUESTIONNAIRE.md](../../docs/store-listings/PRIVACY-QUESTIONNAIRE.md#google-play-data-safety)
(summary – re-check against the final privacy policy):

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data be deleted? | **Yes** – in-app (Mehr → Mein Konto → Konto löschen) and `https://angebot.gentlegroup.de/konto-loeschen.html` |

Data types (all: Collected = yes, Shared = **no**, Processed ephemerally = no, purpose **App functionality**;
account name/email also **Account management**):

| Category → type | Required? |
|---|---|
| Personal info → Name | Required (account name; customer names entered by the user) |
| Personal info → Email address | Required (account email; customer emails) |
| Personal info → Phone number | Optional |
| Personal info → Address | Optional |
| Personal info → Other info (VAT id, tax number, notes) | Optional |
| Financial info → Other financial info (bank details on documents, quotation/invoice amounts, recorded payments) | Optional |
| Messages → Emails (text the user writes when sending a quotation/invoice) | Optional |
| App activity → Other user-generated content (quotations, invoices, jobs, templates, notes) | Required |
| App activity → App interactions (server-side activity history of business actions) | Required – purposes: App functionality, Fraud prevention/security (owner decision; declaring it is the conservative choice) |

Not collected: location, contacts, photos/videos (camera frames are analysed on the device for QR codes only and
never uploaded), audio, files, calendar, health, web history, device IDs, crash logs/diagnostics.
No data is used for advertising or tracking.

### Account deletion
```text
https://angebot.gentlegroup.de/konto-loeschen.html
```
In-app path: Mehr → Mein Konto → Konto löschen (password confirmation).

### Government apps
**No** – not developed by or on behalf of a government.

### Financial features
**My app doesn't provide any financial features** (no banking, loans, payments, crypto, money transfer or
investment services; it only creates quotations/invoices and records payments the user received elsewhere).

### Health apps
**My app does not have any health features.**

### Advertising ID
**No** – the app does not use the advertising ID (no `AD_ID` permission in the manifest).

### Photo and video permissions / Foreground service / Exact alarms
Not applicable – the app requests none of these (storage/media permissions are explicitly blocked; camera is used
for QR scanning only, which needs no extra declaration).

### EU Digital Services Act – trader status
**I'm a trader** (business). The trader contact details (name, address, email, phone) will be shown publicly – enter
the same address as in the Impressum once the placeholder there is filled in.

## 6. Pricing and distribution
- Free. Countries: start with **Germany, Austria, Switzerland** (German-language business documents); add more later.
- Contains ads: No.

## 7. Test account data (for your own reference)

The review account was created through the normal register flow on 2026-10-29 (email marked verified in the DB).
Company “Berkcan Malerbetrieb GmbH”, Köln: 10 customers, 12 quotations (draft, sent, viewed, accepted, declined,
expired, cancelled), 6 jobs (open, in progress, completed), 5 invoices (paid, partially paid, open, overdue, draft),
5 templates, 4 tax rates, scheduled follow-ups. Do not use it for real customer data. The subscription is a 30-day
trial that ends **2026-11-28** – extend it (DB/billing) before then if review or the closed test runs longer.
