// Demo data of the mock backend: an electrician business in Munich with realistic quotations in every status.
// All dates are relative to "today" (Europe/Berlin) so expiring/expired examples stay meaningful.
import { addDaysIso, todayIso, type LineItemInput, type MembershipRole, type QuotationStatus, type TemplateLineItemInput } from '@angebotpilot/api-contracts';
import {
  addAudit,
  addEvent,
  cancelScheduledFollowUps,
  planFollowUps,
} from './domain';
import {
  buildLineItems,
  buildTemplateLineItems,
  defaultSettings,
  nextNumber,
  nextRowVersion,
  nowIso,
  snapshotRecipient,
  type CompanyRec,
  type CustomerRec,
  type JobRec,
  type MockDb,
  type QuotationRec,
  type UserRec,
} from './model';

export const DEMO_USER = { email: 'demo@angebotpilot.de', password: 'Demo12345!' } as const;
/** Password of all other seeded team members. */
export const DEMO_TEAM_PASSWORD = 'Demo12345!';
/** Public link of a sent quotation (Wallbox, Thomas Wagner): open `#/q/demo-public-token-0000000000000000`. */
export const DEMO_PUBLIC_TOKEN = 'demo-public-token-0000000000000000';
/** Public link of an accepted quotation (Treppenhausbeleuchtung, Hausverwaltung Sonnenhof). */
export const DEMO_ACCEPTED_TOKEN = 'demo-accepted-token-000000000000000';
/** Invitation token for Elektro Berger GmbH (role Employee): open `#/invite?token=demo-invite`. */
export const DEMO_INVITE_TOKEN = 'demo-invite';

export const DEMO_IDS = {
  userId: '00000000-0000-4000-8000-000000000001',
  adminUserId: '00000000-0000-4000-8000-000000000002',
  employeeUserId: '00000000-0000-4000-8000-000000000003',
  deactivatedUserId: '00000000-0000-4000-8000-000000000004',
  secondOwnerUserId: '00000000-0000-4000-8000-000000000005',
  companyId: '00000000-0000-4000-8000-0000000000c1',
  secondCompanyId: '00000000-0000-4000-8000-0000000000c2',
} as const;

export const DEMO_USERS = {
  admin: { email: 'tobias.kraemer@elektro-berger.de', password: DEMO_TEAM_PASSWORD },
  employee: { email: 'aylin.demir@elektro-berger.de', password: DEMO_TEAM_PASSWORD },
} as const;

function li(title: string, quantity: number, unit: string, unitPriceNet: number, taxRatePercent = 19, discountPercent = 0, description: string | null = null): LineItemInput {
  return { title, description, quantity, unit, unitPriceNet, discountPercent, taxRatePercent };
}

const ELEKTRO_TERMS =
  'Es gelten unsere Allgemeinen Geschäftsbedingungen. Mehr- oder Minderleistungen werden nach tatsächlichem Aufwand abgerechnet. '
  + 'Die Arbeiten werden nach DIN VDE 0100 ausgeführt; nach Abschluss erhalten Sie ein Prüfprotokoll.';

/** Empty scenario: one unverified user without company (onboarding flows). */
export function seedEmpty(db: MockDb): void {
  db.users.push({
    id: DEMO_IDS.userId,
    email: DEMO_USER.email,
    password: DEMO_USER.password,
    displayName: 'Lena Berger',
    emailVerified: false,
    createdAt: nowIso(),
  });
}

export function seedDemo(db: MockDb): void {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const now = nowIso();
  let counter = 0x1000;
  const sid = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
  };
  const d = (offset: number) => addDaysIso(today, offset);
  /** Timestamp in the past (clamped to "a few minutes ago"). */
  const at = (offset: number, hour = 9, minute = 0): string => {
    const iso = `${d(offset)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
    return iso > now ? new Date(Date.now() - 5 * 60_000).toISOString() : iso;
  };
  const rv = () => nextRowVersion(db);

  // ---------- users ----------
  const user = (id: string, email: string, displayName: string, password: string, createdOffset: number): UserRec => {
    const u: UserRec = { id, email, password, displayName, emailVerified: true, createdAt: at(createdOffset, 8) };
    db.users.push(u);
    return u;
  };
  const lena = user(DEMO_IDS.userId, DEMO_USER.email, 'Lena Berger', DEMO_USER.password, -200);
  const tobias = user(DEMO_IDS.adminUserId, DEMO_USERS.admin.email, 'Tobias Krämer', DEMO_TEAM_PASSWORD, -190);
  const aylin = user(DEMO_IDS.employeeUserId, DEMO_USERS.employee.email, 'Aylin Demir', DEMO_TEAM_PASSWORD, -120);
  const jonas = user(DEMO_IDS.deactivatedUserId, 'jonas.weber@elektro-berger.de', 'Jonas Weber', DEMO_TEAM_PASSWORD, -180);
  const markus = user(DEMO_IDS.secondOwnerUserId, 'markus@berger-haustechnik.de', 'Markus Berger', DEMO_TEAM_PASSWORD, -150);

  // ---------- companies ----------
  const elektro: CompanyRec = {
    id: DEMO_IDS.companyId,
    name: 'Elektro Berger GmbH',
    addressLine1: 'Landsberger Straße 214',
    addressLine2: null,
    postalCode: '80687',
    city: 'München',
    country: 'DE',
    email: 'info@elektro-berger.de',
    phone: '+49 89 5467 2310',
    website: 'https://www.elektro-berger.de',
    vatId: 'DE318745621',
    taxNumber: '143/512/40877',
    brandColor: '#2F45D8',
    timeZone: 'Europe/Berlin',
    language: 'de',
    isDemo: false,
    rowVersion: rv(),
    createdAt: at(-200, 8),
    updatedAt: at(-30, 16),
    logo: null,
    settings: defaultSettings('Elektro Berger GmbH', {
      quotationPrefix: 'AN',
      jobPrefix: 'AU',
      defaultValidityDays: 30,
      defaultTaxMode: 'Standard',
      defaultIntroText:
        'Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage und das angenehme Gespräch vor Ort. '
        + 'Gerne unterbreiten wir Ihnen für die besprochenen Elektroarbeiten folgendes Angebot:',
      defaultClosingText:
        'Die Ausführung ist in der Regel innerhalb von zwei bis drei Wochen nach Auftragserteilung möglich. '
        + 'Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.\n\nMit freundlichen Grüßen\nLena Berger',
      defaultTerms: ELEKTRO_TERMS,
      paymentTerms: 'Zahlbar innerhalb von 14 Tagen nach Rechnungsstellung ohne Abzug. Bei Aufträgen über 5.000 € netto 30 % Abschlag bei Auftragserteilung.',
      showBankDetails: true,
      bankAccountHolder: 'Elektro Berger GmbH',
      iban: 'DE89 7015 0000 1004 5678 90',
      bic: 'SSKMDEMMXXX',
      bankName: 'Stadtsparkasse München',
      emailSignature: 'Mit freundlichen Grüßen\nLena Berger\nElektro Berger GmbH · Landsberger Straße 214 · 80687 München\nTel. +49 89 5467 2310',
      replyToEmail: 'angebote@elektro-berger.de',
      firstReminderEnabled: true,
      firstReminderAfterDays: 7,
      secondReminderEnabled: true,
      secondReminderAfterDays: 14,
      expiryReminderEnabled: true,
      expiryReminderDaysBefore: 3,
      attachPdfToEmails: true,
      notifyOnCustomerDecision: true,
    }),
  };
  const haustechnik: CompanyRec = {
    id: DEMO_IDS.secondCompanyId,
    name: 'Berger Haustechnik',
    addressLine1: 'Bahnhofstraße 7',
    addressLine2: null,
    postalCode: '82256',
    city: 'Fürstenfeldbruck',
    country: 'DE',
    email: 'kontakt@berger-haustechnik.de',
    phone: '+49 8141 22 90 40',
    website: null,
    vatId: null,
    taxNumber: '117/245/30012',
    brandColor: '#0F766E',
    timeZone: 'Europe/Berlin',
    language: 'de',
    isDemo: false,
    rowVersion: rv(),
    createdAt: at(-150, 8),
    updatedAt: at(-150, 8),
    logo: null,
    settings: defaultSettings('Berger Haustechnik', { quotationPrefix: 'AN', jobPrefix: 'AU', defaultValidityDays: 21 }),
  };
  db.companies.push(elektro, haustechnik);

  // ---------- memberships, invitation ----------
  const member = (companyId: string, userId: string, role: MembershipRole, joinedOffset: number, status: 'Active' | 'Deactivated' = 'Active') =>
    db.memberships.push({ id: sid(), companyId, userId, role, status, joinedAt: at(joinedOffset, 8, 30) });
  member(elektro.id, lena.id, 'Owner', -200);
  member(elektro.id, tobias.id, 'Admin', -190);
  member(elektro.id, aylin.id, 'Employee', -120);
  member(elektro.id, jonas.id, 'Employee', -180, 'Deactivated');
  member(haustechnik.id, markus.id, 'Owner', -150);
  member(haustechnik.id, lena.id, 'Admin', -149);

  db.invitations.push({
    id: sid(),
    companyId: elektro.id,
    email: 'lukas.hartmann@gmx.de',
    role: 'Employee',
    token: DEMO_INVITE_TOKEN,
    createdAt: at(-2, 14),
    expiresAt: `${d(5)}T14:00:00.000Z`,
    status: 'Pending',
  });

  // ---------- tax rates, subscriptions ----------
  for (const company of [elektro, haustechnik]) {
    db.taxRates.push(
      { id: sid(), companyId: company.id, name: 'Regelsteuersatz 19 %', ratePercent: 19, isDefault: true, isArchived: false },
      { id: sid(), companyId: company.id, name: 'Ermäßigt 7 %', ratePercent: 7, isDefault: false, isArchived: false },
      { id: sid(), companyId: company.id, name: 'Steuerfrei 0 %', ratePercent: 0, isDefault: false, isArchived: false },
    );
  }
  db.subscriptions.push(
    {
      companyId: elektro.id,
      plan: 'Trial',
      status: 'Trialing',
      trialEndsAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    {
      companyId: haustechnik.id,
      plan: 'Starter',
      status: 'Active',
      trialEndsAt: null,
      currentPeriodEnd: `${d(20)}T00:00:00.000Z`,
      cancelAtPeriodEnd: false,
    },
  );

  // ---------- customers ----------
  type CustomerSeed = Partial<CustomerRec> & Pick<CustomerRec, 'type'> & { created: number };
  const customer = (company: CompanyRec, seed: CustomerSeed): CustomerRec => {
    const { created, ...rest } = seed;
    const c: CustomerRec = {
      id: sid(),
      companyId: company.id,
      companyName: null,
      salutation: null,
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      billingStreet: null,
      billingPostalCode: null,
      billingCity: null,
      billingCountry: 'DE',
      hasServiceAddress: false,
      serviceStreet: null,
      servicePostalCode: null,
      serviceCity: null,
      serviceCountry: null,
      vatId: null,
      notes: null,
      followUpOptOut: false,
      isArchived: false,
      isAnonymized: false,
      createdAt: at(created, 10),
      updatedAt: at(created, 10),
      rowVersion: rv(),
      ...rest,
    };
    db.customers.push(c);
    addAudit(db, company.id, lena.id, 'customer.created', 'Customer', c.id, c.companyName ?? [c.firstName, c.lastName].filter(Boolean).join(' '), c.createdAt);
    return c;
  };

  const huber = customer(elektro, {
    type: 'Business', companyName: 'Bäckerei Huber KG', salutation: 'Herr', firstName: 'Josef', lastName: 'Huber',
    email: 'josef.huber@baeckerei-huber.de', phone: '+49 8161 48 21 0', billingStreet: 'Hauptstraße 12', billingPostalCode: '85354',
    billingCity: 'Freising', vatId: 'DE129876543', notes: 'Backstube nur vor 5 Uhr oder nach 14 Uhr zugänglich.', created: -170,
  });
  const schneider = customer(elektro, {
    type: 'Business', companyName: 'Praxis Dr. Schneider', salutation: 'Frau Dr.', firstName: 'Claudia', lastName: 'Schneider',
    email: 'praxis@dr-schneider-muenchen.de', phone: '+49 89 33 44 120', billingStreet: 'Leopoldstraße 88', billingPostalCode: '80802',
    billingCity: 'München', created: -160,
  });
  const sonnenhof = customer(elektro, {
    type: 'Business', companyName: 'Hausverwaltung Sonnenhof GmbH', salutation: 'Herr', firstName: 'Markus', lastName: 'Lehmann',
    email: 'm.lehmann@sonnenhof-hv.de', phone: '+49 89 45 67 89 0', billingStreet: 'Rosenheimer Straße 145', billingPostalCode: '81671',
    billingCity: 'München', hasServiceAddress: true, serviceStreet: 'Sonnenhofweg 3–7', servicePostalCode: '81825', serviceCity: 'München',
    serviceCountry: 'DE', vatId: 'DE281234567', notes: 'Verwaltet 14 Objekte im Münchner Osten. Rechnungen bitte mit Objektnummer.', created: -150,
  });
  const yilmaz = customer(elektro, {
    type: 'Private', firstName: 'Familie', lastName: 'Yilmaz', email: 'murat.yilmaz@web.de', phone: '+49 171 234 56 78',
    billingStreet: 'Am Mühlbach 9', billingPostalCode: '85221', billingCity: 'Dachau', created: -60,
  });
  const wagner = customer(elektro, {
    type: 'Private', salutation: 'Herr', firstName: 'Thomas', lastName: 'Wagner', email: 'thomas.wagner@t-online.de',
    phone: '+49 160 987 65 43', billingStreet: 'Lindenweg 4', billingPostalCode: '86157', billingCity: 'Augsburg', created: -45,
  });
  const gasthof = customer(elektro, {
    type: 'Business', companyName: 'Gasthof Zur Post', salutation: 'Herr', firstName: 'Franz', lastName: 'Obermaier',
    email: 'info@gasthof-zurpost-weilheim.de', phone: '+49 881 92 31 0', billingStreet: 'Marienplatz 3', billingPostalCode: '82362',
    billingCity: 'Weilheim i. OB', followUpOptOut: true, notes: 'Möchte keine automatischen Erinnerungen – lieber anrufen.', created: -40,
  });
  const kreitmair = customer(elektro, {
    type: 'Business', companyName: 'Autohaus Kreitmair GmbH', salutation: 'Frau', firstName: 'Stefanie', lastName: 'Kreitmair',
    email: 'service@autohaus-kreitmair.de', phone: '+49 841 88 12 0', billingStreet: 'Manchinger Straße 101', billingPostalCode: '85053',
    billingCity: 'Ingolstadt', vatId: 'DE245566778', created: -35,
  });
  const kita = customer(elektro, {
    type: 'Business', companyName: 'Kita Sonnenschein e. V.', salutation: 'Frau', firstName: 'Anja', lastName: 'Brandl',
    email: 'leitung@kita-sonnenschein-dachau.de', phone: '+49 8131 77 45 2', billingStreet: 'Schleißheimer Straße 40', billingPostalCode: '85221',
    billingCity: 'Dachau', created: -30,
  });
  const hofmann = customer(elektro, {
    type: 'Private', salutation: 'Frau', firstName: 'Sabine', lastName: 'Hofmann', email: 'sabine.hofmann@gmail.com',
    phone: '+49 151 112 23 34', billingStreet: 'Seestraße 21', billingPostalCode: '82319', billingCity: 'Starnberg', created: -14,
  });
  const brauerei = customer(elektro, {
    type: 'Business', companyName: 'Brauerei Maierhofer GmbH & Co. KG', salutation: 'Herr', firstName: 'Georg', lastName: 'Maierhofer',
    email: 'technik@brauerei-maierhofer.de', phone: '+49 8122 95 60 0', billingStreet: 'Brauhausgasse 2', billingPostalCode: '85435',
    billingCity: 'Erding', vatId: 'DE131313131', created: -12,
  });
  const lang = customer(elektro, {
    type: 'Business', companyName: 'Ingenieurbüro Lang', salutation: 'Herr', firstName: 'Christian', lastName: 'Lang',
    email: 'c.lang@ib-lang.de', phone: '+49 941 56 78 90', billingStreet: 'Prüfeninger Straße 55', billingPostalCode: '93049',
    billingCity: 'Regensburg', created: -80,
  });
  const fischer = customer(elektro, {
    type: 'Private', salutation: 'Familie', firstName: 'Petra und Michael', lastName: 'Fischer', email: 'fischer.rosenheim@gmx.de',
    phone: '+49 8031 40 12 77', billingStreet: 'Kufsteiner Straße 18', billingPostalCode: '83022', billingCity: 'Rosenheim', created: -55,
  });
  const fitness = customer(elektro, {
    type: 'Business', companyName: 'Fitness Loft Pasing GmbH', salutation: 'Herr', firstName: 'Daniel', lastName: 'Kurz',
    email: 'daniel.kurz@fitnessloft-pasing.de', phone: '+49 89 820 77 66', billingStreet: 'Bäckerstraße 6', billingPostalCode: '81241',
    billingCity: 'München', created: -25,
  });
  const bauer = customer(elektro, {
    type: 'Private', salutation: 'Herr', firstName: 'Klaus', lastName: 'Bauer', email: 'klaus.bauer@freenet.de',
    phone: '+49 871 23 45 6', billingStreet: 'Altstadt 88', billingPostalCode: '84028', billingCity: 'Landshut', isArchived: true,
    notes: 'Umgezogen nach Österreich – archiviert.', created: -190,
  });
  const isartal = customer(haustechnik, {
    type: 'Business', companyName: 'Wohnbau Isartal GmbH', salutation: 'Herr', firstName: 'Peter', lastName: 'Gruber',
    email: 'p.gruber@wohnbau-isartal.de', billingStreet: 'Isarstraße 30', billingPostalCode: '82049', billingCity: 'Pullach', created: -100,
  });
  customer(haustechnik, {
    type: 'Private', salutation: 'Frau', firstName: 'Monika', lastName: 'Seidl', email: 'monika.seidl@web.de',
    billingStreet: 'Kirchweg 2', billingPostalCode: '82275', billingCity: 'Emmering', created: -90,
  });

  // ---------- quotations ----------
  interface QuotationSeed {
    company?: CompanyRec;
    customer: CustomerRec;
    title: string;
    status: QuotationStatus;
    issue: number;
    valid?: number;
    lines: LineItemInput[];
    sent?: number;
    manual?: boolean;
    followUps?: boolean;
    decided?: number;
    by?: 'User' | 'Customer';
    decisionName?: string;
    note?: string;
    cancelled?: number;
    reason?: string;
    token?: string;
    opened?: number;
    createdBy?: UserRec;
    internalNotes?: string;
    previous?: QuotationRec;
    revision?: number;
  }

  const quotation = (s: QuotationSeed): QuotationRec => {
    const company = s.company ?? elektro;
    const settings = company.settings;
    const creator = s.createdBy ?? lena;
    const issueDate = d(s.issue);
    const validUntil = addDaysIso(issueDate, s.valid ?? settings.defaultValidityDays);
    const createdAt = at(s.issue, 8, 30);
    const root = s.previous ? (s.previous.rootQuotationId ? db.quotations.find((x) => x.id === s.previous?.rootQuotationId) : s.previous) : undefined;
    const number = root && s.revision
      ? `${root.number}-R${s.revision}`
      : nextNumber(db, company.id, 'quotation', settings.quotationPrefix, Number(issueDate.slice(0, 4)) || year);
    const q: QuotationRec = {
      id: sid(),
      companyId: company.id,
      customerId: s.customer.id,
      number,
      title: s.title,
      status: s.status,
      recipientName: '',
      recipientContact: null,
      recipientAddress: null,
      recipientEmail: null,
      recipientVatId: null,
      issueDate,
      validUntil,
      taxMode: 'Standard',
      introText: settings.defaultIntroText,
      closingText: settings.defaultClosingText,
      terms: settings.defaultTerms,
      paymentTerms: settings.paymentTerms,
      internalNotes: s.internalNotes ?? null,
      currency: 'EUR',
      lineItems: buildLineItems(s.lines),
      revisionNumber: s.revision ?? 0,
      rootQuotationId: root ? root.id : null,
      previousRevisionId: s.previous ? s.previous.id : null,
      sourceTemplateId: null,
      createdByUserId: creator.id,
      createdAt,
      updatedAt: createdAt,
      sentAt: null,
      sentByUserId: null,
      decidedAt: null,
      decidedByActor: null,
      decidedByUserId: null,
      decisionName: null,
      decisionNote: null,
      expiredAt: null,
      cancelledAt: null,
      cancellationReason: null,
      publicToken: null,
      publicLinkExpiresAt: null,
      publicLinkLastOpenedAt: null,
      revokedTokens: [],
      deletedAt: null,
      rowVersion: rv(),
    };
    snapshotRecipient(q, s.customer);
    db.quotations.push(q);
    let last = createdAt;
    const touch = (iso: string) => {
      if (iso > last) last = iso;
    };

    addEvent(db, q, 'Created', 'User', creator.id, s.previous ? `Revision ${s.revision ?? 1} von ${s.previous.number}` : null, createdAt);
    addAudit(db, company.id, creator.id, s.previous ? 'quotation.revised' : 'quotation.created', 'Quotation', q.id,
      s.previous ? `${s.previous.number} → ${q.number}` : q.number, createdAt);
    if (s.previous) addEvent(db, s.previous, 'RevisionCreated', 'User', creator.id, q.number, createdAt);

    // End of the "open" phase: reminders due before it were processed, later ones get cancelled.
    const decidedAt = s.decided !== undefined ? at(s.decided, 11, 5) : null;
    const cancelledAt = s.cancelled !== undefined ? at(s.cancelled, 15, 20) : null;
    const expiredAt = s.status === 'Expired' ? at(Math.min(s.issue + (s.valid ?? settings.defaultValidityDays) + 1, 0), 2, 0) : null;
    const cutoff = decidedAt ?? cancelledAt ?? expiredAt ?? now;

    if (s.sent !== undefined) {
      const sentAt = at(s.sent, 10, 15);
      q.sentAt = sentAt;
      q.sentByUserId = creator.id;
      touch(sentAt);
      addEvent(db, q, 'PdfGenerated', 'System', null, null, sentAt);
      if (s.token) {
        q.publicToken = s.token;
        q.publicLinkExpiresAt = `${addDaysIso(validUntil, 30)}T23:59:59.000Z`;
        addEvent(db, q, 'PublicLinkCreated', 'User', creator.id, null, sentAt);
      }
      if (s.manual) {
        addEvent(db, q, 'MarkedAsSent', 'User', creator.id, 'Ohne E-Mail durch den Anbieter übermittelt', sentAt);
        addAudit(db, company.id, creator.id, 'quotation.marked_sent', 'Quotation', q.id, q.number, sentAt);
      } else {
        const to = q.recipientEmail ?? 'kunde@example.de';
        addEvent(db, q, 'Sent', 'User', creator.id, `An ${to}`, sentAt);
        addAudit(db, company.id, creator.id, 'quotation.sent', 'Quotation', q.id, q.number, sentAt);
        const handedOff = new Date(new Date(sentAt).getTime() + 40_000).toISOString();
        db.deliveries.push({
          id: sid(), companyId: company.id, quotationId: q.id, kind: 'QuotationSent', toAddress: to,
          subject: `Ihr Angebot ${q.number} von ${company.name}`, status: 'HandedOff', attempts: 1, createdAt: sentAt,
          handedOffAt: handedOff, nextAttemptAt: null, lastError: null,
        });
        addEvent(db, q, 'EmailHandedOff', 'System', null, `An ${to}`, handedOff);
        if (s.followUps !== false) {
          for (const plan of planFollowUps(settings, sentAt, validUntil)) {
            if (s.customer.followUpOptOut) {
              db.followUps.push({ id: sid(), companyId: company.id, quotationId: q.id, kind: plan.kind, dueAt: plan.dueAt, status: 'Cancelled', statusReason: 'Kunde hat Erinnerungen abbestellt', processedAt: sentAt });
            } else if (plan.dueAt <= cutoff) {
              db.followUps.push({ id: sid(), companyId: company.id, quotationId: q.id, kind: plan.kind, dueAt: plan.dueAt, status: 'Queued', statusReason: null, processedAt: plan.dueAt });
              const subject = plan.kind === 'ExpiryReminder'
                ? `Erinnerung: Ihr Angebot ${q.number} ist nur noch kurz gültig`
                : `Erinnerung an unser Angebot ${q.number}`;
              db.deliveries.push({
                id: sid(), companyId: company.id, quotationId: q.id, kind: plan.kind, toAddress: to, subject, status: 'HandedOff', attempts: 1,
                createdAt: plan.dueAt, handedOffAt: new Date(new Date(plan.dueAt).getTime() + 30_000).toISOString(), nextAttemptAt: null, lastError: null,
              });
              addEvent(db, q, 'ReminderQueued', 'System', null, plan.kind === 'FirstReminder' ? '1. Erinnerung' : plan.kind === 'SecondReminder' ? '2. Erinnerung' : 'Ablauf-Erinnerung', plan.dueAt);
              touch(plan.dueAt);
            } else {
              db.followUps.push({ id: sid(), companyId: company.id, quotationId: q.id, kind: plan.kind, dueAt: plan.dueAt, status: 'Scheduled', statusReason: null, processedAt: null });
            }
          }
        }
      }
    }

    if (s.opened !== undefined) {
      const openedAt = at(s.opened, 18, 40);
      q.publicLinkLastOpenedAt = openedAt;
      addEvent(db, q, 'PublicLinkOpened', 'Customer', null, null, openedAt);
      touch(openedAt);
    }

    if (decidedAt && (s.status === 'Accepted' || s.status === 'Rejected')) {
      const accepted = s.status === 'Accepted';
      const byCustomer = s.by === 'Customer';
      q.decidedAt = decidedAt;
      q.decidedByActor = byCustomer ? 'Customer' : 'User';
      q.decidedByUserId = byCustomer ? null : creator.id;
      q.decisionName = byCustomer ? (s.decisionName ?? null) : null;
      q.decisionNote = s.note ?? null;
      touch(decidedAt);
      addEvent(db, q, accepted ? 'Accepted' : 'Rejected', byCustomer ? 'Customer' : 'User', byCustomer ? null : creator.id,
        byCustomer ? `Über den Kundenlink${s.decisionName ? ` von ${s.decisionName}` : ''}` : `Vom Anbieter erfasst${s.note ? `: ${s.note}` : ''}`, decidedAt);
      const reason = accepted ? 'Angebot angenommen' : 'Angebot abgelehnt';
      if (cancelScheduledFollowUps(db, q.id, reason, decidedAt) > 0) {
        addEvent(db, q, 'FollowUpsCancelled', byCustomer ? 'System' : 'User', byCustomer ? null : creator.id, reason, decidedAt);
      }
      addAudit(db, company.id, byCustomer ? null : creator.id,
        byCustomer ? (accepted ? 'quotation.accepted_by_customer' : 'quotation.rejected_by_customer') : (accepted ? 'quotation.accepted' : 'quotation.rejected'),
        'Quotation', q.id, q.number, decidedAt);
    }

    if (cancelledAt && s.status === 'Cancelled') {
      q.cancelledAt = cancelledAt;
      q.cancellationReason = s.reason ?? null;
      touch(cancelledAt);
      addEvent(db, q, 'Cancelled', 'User', creator.id, s.reason ?? null, cancelledAt);
      if (cancelScheduledFollowUps(db, q.id, 'Angebot storniert', cancelledAt) > 0) {
        addEvent(db, q, 'FollowUpsCancelled', 'User', creator.id, 'Angebot storniert', cancelledAt);
      }
      if (q.publicToken) {
        q.revokedTokens.push(q.publicToken);
        q.publicToken = null;
      }
      addAudit(db, company.id, creator.id, 'quotation.cancelled', 'Quotation', q.id, q.number, cancelledAt);
    }

    if (expiredAt) {
      q.expiredAt = expiredAt;
      touch(expiredAt);
      addEvent(db, q, 'Expired', 'System', null, null, expiredAt);
      cancelScheduledFollowUps(db, q.id, 'Angebot abgelaufen', expiredAt);
      addAudit(db, company.id, null, 'quotation.expired', 'Quotation', q.id, q.number, expiredAt);
    }

    q.updatedAt = last;
    return q;
  };

  const anfahrt = li('Anfahrtspauschale', 1, 'pauschal', 45, 19, 0, 'Großraum München, inkl. Werkzeug- und Messgerätebereitstellung');
  const entsorgung = li('Entsorgung Altmaterial', 1, 'pauschal', 60);
  const doku = li('Dokumentation und Prüfprotokoll nach DIN VDE 0100-600', 1, 'pauschal', 85);

  const q1 = quotation({
    customer: huber, title: 'Elektroinstallation Backstube – neue Ofenzuleitungen', status: 'Accepted', issue: -62, valid: 30, sent: -62,
    decided: -55, by: 'Customer', decisionName: 'Josef Huber', opened: -58,
    lines: [
      li('Kabelverlegung NYY-J 5x6 Ofenzuleitung', 38, 'm', 16.9),
      li('CEE-Steckdose 32 A 5-polig inkl. Montage', 3, 'Stk.', 96),
      li('LS-Schalter C32 3-polig', 3, 'Stk.', 42.5),
      li('Arbeitszeit Elektroniker', 14, 'Std.', 62),
      anfahrt,
      doku,
    ],
  });
  const q2 = quotation({
    customer: schneider, title: 'LED-Umrüstung Beleuchtung Wartebereich', status: 'Accepted', issue: -41, valid: 30, sent: -41,
    decided: -36, by: 'User', note: 'Telefonisch durch Frau Dr. Schneider bestätigt', createdBy: tobias,
    lines: [
      li('LED-Panel 62x62 cm, 4000 K, UGR < 19', 12, 'Stk.', 119, 19, 10),
      li('Demontage und Entsorgung Rasterleuchten', 12, 'Stk.', 18),
      li('Arbeitszeit Elektroniker', 9, 'Std.', 62),
      anfahrt,
    ],
  });
  const q3 = quotation({
    customer: sonnenhof, title: 'Treppenhausbeleuchtung mit Bewegungsmeldern Haus A', status: 'Accepted', issue: -25, valid: 30, sent: -25,
    decided: -18, by: 'Customer', decisionName: 'Markus Lehmann', token: DEMO_ACCEPTED_TOKEN, opened: -19,
    lines: [
      li('LED-Wandleuchte Treppenhaus IP44 mit Sensor', 16, 'Stk.', 84.5),
      li('Bewegungsmelder Decke 360°', 8, 'Stk.', 74),
      li('Kabelverlegung NYM-J 3x1,5', 120, 'm', 6.8),
      li('Arbeitszeit Elektroniker', 18, 'Std.', 62),
      li('Hubarbeitsbühne Tagesmiete', 1, 'Tag', 240, 19, 0, 'inkl. An- und Abtransport'),
      anfahrt,
      doku,
    ],
  });
  const zaehlerLines = [
    li('Zählerschrank 3-feldrig nach TAB 2023 inkl. APZ-Feld', 1, 'Stk.', 1890),
    li('Unterverteilung erneuern', 1, 'pauschal', 1450, 19, 0, '4-reihig, inkl. FI/LS-Kombischalter für alle Stromkreise'),
    li('Überspannungsschutz Typ 1+2', 1, 'Stk.', 389),
    li('Arbeitszeit Elektromeister', 6, 'Std.', 78),
    li('Arbeitszeit Elektroniker', 12, 'Std.', 62),
    li('Anmeldung beim Netzbetreiber (SWM)', 1, 'pauschal', 120),
    anfahrt,
    entsorgung,
  ];
  const q4 = quotation({
    customer: yilmaz, title: 'Zählerschrank-Modernisierung Einfamilienhaus', status: 'Rejected', issue: -48, valid: 30, sent: -48,
    decided: -41, by: 'Customer', decisionName: 'Murat Yilmaz', note: 'Leider über unserem Budget. Gibt es eine günstigere Variante?', opened: -45,
    lines: zaehlerLines,
  });
  const q4r1 = quotation({
    customer: yilmaz, title: 'Zählerschrank-Modernisierung Einfamilienhaus', status: 'Expired', issue: -38, valid: 30, sent: -38,
    previous: q4, revision: 1,
    lines: [...zaehlerLines.slice(0, 1), li('Unterverteilung erneuern', 1, 'pauschal', 1290, 19, 5, '3-reihig, FI/LS-Kombischalter'), ...zaehlerLines.slice(3)],
  });
  quotation({
    customer: yilmaz, title: 'Zählerschrank-Modernisierung Einfamilienhaus', status: 'Sent', issue: -4, valid: 30, sent: -4,
    previous: q4r1, revision: 2, internalNotes: 'Variante ohne Überspannungsschutz Typ 1 – Kunde entscheidet bis Monatsende.',
    lines: [
      ...zaehlerLines.slice(0, 1),
      li('Unterverteilung erneuern', 1, 'pauschal', 1290, 19, 5, '3-reihig, FI/LS-Kombischalter'),
      li('Überspannungsschutz Typ 2', 1, 'Stk.', 189),
      ...zaehlerLines.slice(3),
    ],
  });
  const q5 = quotation({
    customer: wagner, title: 'Wallbox-Installation 11 kW in der Garage', status: 'Sent', issue: -10, valid: 14, sent: -10, token: DEMO_PUBLIC_TOKEN,
    opened: -2,
    lines: [
      li('Wallbox 11 kW inkl. Montage', 1, 'Stk.', 1290, 19, 0, 'KfW-förderfähig, mit RFID-Freischaltung'),
      li('Kabelverlegung NYM-J 5x2,5', 24, 'm', 9.4),
      li('FI-Schutzschalter 40 A / 30 mA Typ A EV', 1, 'Stk.', 189),
      li('LS-Schalter B16 3-polig', 1, 'Stk.', 38.5),
      li('Arbeitszeit Elektroniker', 5, 'Std.', 62),
      li('Bedienungsanleitung und Ladekarten-Set (Druckwerk)', 1, 'Stk.', 12, 7),
      anfahrt,
    ],
  });
  const q6 = quotation({
    customer: gasthof, title: 'Küchenstromkreise und FI-Schutzschalter Gaststättenküche', status: 'Sent', issue: -12, valid: 14, sent: -12,
    opened: -9,
    lines: [
      li('FI-Schutzschalter 40 A / 30 mA Typ A', 4, 'Stk.', 89),
      li('Kabelverlegung NYM-J 5x2,5', 65, 'm', 9.4),
      li('Herdanschlussdose', 3, 'Stk.', 24.9),
      li('Arbeitszeit Elektroniker', 11, 'Std.', 62),
      anfahrt,
    ],
  });
  const q7 = quotation({
    customer: kreitmair, title: 'Außenbeleuchtung Verkaufsfläche und Zufahrt', status: 'Sent', issue: -3, valid: 30, sent: -1, createdBy: tobias,
    lines: [
      li('LED-Fluter 150 W, 4000 K, IP66', 10, 'Stk.', 189, 19, 8),
      li('Mastleuchte 5 m inkl. Fundament', 4, 'Stk.', 690),
      li('Erdkabel NYY-J 3x2,5 inkl. Kabelgraben', 140, 'm', 14.5),
      li('Dämmerungsschalter mit Zeitschaltuhr', 1, 'Stk.', 79),
      li('Arbeitszeit Elektroniker', 22, 'Std.', 62),
      anfahrt,
    ],
  });
  const q8 = quotation({
    customer: kita, title: 'E-Check nach DGUV Vorschrift 3', status: 'Sent', issue: -20, valid: 30, sent: -20,
    lines: [
      li('E-Check Prüfung je Stromkreis', 38, 'Stk.', 12.5),
      li('Prüfung ortsveränderlicher Geräte', 64, 'Stk.', 4.9, 19, 15),
      doku,
      anfahrt,
    ],
  });
  quotation({
    customer: hofmann, title: 'Smart-Home-Nachrüstung Wohnzimmer und Küche', status: 'Draft', issue: -1, valid: 30, createdBy: aylin,
    lines: [
      li('Smart-Home-Zentrale inkl. Einrichtung', 1, 'Stk.', 249),
      li('Unterputz-Schaltaktor', 6, 'Stk.', 69),
      li('Rollladenaktor', 4, 'Stk.', 79),
      li('Arbeitszeit Elektroniker', 7, 'Std.', 62),
    ],
  });
  quotation({
    customer: brauerei, title: 'Kraftstromanschluss neue Abfüllanlage', status: 'Draft', issue: 0, valid: 30,
    internalNotes: 'Leistungsdaten der Anlage noch beim Hersteller anfragen.',
    lines: [
      li('Kabelverlegung NYY-J 5x16', 45, 'm', 28.4),
      li('Unterverteilung erneuern', 1, 'pauschal', 2380, 19, 7.5, 'Industrie-UV 400 A, inkl. Lasttrennschalter'),
      li('CEE-Steckdose 63 A', 2, 'Stk.', 168),
      li('Arbeitszeit Elektromeister', 8, 'Std.', 78),
      li('Arbeitszeit Elektroniker', 24, 'Std.', 62),
    ],
  });
  quotation({
    customer: lang, title: 'Netzwerkverkabelung Cat. 7 Büroetage', status: 'Expired', issue: -52, valid: 30, sent: -52,
    lines: [
      li('Installationskabel Cat. 7', 420, 'm', 3.2),
      li('Netzwerkdose Cat. 6A 2-fach', 24, 'Stk.', 48),
      li('Patchpanel 24 Port inkl. Auflegen', 1, 'Stk.', 310),
      li('Arbeitszeit Elektroniker', 26, 'Std.', 62),
    ],
  });
  quotation({
    customer: fischer, title: 'Badsanierung – Elektroarbeiten', status: 'Cancelled', issue: -31, valid: 30, sent: -31, cancelled: -27,
    reason: 'Kunde hat das Projekt auf nächstes Jahr verschoben.',
    lines: [
      li('Steckdose Schuko UP inkl. Montage', 4, 'Stk.', 38),
      li('Spiegelschrank-Anschluss', 1, 'Stk.', 65),
      li('Fußbodenheizung elektrisch 4 m²', 1, 'Stk.', 540),
      li('Arbeitszeit Elektroniker', 6, 'Std.', 62),
    ],
  });
  const q13 = quotation({
    customer: fitness, title: 'Notbeleuchtung und Sicherheitsbeleuchtung Trainingsfläche', status: 'Accepted', issue: -15, valid: 30, sent: -15,
    decided: -8, by: 'Customer', decisionName: 'Daniel Kurz', opened: -9,
    lines: [
      li('Rettungszeichenleuchte LED, Einzelbatterie', 14, 'Stk.', 139),
      li('Sicherheitsleuchte Decke LED', 10, 'Stk.', 118),
      li('Kabelverlegung NYM-J 3x1,5', 160, 'm', 6.8),
      li('Arbeitszeit Elektroniker', 20, 'Std.', 62),
      doku,
    ],
  });
  quotation({
    customer: sonnenhof, title: 'Klingel- und Gegensprechanlage Haus B', status: 'Accepted', issue: -9, valid: 30, sent: -9,
    decided: -2, by: 'Customer', decisionName: 'Markus Lehmann', opened: -3,
    lines: [
      li('Video-Gegensprechanlage Außenstation 12 Teilnehmer', 1, 'Stk.', 1180),
      li('Innenstation mit 7"-Display', 12, 'Stk.', 189, 19, 5),
      li('Kabelverlegung J-Y(St)Y 2x2x0,8', 180, 'm', 2.9),
      li('Arbeitszeit Elektroniker', 16, 'Std.', 62),
      anfahrt,
    ],
  });
  quotation({
    customer: schneider, title: 'Netzwerkschrank und USV Empfang', status: 'Rejected', issue: -22, valid: 30, sent: -22, manual: true,
    decided: -14, by: 'User', note: 'Praxis hat sich für den IT-Dienstleister entschieden.',
    lines: [
      li('Netzwerkschrank 19" 12 HE', 1, 'Stk.', 420),
      li('USV 1500 VA Online', 1, 'Stk.', 690),
      li('Arbeitszeit Elektroniker', 6, 'Std.', 62),
    ],
  });
  quotation({
    customer: huber, title: 'Photovoltaik-Vorbereitung Dach und Zählerplatz', status: 'Sent', issue: -6, valid: 30, sent: -6, opened: -5,
    lines: [
      li('Leerrohr M32 Dach bis Zählerplatz', 28, 'm', 7.9),
      li('Überspannungsschutz Typ 1+2', 1, 'Stk.', 389),
      li('Zählerplatz für Zweirichtungszähler vorbereiten', 1, 'pauschal', 340),
      li('Arbeitszeit Elektroniker', 6, 'Std.', 62),
    ],
  });
  quotation({
    customer: wagner, title: 'Gartenbeleuchtung und Außensteckdosen', status: 'Draft', issue: -2, valid: 30,
    lines: [
      li('Erdkabel NYY-J 3x1,5 inkl. Kabelgraben', 35, 'm', 12.9),
      li('Pollerleuchte LED 60 cm', 6, 'Stk.', 98),
      li('Außensteckdose IP44 mit Klappdeckel', 2, 'Stk.', 46),
      li('Arbeitszeit Elektroniker', 8, 'Std.', 62),
    ],
  });
  quotation({
    customer: bauer, title: 'Elektroprüfung Mietwohnung', status: 'Expired', issue: -120, valid: 30, sent: -120,
    lines: [li('E-Check Prüfung je Stromkreis', 12, 'Stk.', 12.5), doku, anfahrt],
  });
  quotation({
    company: haustechnik, customer: isartal, title: 'Heizungsverteilung Neubau – Elektroanschlüsse', status: 'Draft', issue: -3, valid: 21,
    createdBy: markus,
    lines: [li('Anschluss Wärmepumpe inkl. Zuleitung', 1, 'pauschal', 860), li('Arbeitszeit Monteur', 6, 'Std.', 58)],
  });

  // Delivery problems on two quotations.
  const kitaDelivery = db.deliveries.find((x) => x.quotationId === q8.id && x.kind === 'QuotationSent');
  if (kitaDelivery) {
    kitaDelivery.status = 'Failed';
    kitaDelivery.attempts = 5;
    kitaDelivery.handedOffAt = null;
    kitaDelivery.lastError = '550 5.1.1 <leitung@kita-sonnenschein-dachau.de>: Recipient address rejected: Mailbox unavailable';
    const handed = db.events.find((x) => x.quotationId === q8.id && x.type === 'EmailHandedOff');
    if (handed) {
      handed.type = 'EmailFailed';
      handed.details = 'Zustellung endgültig fehlgeschlagen (Postfach nicht erreichbar)';
    }
    for (const f of db.followUps.filter((x) => x.quotationId === q8.id)) {
      if (f.status === 'Queued') {
        f.status = 'Skipped';
        f.statusReason = 'Vorherige E-Mail konnte nicht zugestellt werden';
      }
    }
    for (const r of db.deliveries.filter((x) => x.quotationId === q8.id && x.kind !== 'QuotationSent')) {
      r.status = 'Cancelled';
      r.handedOffAt = null;
      r.lastError = 'Vorherige E-Mail konnte nicht zugestellt werden';
    }
    db.events = db.events.filter((x) => !(x.quotationId === q8.id && x.type === 'ReminderQueued'));
  }
  const kreitmairDelivery = db.deliveries.find((x) => x.quotationId === q7.id && x.kind === 'QuotationSent');
  if (kreitmairDelivery) {
    kreitmairDelivery.status = 'RetryScheduled';
    kreitmairDelivery.attempts = 2;
    kreitmairDelivery.handedOffAt = null;
    kreitmairDelivery.nextAttemptAt = new Date(Date.now() + 12 * 60_000).toISOString();
    kreitmairDelivery.lastError = '421 4.7.0 Temporary server error. Please try again later.';
    db.events = db.events.filter((x) => !(x.quotationId === q7.id && x.type === 'EmailHandedOff'));
  }

  // ---------- jobs ----------
  const job = (q: QuotationRec, status: JobRec['status'], opts: { assignee?: UserRec; planned?: number; due?: number; created: number; started?: number; completed?: number; notes?: string }) => {
    const createdAt = at(opts.created, 13, 10);
    const j: JobRec = {
      id: sid(),
      companyId: q.companyId,
      number: nextNumber(db, q.companyId, 'job', elektro.settings.jobPrefix, year),
      title: q.title,
      description: `Ausführung gemäß Angebot ${q.number}.`,
      status,
      customerId: q.customerId,
      quotationId: q.id,
      plannedStartDate: opts.planned !== undefined ? d(opts.planned) : null,
      dueDate: opts.due !== undefined ? d(opts.due) : null,
      assignedUserId: opts.assignee?.id ?? null,
      notes: opts.notes ?? null,
      createdByUserId: lena.id,
      createdAt,
      updatedAt: createdAt,
      startedAt: opts.started !== undefined ? at(opts.started, 7, 30) : null,
      completedAt: opts.completed !== undefined ? at(opts.completed, 16, 45) : null,
      cancelledAt: null,
      rowVersion: rv(),
    };
    j.updatedAt = j.completedAt ?? j.startedAt ?? createdAt;
    db.jobs.push(j);
    addEvent(db, q, 'ConvertedToJob', 'User', lena.id, j.number, createdAt);
    addAudit(db, q.companyId, lena.id, 'job.created', 'Job', j.id, `${j.number} aus ${q.number}`, createdAt);
    if (status !== 'Open') addAudit(db, q.companyId, opts.assignee?.id ?? lena.id, 'job.status_changed', 'Job', j.id, `${j.number}: ${status === 'Completed' ? 'Abgeschlossen' : 'In Arbeit'}`, j.updatedAt);
    return j;
  };
  job(q1, 'Completed', { assignee: tobias, planned: -48, due: -40, created: -54, started: -48, completed: -42, notes: 'Abnahme durch Herrn Huber erfolgt.' });
  const j2 = job(q2, 'InProgress', { assignee: aylin, planned: -3, due: 4, created: -35, started: -3, notes: 'Material ist geliefert (Lager Regal 4).' });
  job(q3, 'Open', { assignee: tobias, planned: 6, due: 14, created: -17, notes: 'Schlüssel bei Hausmeister Herrn Pichler abholen (Tel. 0170 5566778).' });
  const j4 = job(q13, 'Open', { planned: 10, due: 20, created: -7 });

  // ---------- templates ----------
  const template = (name: string, description: string, lines: TemplateLineItemInput[], updated: number) => {
    db.templates.push({
      id: sid(),
      companyId: elektro.id,
      name,
      description,
      introText: elektro.settings.defaultIntroText,
      closingText: elektro.settings.defaultClosingText,
      terms: elektro.settings.defaultTerms,
      taxMode: 'Standard',
      lineItems: buildTemplateLineItems(lines),
      createdAt: at(updated - 20, 9),
      updatedAt: at(updated, 9),
    });
    addAudit(db, elektro.id, lena.id, 'template.created', 'Template', null, name, at(updated - 20, 9));
  };
  template('Zählerschrank-Modernisierung', 'Kompletter Zählerschrank-Tausch nach TAB inkl. Unterverteilung und Netzbetreiber-Anmeldung', zaehlerLines, -70);
  template('E-Check Gewerbe', 'Wiederkehrende Prüfung nach DGUV V3 für Gewerbekunden (Preise je Stromkreis/Gerät)', [
    { title: 'E-Check Prüfung je Stromkreis', description: null, quantity: 20, unit: 'Stk.', unitPriceNet: 12.5, discountPercent: 0, taxRatePercent: 19 },
    { title: 'Prüfung ortsveränderlicher Geräte', description: null, quantity: 40, unit: 'Stk.', unitPriceNet: 4.9, discountPercent: 0, taxRatePercent: null },
    { title: 'Dokumentation und Prüfprotokoll', description: 'inkl. Prüfplaketten', quantity: 1, unit: 'pauschal', unitPriceNet: 85, discountPercent: 0, taxRatePercent: 19 },
    { title: 'Anfahrtspauschale', description: null, quantity: 1, unit: 'pauschal', unitPriceNet: 45, discountPercent: 0, taxRatePercent: 19 },
  ], -15);

  // ---------- notifications (for Lena) ----------
  const notify = (type: string, title: string, body: string | null, entityType: string | null, entityId: string | null, offset: number, hour: number, read: boolean) => {
    const createdAt = at(offset, hour, 12);
    db.notifications.push({
      id: sid(), companyId: elektro.id, userId: lena.id, type, title, body, entityType, entityId, createdAt, readAt: read ? at(offset, hour + 1) : null,
    });
  };
  const sonnenhofB = db.quotations.find((x) => x.title === 'Klingel- und Gegensprechanlage Haus B');
  notify('quotation.accepted', `Angebot ${sonnenhofB?.number ?? ''} wurde angenommen`, 'Hausverwaltung Sonnenhof GmbH hat das Angebot „Klingel- und Gegensprechanlage Haus B“ angenommen.', 'Quotation', sonnenhofB?.id ?? null, -2, 11, false);
  notify('email.failed', 'E-Mail konnte nicht zugestellt werden', `Das Angebot ${q8.number} an Kita Sonnenschein e. V. wurde vom Empfängerserver abgelehnt. Bitte prüfen Sie die E-Mail-Adresse.`, 'Quotation', q8.id, -19, 9, false);
  notify('quotation.opened', `Angebot ${q5.number} wurde geöffnet`, 'Thomas Wagner hat Ihr Angebot „Wallbox-Installation 11 kW in der Garage“ angesehen.', 'Quotation', q5.id, -2, 18, false);
  notify('quotation.expiring', `Angebot ${q6.number} läuft bald ab`, 'Das Angebot an Gasthof Zur Post ist nur noch wenige Tage gültig.', 'Quotation', q6.id, -1, 7, false);
  notify('quotation.accepted', `Angebot ${q13.number} wurde angenommen`, 'Fitness Loft Pasing GmbH hat das Angebot „Notbeleuchtung und Sicherheitsbeleuchtung Trainingsfläche“ angenommen.', 'Quotation', q13.id, -8, 11, true);
  notify('job.assigned', `Auftrag ${j2.number} gestartet`, 'Aylin Demir hat mit dem Auftrag „LED-Umrüstung Beleuchtung Wartebereich“ begonnen.', 'Job', j2.id, -3, 8, true);
  notify('job.created', `Auftrag ${j4.number} angelegt`, 'Aus dem angenommenen Angebot wurde ein Auftrag erstellt. Noch niemand zugewiesen.', 'Job', j4.id, -7, 13, true);
  notify('quotation.rejected', `Angebot ${q4.number} wurde abgelehnt`, 'Familie Yilmaz hat das Angebot „Zählerschrank-Modernisierung Einfamilienhaus“ abgelehnt.', 'Quotation', q4.id, -41, 11, true);

  // ---------- team activity ----------
  addAudit(db, elektro.id, aylin.id, 'member.joined', 'Membership', null, 'Aylin Demir', at(-120, 8, 30));
  addAudit(db, elektro.id, lena.id, 'member.deactivated', 'Membership', null, 'Jonas Weber', at(-60, 17));
  addAudit(db, elektro.id, lena.id, 'member.invited', 'Invitation', null, 'lukas.hartmann@gmx.de (Mitarbeiter)', at(-2, 14));
  addAudit(db, elektro.id, lena.id, 'company.settings_updated', 'Company', elektro.id, null, at(-30, 16));
  addAudit(db, haustechnik.id, markus.id, 'company.created', 'Company', haustechnik.id, haustechnik.name, at(-150, 8));
  addAudit(db, elektro.id, lena.id, 'company.created', 'Company', elektro.id, elektro.name, at(-200, 8));
}
