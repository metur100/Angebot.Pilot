# Privacy Questionnaires – Drafts (Google Play Data safety, Apple App Privacy)

Status: **draft for owner and legal review.** Answers are derived from the code at the time of writing. They must
match the privacy policy (`datenschutz.html` on the landing site, which still contains placeholders). Nothing has
been submitted.

Related: [google-play.md](google-play.md) · [apple-app-store.md](apple-app-store.md) ·
[THREAT-MODEL.md](../security/THREAT-MODEL.md)

## 1. Actual data flows (basis for the answers)

| Data | Source | Where it goes | Purpose | Required? |
|---|---|---|---|---|
| Account: email, display name, password (hashed server-side) | user | AngebotPilot API → SQL Server (MonsterASP, EU/Germany per provider) | account, login, notifications | required |
| Company data: name, address, email, phone, website, VAT id, tax number, brand colour, bank details (IBAN/BIC, optional), logo (web app only) | user | API → DB; logo/PDFs → `App_Data` storage (or R2 if enabled) | quotation documents | name required, rest optional |
| Customer data entered by the user: names, salutation, email, phone, billing/service address, VAT id, notes | user (about third parties) | API → DB, PDFs, emails to the customer | quotations, reminders | optional per field (company name or last name required) |
| Quotations, line items, texts, internal notes, jobs, templates | user | API → DB, PDFs | core function | – |
| Activity/audit records (who created/sent/changed what, timestamps), quotation events | generated | DB | history, security, accountability | automatic |
| Session data: refresh token (hash server-side; raw token in the device keystore), session list (client type, timestamps) | generated | DB; device secure storage | authentication | automatic |
| Notifications | generated | DB | in-app notifications | automatic |
| Emails sent through the platform (recipient, subject, body, attachment reference) | generated from user input | DB outbox → SMTP provider (not configured yet) | delivery, retries | when sending by email |
| Customer interaction on the public page: open timestamps/count, decision, typed name, note, opt-out flag | the user's customer (web, not the app) | DB | inform the company | – |
| Camera images | device camera | **processed on the device only** for QR decoding (`expo-camera` barcode scanner); not uploaded | open a quotation from a printed QR code | optional feature |
| IP address, user agent | network | transient: hosting web server, in-memory rate limiter. **Not stored by the application** (hosting access-log retention UNVERIFIED) | security | automatic |

Not present (verified in `apps/mobile/package.json` and `app.config.ts` at the time of writing): advertising SDKs,
analytics SDKs, crash-reporting SDKs, attribution/fingerprinting, location access, contacts access, photo library
access (storage/media permissions are explicitly blocked), microphone, push notifications, in-app purchases,
third-party login. The app does not track users across apps or websites.

Security: all traffic uses HTTPS (cleartext only in local emulator builds); the database connection is encrypted
(`Encrypt=True`); passwords are hashed (PBKDF2); refresh tokens are stored hashed server-side and in the
Keystore/Keychain on the device.

Deletion: in the app (Mehr → Mein Konto → Konto löschen, password confirmation) and in the web app (Einstellungen →
Konto). Web request page: <https://metur100.github.io/Angebot.Pilot.Landing/konto-loeschen.html> (also by email to
certidevelopment@gmail.com). Deleting the account removes the user, sessions, memberships, the user's notifications
and invitations, and every company in which the user is the only active member, including all its customers,
quotations, jobs, files and email records. Retained: audit events (with the deleted user's internal id, company
reference removed), records inside companies that continue to exist with other members, backups and hosting logs for
their retention period (**[PLATZHALTER: Dauer]** – owner to fill).

## Google Play Data safety

Answers per Play Console section (<https://support.google.com/googleplay/android-developer/answer/10787469>).

**Data collection and security**

| Question | Draft answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes (in-app and via the web URL above) |

**Data types collected** (collected = transmitted off the device to our server). "Shared" = No for all types: the
hosting, email and storage providers act as processors (service providers), and sending a quotation to a customer is a
user-initiated transfer. **Owner/legal to confirm this interpretation.**

| Category → type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Personal info → Name | Yes (account name; customer names entered by the user) | No | No | Required (account name) | App functionality, Account management |
| Personal info → Email address | Yes (account email; customer emails) | No | No | Required (account email) | App functionality, Account management |
| Personal info → Phone number | Yes (company and customer phone numbers, optional) | No | No | Optional | App functionality |
| Personal info → Address | Yes (company and customer addresses) | No | No | Optional | App functionality |
| Personal info → Other info | Yes (VAT ids, tax number, salutation, notes) | No | No | Optional | App functionality |
| Financial info → Other financial info | Yes (company bank details for PDFs, optional; quotation amounts) | No | No | Optional | App functionality |
| Messages → Emails | Yes (email subject/message the user writes when sending a quotation) | No | No | Optional | App functionality |
| App activity → Other user-generated content | Yes (quotations, line items, texts, jobs, templates, notes) | No | No | Required for core use | App functionality |
| App activity → App interactions | Yes (audit/activity history of business actions) – **owner to decide** whether this counts | No | No | Required | App functionality, Fraud prevention/security |
| Location, Contacts, Photos and videos, Audio, Files and docs, Calendar, Health, Web browsing, Device or other IDs, App info and performance (crash logs, diagnostics) | No | – | – | – | – |

Notes:
- Photos: camera frames are only analysed on the device for QR codes and never uploaded → not "collected".
- The company logo upload exists only in the web app, not in the mobile app.
- Data safety form is required for all published tracks (closed/open/production); a privacy policy is required.

## Apple App Privacy

Answers for App Store Connect → App Privacy (<https://developer.apple.com/app-store/app-privacy-details/>).

**Do you or your third-party partners collect data from this app?** Yes.

| Data type | Collected | Linked to the user | Used for tracking | Purposes |
|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | App Functionality |
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Contact Info → Phone Number | Yes (optional) | Yes | No | App Functionality |
| Contact Info → Physical Address | Yes (optional) | Yes | No | App Functionality |
| Financial Info → Other Financial Info | Yes (optional bank details, quotation amounts) | Yes | No | App Functionality |
| User Content → Emails or Text Messages | Yes (message text when sending a quotation) | Yes | No | App Functionality |
| User Content → Other User Content | Yes (quotations, notes, jobs, templates) | Yes | No | App Functionality |
| Identifiers → User ID | Yes (internal account id) | Yes | No | App Functionality |
| Usage Data → Product Interaction | **Owner to decide** (server-side audit/activity history of business actions; no UI analytics) | Yes | No | App Functionality |
| Location, Health & Fitness, Sensitive Info, Contacts, Browsing/Search History, Purchases, Diagnostics, Device ID, Advertising Data, Photos or Videos, Audio | No | – | – | – |

Tracking: **No** (`NSPrivacyTracking: false`). Third-party SDKs: Expo/React Native modules only; no analytics or
advertising SDKs.

Discrepancy to resolve before the first iOS upload: `apps/mobile/app.config.ts` declares
`NSPrivacyCollectedDataTypes: []` in the privacy manifest, while the app does collect the data types above. The
manifest's collected-data list should be consistent with the App Privacy answers
(<https://developer.apple.com/tutorials/data/documentation/bundleresources/privacy-manifest-files.json>).

## Open questions for the owner / legal review

- [ ] **Owner/legal:** confirm that processors (MonsterASP, email provider, Cloudflare if used) do not count as
      "sharing" and that user-initiated sending to customers is exempt.
- [ ] **Owner/legal:** whether customer data entered by users (third-party personal data) must be declared per type
      as done above (conservative choice).
- [ ] **Owner:** "App interactions"/"Product Interaction" for the audit history – declare or not.
- [ ] **Owner:** fill retention periods for backups and logs on `konto-loeschen.html` and `datenschutz.html`.
- [ ] **Owner:** keep these answers in sync with every release (re-check `apps/mobile/package.json` for new SDKs).
