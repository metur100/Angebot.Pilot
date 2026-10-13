// /companies endpoints: company, settings, logo, tax rates, members, invitations, subscription, dashboard, activity.
import {
  addDaysIso,
  type ChangePlanRequest,
  type CompanySettingsDto,
  type CreateCompanyRequest,
  type CreateInvitationRequest,
  type DashboardDto,
  type DeleteCompanyRequest,
  type FollowUpDueDto,
  type MembershipRole,
  type TaxMode,
  type UpdateCompanyRequest,
  type UpdateMemberRequest,
  type UpsertTaxRateRequest,
} from '@angebotpilot/api-contracts';
import type { HttpHandler } from 'msw';
import { db } from '../db';
import { addAudit, appLink, captureEmail, companyToday, expireDueQuotations, invoiceDaysOverdue, invoiceOpenAmount, invoiceTotals, isInvoiceOpen } from '../domain';
import { defaultSettings, newId, nextRowVersion, nowIso, randomToken, type CompanyRec, type MembershipRec } from '../model';
import { ensureMemberCapacity, ensureWritable, planFor, subscriptionOf, toSubscriptionDto } from './billing';
import {
  authRoute,
  badRequest,
  base64ToBytes,
  bytesToBase64,
  clean,
  companyRoute,
  concurrencyConflict,
  conflict,
  FieldErrors,
  fileResponse,
  forbidden,
  json,
  noContent,
  notFound,
  paginate,
  readJson,
  validation,
  type CompanyCtx,
} from './http';
import { activeInvoices, activeQuotations, activityOf, toActivity, toCompany, toInvitation, toInvoiceListItem, toMember, toQuotationListItem, totalsOf } from './mappers';

const TAX_MODES: TaxMode[] = ['Standard', 'SmallBusiness', 'ReverseCharge'];
const ROLES: MembershipRole[] = ['Employee', 'Admin', 'Owner'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 1024 * 1024;

export const CONVERSION_DEFINITION =
  'Abschlussquote = angenommene Angebote ÷ (angenommene + abgelehnte + abgelaufene Angebote) mit Angebotsdatum im gewählten Zeitraum. '
  + 'Offene, stornierte und Entwurfs-Angebote zählen nicht. Revisionen werden einzeln gezählt.';

function touchCompany(company: CompanyRec): void {
  company.rowVersion = nextRowVersion(db);
  company.updatedAt = nowIso();
}

function activeOwners(companyId: string): MembershipRec[] {
  return db.memberships.filter((m) => m.companyId === companyId && m.role === 'Owner' && m.status === 'Active');
}

function findMember(ctx: CompanyCtx): MembershipRec {
  const member = db.memberships.find((m) => m.id === ctx.params.membershipId && m.companyId === ctx.company.id);
  if (!member) throw notFound('Das Teammitglied wurde nicht gefunden.');
  return member;
}

/** Only owners may change owners or hand out the owner role. */
function ensureCanManage(ctx: CompanyCtx, target: MembershipRec, newRole?: MembershipRole): void {
  if ((target.role === 'Owner' || newRole === 'Owner') && ctx.membership.role !== 'Owner') throw forbidden();
}

function lastOwner() {
  return conflict('last_owner', 'Eine Firma braucht mindestens eine aktive Inhaberin bzw. einen aktiven Inhaber.');
}

function validateSettings(s: Partial<CompanySettingsDto>): void {
  const errors = new FieldErrors();
  if (!clean(s.quotationPrefix) || !/^[A-Za-z0-9-]{1,10}$/.test(s.quotationPrefix ?? '')) errors.add('quotationPrefix', 'Bitte ein Kürzel aus 1–10 Buchstaben/Ziffern angeben.');
  if (!clean(s.jobPrefix) || !/^[A-Za-z0-9-]{1,10}$/.test(s.jobPrefix ?? '')) errors.add('jobPrefix', 'Bitte ein Kürzel aus 1–10 Buchstaben/Ziffern angeben.');
  if (typeof s.defaultValidityDays !== 'number' || s.defaultValidityDays < 1 || s.defaultValidityDays > 365) {
    errors.add('defaultValidityDays', 'Die Gültigkeit muss zwischen 1 und 365 Tagen liegen.');
  }
  if (!s.defaultTaxMode || !TAX_MODES.includes(s.defaultTaxMode)) errors.add('defaultTaxMode', 'Bitte eine Steuerart wählen.');
  for (const key of ['firstReminderAfterDays', 'secondReminderAfterDays', 'expiryReminderDaysBefore'] as const) {
    const v = s[key];
    if (typeof v !== 'number' || v < 1 || v > 90) errors.add(key, 'Bitte einen Wert zwischen 1 und 90 Tagen angeben.');
  }
  if (s.firstReminderEnabled && s.secondReminderEnabled && (s.secondReminderAfterDays ?? 0) <= (s.firstReminderAfterDays ?? 0)) {
    errors.add('secondReminderAfterDays', 'Die zweite Erinnerung muss nach der ersten kommen.');
  }
  if (s.replyToEmail && !EMAIL_RE.test(s.replyToEmail)) errors.add('replyToEmail', 'Bitte eine gültige E-Mail-Adresse angeben.');
  // Invoice settings: omitted or null values are left unchanged.
  if (s.invoicePrefix !== undefined && s.invoicePrefix !== null && !/^[A-Z0-9]{1,8}$/.test(s.invoicePrefix)) errors.add('invoicePrefix', '1–8 Großbuchstaben oder Ziffern.');
  if (s.invoicePaymentDays !== undefined && s.invoicePaymentDays !== null && (!Number.isInteger(s.invoicePaymentDays) || s.invoicePaymentDays < 0 || s.invoicePaymentDays > 120)) {
    errors.add('invoicePaymentDays', 'Bitte einen Wert zwischen 0 und 120 Tagen angeben.');
  }
  if (s.invoiceReminderAfterDays !== undefined && s.invoiceReminderAfterDays !== null && (!Number.isInteger(s.invoiceReminderAfterDays) || s.invoiceReminderAfterDays < 1 || s.invoiceReminderAfterDays > 60)) {
    errors.add('invoiceReminderAfterDays', 'Bitte einen Wert zwischen 1 und 60 Tagen angeben.');
  }
  errors.throwIfAny();
}

function removeCompanyData(companyId: string): void {
  const quotationIds = new Set(db.quotations.filter((q) => q.companyId === companyId).map((q) => q.id));
  db.companies = db.companies.filter((c) => c.id !== companyId);
  db.memberships = db.memberships.filter((m) => m.companyId !== companyId);
  db.invitations = db.invitations.filter((i) => i.companyId !== companyId);
  db.taxRates = db.taxRates.filter((t) => t.companyId !== companyId);
  db.customers = db.customers.filter((c) => c.companyId !== companyId);
  db.quotations = db.quotations.filter((q) => q.companyId !== companyId);
  db.events = db.events.filter((e) => !quotationIds.has(e.quotationId));
  db.deliveries = db.deliveries.filter((d) => d.companyId !== companyId);
  db.followUps = db.followUps.filter((f) => f.companyId !== companyId);
  db.templates = db.templates.filter((t) => t.companyId !== companyId);
  db.jobs = db.jobs.filter((j) => j.companyId !== companyId);
  db.invoices = db.invoices.filter((i) => i.companyId !== companyId);
  db.invoicePayments = db.invoicePayments.filter((p) => p.companyId !== companyId);
  db.invoiceEvents = db.invoiceEvents.filter((e) => e.companyId !== companyId);
  db.notifications = db.notifications.filter((n) => n.companyId !== companyId);
  db.audit = db.audit.filter((a) => a.companyId !== companyId);
  db.subscriptions = db.subscriptions.filter((s) => s.companyId !== companyId);
}

function buildDashboard(company: CompanyRec, fromParam: string | null, toParam: string | null): DashboardDto {
  expireDueQuotations(db, company.id);
  const today = companyToday(company);
  let from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : `${today.slice(0, 8)}01`;
  let to = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : today;
  if (to < from) [from, to] = [to, from];

  const all = activeQuotations(company.id);
  const inPeriod = all.filter((q) => q.issueDate >= from && q.issueDate <= to);
  const count = (status: string) => inPeriod.filter((q) => q.status === status).length;
  const net = (filter: (status: string) => boolean) =>
    Math.round(inPeriod.filter((q) => filter(q.status)).reduce((sum, q) => sum + totalsOf(q).netTotal, 0) * 100) / 100;

  const accepted = count('Accepted');
  const decided = accepted + count('Rejected') + count('Expired');
  const conversion = decided === 0 ? null : Math.round((accepted * 1000) / decided) / 10;

  const soon = addDaysIso(today, 7);
  const open = all.filter((q) => q.status === 'Sent').sort((a, b) => a.validUntil.localeCompare(b.validUntil));
  const expiring = open.filter((q) => q.validUntil <= soon);

  const horizon = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const dueFollowUps = db.followUps
    .filter((f) => f.companyId === company.id && f.status === 'Scheduled' && f.dueAt <= horizon)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const upcoming: FollowUpDueDto[] = dueFollowUps.slice(0, 8).flatMap((f) => {
    const q = all.find((x) => x.id === f.quotationId);
    return q ? [{ quotationId: q.id, quotationNumber: q.number, customerName: q.recipientName, kind: f.kind, dueAt: f.dueAt }] : [];
  });

  // Invoices: open/overdue are current state; invoiced and received amounts refer to the period.
  const invoices = activeInvoices(company.id);
  const openInvoices = invoices.filter(isInvoiceOpen);
  const overdue = openInvoices.filter((i) => invoiceDaysOverdue(i, today) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
  const invoicedNet = sum(
    invoices
      .filter((i) => i.number !== null && i.issueDate >= from && i.issueDate <= to)
      .map((i) => (i.kind === 'Cancellation' ? -1 : 1) * invoiceTotals(i).netTotal),
  );
  const invoiceIds = new Set(invoices.map((i) => i.id));
  const paymentsReceived = sum(db.invoicePayments.filter((p) => invoiceIds.has(p.invoiceId) && p.paidOn >= from && p.paidOn <= to).map((p) => p.amount));

  return {
    from,
    to,
    draftCount: count('Draft'),
    sentCount: count('Sent'),
    acceptedCount: accepted,
    rejectedCount: count('Rejected'),
    expiredCount: count('Expired'),
    expiringSoonCount: expiring.length,
    followUpsDueCount: dueFollowUps.length,
    quotedValueNet: net((s) => s !== 'Draft' && s !== 'Cancelled'),
    acceptedValueNet: net((s) => s === 'Accepted'),
    conversionRatePercent: conversion,
    conversionRateDefinition: CONVERSION_DEFINITION,
    awaitingDecision: open.slice(0, 8).map(toQuotationListItem),
    expiringSoon: expiring.slice(0, 8).map(toQuotationListItem),
    upcomingFollowUps: upcoming,
    recentActivity: activityOf(company.id).slice(0, 8).map(toActivity),
    openJobsCount: db.jobs.filter((j) => j.companyId === company.id && (j.status === 'Open' || j.status === 'InProgress')).length,
    openInvoicesCount: openInvoices.length,
    openInvoicesAmount: sum(openInvoices.map(invoiceOpenAmount)),
    overdueInvoicesCount: overdue.length,
    overdueInvoicesAmount: sum(overdue.map(invoiceOpenAmount)),
    invoicedNet,
    paymentsReceived,
    overdueInvoices: overdue.slice(0, 8).map(toInvoiceListItem),
  };
}

export const companyHandlers: HttpHandler[] = [
  authRoute('post', '/companies', async ({ request, user }) => {
    const body = await readJson<Partial<CreateCompanyRequest>>(request);
    const errors = new FieldErrors();
    const name = clean(body.name);
    if (!name) errors.add('name', 'Bitte geben Sie den Firmennamen ein.');
    if (body.email && !EMAIL_RE.test(body.email)) errors.add('email', 'Bitte eine gültige E-Mail-Adresse angeben.');
    const taxMode = body.defaultTaxMode && TAX_MODES.includes(body.defaultTaxMode) ? body.defaultTaxMode : null;
    if (!taxMode) errors.add('defaultTaxMode', 'Bitte eine Steuerart wählen.');
    if (body.quotationPrefix && !/^[A-Za-z0-9-]{1,10}$/.test(body.quotationPrefix)) errors.add('quotationPrefix', 'Bitte ein Kürzel aus 1–10 Buchstaben/Ziffern angeben.');
    errors.throwIfAny();
    const owned = db.memberships.filter((m) => m.userId === user.id && m.role === 'Owner').length;
    if (owned >= 5) throw conflict('company_limit', 'Sie können höchstens 5 Firmen anlegen.');

    const now = nowIso();
    const company: CompanyRec = {
      id: newId(),
      name: name ?? '',
      addressLine1: clean(body.addressLine1),
      addressLine2: null,
      postalCode: clean(body.postalCode),
      city: clean(body.city),
      country: clean(body.country)?.toUpperCase() ?? 'DE',
      email: clean(body.email),
      phone: clean(body.phone),
      website: null,
      vatId: clean(body.vatId),
      taxNumber: null,
      brandColor: '#2F45D8',
      timeZone: 'Europe/Berlin',
      language: 'de',
      isDemo: false,
      rowVersion: nextRowVersion(db),
      createdAt: now,
      updatedAt: now,
      logo: null,
      settings: defaultSettings(name ?? '', { quotationPrefix: clean(body.quotationPrefix)?.toUpperCase() ?? 'AN', defaultTaxMode: taxMode ?? 'Standard' }),
    };
    db.companies.push(company);
    db.memberships.push({ id: newId(), companyId: company.id, userId: user.id, role: 'Owner', status: 'Active', joinedAt: now });
    db.taxRates.push(
      { id: newId(), companyId: company.id, name: 'Regelsteuersatz 19 %', ratePercent: 19, isDefault: true, isArchived: false },
      { id: newId(), companyId: company.id, name: 'Ermäßigt 7 %', ratePercent: 7, isDefault: false, isArchived: false },
      { id: newId(), companyId: company.id, name: 'Steuerfrei 0 %', ratePercent: 0, isDefault: false, isArchived: false },
    );
    db.subscriptions.push({ companyId: company.id, plan: 'Trial', status: 'Trialing', trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), currentPeriodEnd: null, cancelAtPeriodEnd: false });
    addAudit(db, company.id, user.id, 'company.created', 'Company', company.id, company.name, now);
    return json(toCompany(company, 'Owner'), 201);
  }),

  companyRoute('get', '', ({ company, membership }) => json(toCompany(company, membership.role))),

  companyRoute('put', '', async ({ request, company, membership, user }) => {
    const body = await readJson<Partial<UpdateCompanyRequest>>(request);
    if (body.rowVersion !== company.rowVersion) throw concurrencyConflict();
    const errors = new FieldErrors();
    const name = clean(body.name);
    if (!name) errors.add('name', 'Bitte geben Sie den Firmennamen ein.');
    if (body.email && !EMAIL_RE.test(body.email)) errors.add('email', 'Bitte eine gültige E-Mail-Adresse angeben.');
    if (!body.brandColor || !HEX_RE.test(body.brandColor)) errors.add('brandColor', 'Bitte eine Farbe im Format #RRGGBB angeben.');
    if (!clean(body.country)) errors.add('country', 'Bitte ein Land angeben.');
    errors.throwIfAny();
    ensureWritable(company.id);
    Object.assign(company, {
      name: name ?? company.name,
      addressLine1: clean(body.addressLine1),
      addressLine2: clean(body.addressLine2),
      postalCode: clean(body.postalCode),
      city: clean(body.city),
      country: clean(body.country)?.toUpperCase() ?? 'DE',
      email: clean(body.email),
      phone: clean(body.phone),
      website: clean(body.website),
      vatId: clean(body.vatId),
      taxNumber: clean(body.taxNumber),
      brandColor: body.brandColor ?? company.brandColor,
      timeZone: clean(body.timeZone) ?? company.timeZone,
      language: clean(body.language) ?? company.language,
    });
    touchCompany(company);
    addAudit(db, company.id, user.id, 'company.updated', 'Company', company.id, null);
    return json(toCompany(company, membership.role));
  }, 'Admin'),

  companyRoute('post', '/delete', async ({ request, company }) => {
    const body = await readJson<Partial<DeleteCompanyRequest>>(request);
    if ((body.confirmName ?? '').trim() !== company.name) {
      throw validation('confirmName', 'Der eingegebene Name stimmt nicht mit dem Firmennamen überein.');
    }
    removeCompanyData(company.id);
    return noContent();
  }, 'Owner'),

  companyRoute('get', '/export', ({ company }) => {
    const data = {
      exportedAt: nowIso(),
      company: { ...company, logo: company.logo ? { contentType: company.logo.contentType } : null },
      members: db.memberships.filter((m) => m.companyId === company.id).map(toMember),
      customers: db.customers.filter((c) => c.companyId === company.id),
      quotations: db.quotations.filter((q) => q.companyId === company.id && !q.deletedAt).map((q) => ({ ...q, publicToken: undefined, revokedTokens: undefined })),
      jobs: db.jobs.filter((j) => j.companyId === company.id),
      templates: db.templates.filter((t) => t.companyId === company.id),
    };
    return fileResponse(JSON.stringify(data, null, 2), 'application/json', `angebotpilot-export-${company.name.replace(/[^A-Za-z0-9]+/g, '-')}.json`);
  }, 'Admin'),

  // ---------- settings ----------
  companyRoute('get', '/settings', ({ company }) => json(company.settings)),

  companyRoute('put', '/settings', async ({ request, company, user }) => {
    const body = await readJson<Partial<CompanySettingsDto>>(request);
    validateSettings(body);
    ensureWritable(company.id);
    const s = body as CompanySettingsDto;
    company.settings = {
      ...company.settings,
      ...s,
      quotationPrefix: s.quotationPrefix.trim().toUpperCase(),
      jobPrefix: s.jobPrefix.trim().toUpperCase(),
      defaultIntroText: clean(s.defaultIntroText),
      defaultClosingText: clean(s.defaultClosingText),
      defaultTerms: clean(s.defaultTerms),
      paymentTerms: clean(s.paymentTerms),
      bankAccountHolder: clean(s.bankAccountHolder),
      iban: clean(s.iban),
      bic: clean(s.bic),
      bankName: clean(s.bankName),
      emailSignature: clean(s.emailSignature),
      replyToEmail: clean(s.replyToEmail),
      invoicePrefix: s.invoicePrefix?.trim().toUpperCase() ?? company.settings.invoicePrefix,
      invoicePaymentDays: s.invoicePaymentDays ?? company.settings.invoicePaymentDays,
      invoiceIntroText: s.invoiceIntroText === undefined || s.invoiceIntroText === null ? company.settings.invoiceIntroText : clean(s.invoiceIntroText),
      invoiceClosingText: s.invoiceClosingText === undefined || s.invoiceClosingText === null ? company.settings.invoiceClosingText : clean(s.invoiceClosingText),
      invoiceReminderEnabled: s.invoiceReminderEnabled ?? company.settings.invoiceReminderEnabled,
      invoiceReminderAfterDays: s.invoiceReminderAfterDays ?? company.settings.invoiceReminderAfterDays,
    };
    touchCompany(company);
    addAudit(db, company.id, user.id, 'company.settings_updated', 'Company', company.id, null);
    return json(company.settings);
  }, 'Admin'),

  // ---------- logo ----------
  companyRoute('put', '/logo', async ({ request, company, membership, user }) => {
    let file: FormDataEntryValue | null = null;
    try {
      file = (await request.formData()).get('file');
    } catch {
      file = null;
    }
    if (!file || typeof file === 'string') throw badRequest('invalid_logo', 'Bitte wählen Sie eine Bilddatei aus.', { file: ['Bitte wählen Sie eine Bilddatei aus.'] });
    const type = file.type.toLowerCase();
    if (type !== 'image/png' && type !== 'image/jpeg') {
      throw badRequest('invalid_logo', 'Das Logo muss eine PNG- oder JPEG-Datei sein.', { file: ['Das Logo muss eine PNG- oder JPEG-Datei sein.'] });
    }
    if (file.size > MAX_LOGO_BYTES) throw badRequest('invalid_logo', 'Das Logo darf höchstens 1 MB groß sein.', { file: ['Das Logo darf höchstens 1 MB groß sein.'] });
    ensureWritable(company.id);
    company.logo = { contentType: type, base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
    touchCompany(company);
    addAudit(db, company.id, user.id, 'company.logo_uploaded', 'Company', company.id, null);
    return json(toCompany(company, membership.role));
  }, 'Admin'),

  companyRoute('get', '/logo', ({ company }) => {
    if (!company.logo) throw notFound('Es ist kein Logo hinterlegt.');
    return fileResponse(base64ToBytes(company.logo.base64), company.logo.contentType);
  }),

  companyRoute('delete', '/logo', ({ company, membership }) => {
    company.logo = null;
    touchCompany(company);
    return json(toCompany(company, membership.role));
  }, 'Admin'),

  // ---------- tax rates ----------
  companyRoute('get', '/tax-rates', ({ company }) =>
    json(db.taxRates.filter((t) => t.companyId === company.id).sort((a, b) => b.ratePercent - a.ratePercent).map(({ companyId: _c, ...t }) => t))),

  companyRoute('post', '/tax-rates', async ({ request, company }) => {
    const body = await readJson<Partial<UpsertTaxRateRequest>>(request);
    const rate = upsertTaxRate(company.id, null, body);
    return json(rate, 201);
  }, 'Admin'),

  companyRoute('put', '/tax-rates/:taxRateId', async ({ request, company, params }) => {
    const body = await readJson<Partial<UpsertTaxRateRequest>>(request);
    return json(upsertTaxRate(company.id, params.taxRateId ?? '', body));
  }, 'Admin'),

  // ---------- members ----------
  companyRoute('get', '/members', ({ company }) =>
    json(db.memberships.filter((m) => m.companyId === company.id).map(toMember).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de-DE')))),

  companyRoute('patch', '/members/:membershipId', async (ctx) => {
    const body = await readJson<Partial<UpdateMemberRequest>>(ctx.request);
    if (!body.role || !ROLES.includes(body.role)) throw validation('role', 'Bitte eine gültige Rolle wählen.');
    const member = findMember(ctx);
    ensureCanManage(ctx, member, body.role);
    if (member.role === 'Owner' && body.role !== 'Owner' && member.status === 'Active' && activeOwners(ctx.company.id).length <= 1) throw lastOwner();
    if (member.role !== body.role) {
      member.role = body.role;
      addAudit(db, ctx.company.id, ctx.user.id, 'member.role_changed', 'Membership', member.id, `${toMember(member).displayName}: ${body.role}`);
    }
    return json(toMember(member));
  }, 'Admin'),

  companyRoute('post', '/members/:membershipId/deactivate', (ctx) => {
    const member = findMember(ctx);
    if (member.userId === ctx.user.id) throw conflict('cannot_deactivate_self', 'Sie können sich nicht selbst deaktivieren.');
    ensureCanManage(ctx, member);
    if (member.role === 'Owner' && member.status === 'Active' && activeOwners(ctx.company.id).length <= 1) throw lastOwner();
    if (member.status !== 'Deactivated') {
      member.status = 'Deactivated';
      addAudit(db, ctx.company.id, ctx.user.id, 'member.deactivated', 'Membership', member.id, toMember(member).displayName);
    }
    return json(toMember(member));
  }, 'Admin'),

  companyRoute('post', '/members/:membershipId/reactivate', (ctx) => {
    const member = findMember(ctx);
    ensureCanManage(ctx, member);
    if (member.status !== 'Active') {
      ensureMemberCapacity(ctx.company.id);
      member.status = 'Active';
    }
    return json(toMember(member));
  }, 'Admin'),

  // ---------- invitations ----------
  companyRoute('get', '/invitations', ({ company }) =>
    json(db.invitations.filter((i) => i.companyId === company.id && i.status === 'Pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toInvitation)), 'Admin'),

  companyRoute('post', '/invitations', async (ctx) => {
    const body = await readJson<Partial<CreateInvitationRequest>>(ctx.request);
    const errors = new FieldErrors();
    const email = clean(body.email)?.toLowerCase() ?? null;
    if (!email || !EMAIL_RE.test(email)) errors.add('email', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
    if (!body.role || !ROLES.includes(body.role)) errors.add('role', 'Bitte eine gültige Rolle wählen.');
    errors.throwIfAny();
    if (body.role === 'Owner' && ctx.membership.role !== 'Owner') throw forbidden();
    const existingUser = db.users.find((u) => u.email.toLowerCase() === email);
    if (existingUser && db.memberships.some((m) => m.companyId === ctx.company.id && m.userId === existingUser.id && m.status === 'Active')) {
      throw conflict('already_member', 'Diese Person ist bereits Mitglied der Firma.');
    }
    // A new invitation for the same address replaces the old one.
    for (const old of db.invitations.filter((i) => i.companyId === ctx.company.id && i.email === email && i.status === 'Pending')) old.status = 'Revoked';
    ensureMemberCapacity(ctx.company.id);
    const now = nowIso();
    const token = randomToken(32);
    const invitation = {
      id: newId(),
      companyId: ctx.company.id,
      email: email ?? '',
      role: body.role ?? 'Employee',
      token,
      createdAt: now,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      status: 'Pending' as const,
    };
    db.invitations.push(invitation);
    captureEmail(
      db,
      invitation.email,
      `Einladung zu ${ctx.company.name} bei AngebotPilot`,
      `Hallo,\n\n${ctx.user.displayName} lädt Sie ein, dem Team von ${ctx.company.name} bei AngebotPilot beizutreten.\n\nEinladung annehmen:\n${appLink(`/invite?token=${token}`)}\n\nDie Einladung ist 7 Tage gültig.`,
    );
    db.deliveries.push({
      id: newId(), companyId: ctx.company.id, quotationId: null, kind: 'Invitation', toAddress: invitation.email,
      subject: `Einladung zu ${ctx.company.name} bei AngebotPilot`, status: 'HandedOff', attempts: 1, createdAt: now, handedOffAt: now, nextAttemptAt: null, lastError: null,
    });
    addAudit(db, ctx.company.id, ctx.user.id, 'member.invited', 'Invitation', invitation.id, `${invitation.email} (${invitation.role})`);
    return json(toInvitation(invitation), 201);
  }, 'Admin'),

  companyRoute('delete', '/invitations/:invitationId', ({ company, params }) => {
    const invitation = db.invitations.find((i) => i.id === params.invitationId && i.companyId === company.id);
    if (!invitation) throw notFound('Die Einladung wurde nicht gefunden.');
    invitation.status = 'Revoked';
    return noContent();
  }, 'Admin'),

  // ---------- subscription ----------
  companyRoute('get', '/subscription', ({ company }) => json(toSubscriptionDto(company))),

  companyRoute('post', '/subscription/change-plan', async ({ request, company }) => {
    const body = await readJson<Partial<ChangePlanRequest>>(request);
    if (!body.plan || !['Starter', 'Team', 'Business'].includes(body.plan)) {
      throw conflict('invalid_plan', 'Die Testphase kann nicht erneut gewählt werden.');
    }
    const limits = planFor(body.plan);
    const members = db.memberships.filter((m) => m.companyId === company.id && m.status === 'Active').length;
    if (members > limits.maxActiveMembers) {
      throw conflict('plan_too_small', `Der Tarif erlaubt höchstens ${limits.maxActiveMembers} aktive Mitglieder. Deaktivieren Sie zuerst Mitglieder.`);
    }
    const sub = subscriptionOf(company.id);
    sub.plan = body.plan;
    sub.status = 'Active';
    sub.trialEndsAt = null;
    sub.cancelAtPeriodEnd = false;
    sub.currentPeriodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    return json({ redirectUrl: null, activatedImmediately: true, subscription: toSubscriptionDto(company) });
  }, 'Admin'),

  // ---------- dashboard, activity ----------
  companyRoute('get', '/dashboard', ({ company, query }) => json(buildDashboard(company, query.get('from'), query.get('to')))),

  companyRoute('get', '/activity', ({ company, query }) => json(paginate(activityOf(company.id).map(toActivity), query))),
];

function upsertTaxRate(companyId: string, id: string | null, body: Partial<UpsertTaxRateRequest>) {
  const errors = new FieldErrors();
  const name = clean(body.name);
  if (!name) errors.add('name', 'Bitte eine Bezeichnung angeben.');
  if (typeof body.ratePercent !== 'number' || body.ratePercent < 0 || body.ratePercent > 100) errors.add('ratePercent', 'Der Steuersatz muss zwischen 0 und 100 % liegen.');
  if (body.isDefault && body.isArchived) errors.add('isDefault', 'Ein archivierter Steuersatz kann nicht Standard sein.');
  errors.throwIfAny();
  ensureWritable(companyId);
  let rate = id ? db.taxRates.find((t) => t.id === id && t.companyId === companyId) : undefined;
  if (id && !rate) throw notFound('Der Steuersatz wurde nicht gefunden.');
  if (!rate) {
    rate = { id: newId(), companyId, name: name ?? '', ratePercent: 0, isDefault: false, isArchived: false };
    db.taxRates.push(rate);
  }
  rate.name = name ?? rate.name;
  rate.ratePercent = body.ratePercent ?? rate.ratePercent;
  rate.isArchived = body.isArchived === true;
  rate.isDefault = body.isDefault === true;
  if (rate.isDefault) {
    for (const other of db.taxRates) if (other.companyId === companyId && other.id !== rate.id) other.isDefault = false;
  }
  const { companyId: _c, ...dto } = rate;
  return dto;
}
