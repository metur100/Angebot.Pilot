// /companies/:companyId/quotations endpoints (mirrors QuotationService of the API).
import {
  addDaysIso,
  calculateTotals,
  formatDate,
  formatEur,
  type CalculateRequest,
  type CancelRequest,
  type ConvertToJobRequest,
  type CreateQuotationRequest,
  type DecisionRequest,
  type LineItemInput,
  type LookupByTokenRequest,
  type QuotationStatus,
  type SaveAsTemplateRequest,
  type SendQuotationRequest,
  type SendQuotationResponse,
  type TaxMode,
  type UpdateQuotationRequest,
} from '@angebotpilot/api-contracts';
import type { HttpHandler } from 'msw';
import { db } from '../db';
import {
  addAudit,
  addEvent,
  allowedTransitions,
  cancelScheduledFollowUps,
  canTransition,
  captureEmail,
  companyToday,
  expireDueQuotations,
  planFollowUps,
  publicQuotationUrl,
  REVISABLE_STATUSES,
  STATUS_LABELS,
} from '../domain';
import {
  buildLineItems,
  newId,
  nextNumber,
  nextRowVersion,
  nowIso,
  randomToken,
  snapshotRecipient,
  type CompanyRec,
  type JobRec,
  type QuotationRec,
  type TemplateRec,
} from '../model';
import { buildQuotationPdf, quotationPdfFileName } from '../pdf';
import { ensureEmailQuota, ensureQuotationQuota, ensureWritable } from './billing';
import {
  badRequest,
  clean,
  companyRoute,
  concurrencyConflict,
  conflict,
  csvDate,
  csvDateTime,
  csvMoney,
  csvResponse,
  FieldErrors,
  fileResponse,
  includesCi,
  json,
  listParam,
  noContent,
  notFound,
  paginate,
  readJson,
  sortBy,
  validation,
  type CompanyCtx,
} from './http';
import { activeQuotations, customerName, toDelivery, toEvent, toFollowUp, toJob, toQuotation, toQuotationListItem, toTemplate, totalsOf } from './mappers';

const TAX_MODES: TaxMode[] = ['Standard', 'SmallBusiness', 'ReverseCharge'];
const MAX_LINE_ITEMS = 200;
const PUBLIC_LINK_GRACE_DAYS = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function findQuotation(ctx: CompanyCtx, id: string | undefined): QuotationRec {
  const q = db.quotations.find((x) => x.id === id && x.companyId === ctx.company.id && !x.deletedAt);
  if (!q) throw notFound('Das Angebot wurde nicht gefunden.');
  return q;
}

function touch(q: QuotationRec, at: string = nowIso()): void {
  q.updatedAt = at;
  q.rowVersion = nextRowVersion(db);
}

function transitionError(from: QuotationStatus, to: QuotationStatus) {
  return conflict('invalid_status_transition', `Der Status kann nicht von „${STATUS_LABELS[from]}“ zu „${STATUS_LABELS[to]}“ geändert werden.`);
}

export function validateLineItems(errors: FieldErrors, items: unknown, requireOne: boolean): LineItemInput[] {
  if (!Array.isArray(items)) {
    if (requireOne) errors.add('lineItems', 'Bitte fügen Sie mindestens eine Position hinzu.');
    return [];
  }
  if (requireOne && items.length === 0) errors.add('lineItems', 'Bitte fügen Sie mindestens eine Position hinzu.');
  if (items.length > MAX_LINE_ITEMS) errors.add('lineItems', `Ein Angebot darf höchstens ${MAX_LINE_ITEMS} Positionen enthalten.`);
  const list = items as Partial<LineItemInput>[];
  list.forEach((item, i) => {
    const p = `lineItems[${i}]`;
    if (!clean(item.title)) errors.add(`${p}.title`, 'Bitte geben Sie eine Bezeichnung ein.');
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) errors.add(`${p}.quantity`, 'Die Menge muss größer als 0 sein.');
    if (typeof item.unitPriceNet !== 'number' || !Number.isFinite(item.unitPriceNet) || item.unitPriceNet < 0) errors.add(`${p}.unitPriceNet`, 'Der Preis darf nicht negativ sein.');
    if (typeof item.discountPercent !== 'number' || item.discountPercent < 0 || item.discountPercent > 100) errors.add(`${p}.discountPercent`, 'Der Rabatt muss zwischen 0 und 100 % liegen.');
    if (typeof item.taxRatePercent !== 'number' || item.taxRatePercent < 0 || item.taxRatePercent > 100) errors.add(`${p}.taxRatePercent`, 'Bitte einen gültigen Steuersatz wählen.');
    if (!clean(item.unit)) errors.add(`${p}.unit`, 'Bitte geben Sie eine Einheit an.');
  });
  return list.map((item) => ({
    title: item.title ?? '',
    description: item.description ?? null,
    quantity: item.quantity ?? 0,
    unit: item.unit ?? 'Stk.',
    unitPriceNet: item.unitPriceNet ?? 0,
    discountPercent: item.discountPercent ?? 0,
    taxRatePercent: item.taxRatePercent ?? 0,
  }));
}

function defaultTaxRate(companyId: string): number {
  return db.taxRates.find((t) => t.companyId === companyId && t.isDefault && !t.isArchived)?.ratePercent ?? 19;
}

function newDraftFrom(source: QuotationRec, userId: string, now: string): QuotationRec {
  return {
    ...source,
    id: newId(),
    status: 'Draft',
    lineItems: buildLineItems(source.lineItems),
    revisionNumber: 0,
    rootQuotationId: null,
    previousRevisionId: null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
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
    rowVersion: nextRowVersion(db),
  };
}

/** Revokes the active public link (tokens stay known so the public page can answer 410). */
export function revokePublicLink(q: QuotationRec): boolean {
  if (!q.publicToken) return false;
  q.revokedTokens.push(q.publicToken);
  q.publicToken = null;
  q.publicLinkExpiresAt = null;
  return true;
}

function createPublicLink(q: QuotationRec): { token: string; expiresAt: string } {
  revokePublicLink(q);
  const token = randomToken(32);
  q.publicToken = token;
  q.publicLinkExpiresAt = `${addDaysIso(q.validUntil, PUBLIC_LINK_GRACE_DAYS)}T23:59:59.000Z`;
  return { token, expiresAt: q.publicLinkExpiresAt };
}

/** Cancels reminders when a quotation reaches a final state. */
export function closeOpenEnds(q: QuotationRec, reason: string, userId: string | null, at: string = nowIso()): void {
  if (cancelScheduledFollowUps(db, q.id, reason, at) > 0) {
    addEvent(db, q, 'FollowUpsCancelled', userId ? 'User' : 'System', userId, reason, at);
  }
}

function supersedeOtherRevisions(q: QuotationRec, userId: string, at: string): void {
  if (q.revisionNumber === 0 && !q.rootQuotationId) return;
  const rootId = q.rootQuotationId ?? q.id;
  for (const other of db.quotations.filter((x) => (x.id === rootId || x.rootQuotationId === rootId) && x.id !== q.id && x.status === 'Sent')) {
    other.status = 'Cancelled';
    other.cancelledAt = at;
    other.cancellationReason = `Ersetzt durch ${q.number}`;
    touch(other, at);
    addEvent(db, other, 'SupersededByRevision', 'User', userId, q.number, at);
    cancelScheduledFollowUps(db, other.id, `Ersetzt durch ${q.number}`, at);
    revokePublicLink(other);
  }
}

function filterQuotations(company: CompanyRec, query: URLSearchParams): QuotationRec[] {
  let items = activeQuotations(company.id);
  const statuses = listParam(query, 'status');
  if (statuses.length > 0) items = items.filter((q) => statuses.includes(q.status));
  const customerId = query.get('customerId');
  if (customerId) items = items.filter((q) => q.customerId === customerId);
  const from = query.get('from');
  if (from) items = items.filter((q) => q.issueDate >= from);
  const to = query.get('to');
  if (to) items = items.filter((q) => q.issueDate <= to);
  const search = clean(query.get('search'));
  if (search) {
    items = items.filter((q) => {
      const customer = db.customers.find((c) => c.id === q.customerId);
      return [q.number, q.title, q.recipientName, customer ? customerName(customer) : null].some((v) => includesCi(v, search));
    });
  }
  return items;
}

function emailBody(q: QuotationRec, company: CompanyRec, message: string | null, publicUrl: string | null, attachPdf: boolean): string {
  const totals = totalsOf(q);
  const parts = [
    message ?? `Guten Tag,\n\nanbei erhalten Sie unser Angebot ${q.number} „${q.title}“ über ${formatEur(totals.grossTotal)} (brutto). Das Angebot ist gültig bis ${formatDate(q.validUntil)}.`,
  ];
  if (publicUrl) parts.push(`Sie können das Angebot hier online ansehen und direkt annehmen oder ablehnen:\n${publicUrl}`);
  if (attachPdf) parts.push(`Das Angebot finden Sie zusätzlich als PDF im Anhang (${quotationPdfFileName(q)}).`);
  parts.push(company.settings.emailSignature ?? `Mit freundlichen Grüßen\n${company.name}`);
  if (publicUrl) parts.push(`Keine Erinnerungen zu diesem Angebot mehr erhalten: ${publicUrl}?abmelden=1`);
  return parts.join('\n\n');
}

export const quotationHandlers: HttpHandler[] = [
  // ---------- static paths first (before /quotations/:id) ----------
  companyRoute('post', '/quotations/calculate', async ({ request }) => {
    const body = await readJson<Partial<CalculateRequest>>(request);
    const errors = new FieldErrors();
    const items = validateLineItems(errors, body.lineItems ?? [], false);
    const taxMode = body.taxMode && TAX_MODES.includes(body.taxMode) ? body.taxMode : 'Standard';
    errors.throwIfAny();
    return json(calculateTotals(items, taxMode));
  }),

  companyRoute('post', '/quotations/lookup-by-token', async ({ request, company }) => {
    const body = await readJson<Partial<LookupByTokenRequest>>(request);
    const token = (body.token ?? '').trim();
    const q = token
      ? activeQuotations(company.id).find((x) => x.publicToken === token || x.revokedTokens.includes(token))
      : undefined;
    if (!q) throw notFound('Kein Angebot Ihrer Firma gehört zu diesem Code.');
    return json({ quotationId: q.id });
  }),

  companyRoute('get', '/quotations/export.csv', ({ company, query, user }) => {
    const rows = filterQuotations(company, query)
      .sort((a, b) => a.number.localeCompare(b.number))
      .map((q) => {
        const t = totalsOf(q);
        return [
          q.number, q.title, STATUS_LABELS[q.status], q.recipientName, csvDate(q.issueDate), csvDate(q.validUntil), csvMoney(t.netTotal), csvMoney(t.taxTotal),
          csvMoney(t.grossTotal), csvDateTime(q.sentAt, company.timeZone), csvDateTime(q.decidedAt, company.timeZone),
        ];
      });
    addAudit(db, company.id, user.id, 'quotation.exported', 'Quotation', null, `${rows.length} Angebote`);
    return csvResponse('angebote.csv', [
      'Nummer', 'Betreff', 'Status', 'Kunde', 'Angebotsdatum', 'Gültig bis', 'Netto (EUR)', 'USt. (EUR)', 'Brutto (EUR)', 'Versendet am', 'Entschieden am',
    ], rows);
  }, 'Admin'),

  // ---------- list / CRUD ----------
  companyRoute('get', '/quotations', ({ company, query }) => {
    expireDueQuotations(db, company.id);
    const items = sortBy(filterQuotations(company, query), query.get('sort'), {
      updatedAt: (q) => q.updatedAt,
      number: (q) => q.number,
      issueDate: (q) => `${q.issueDate}|${q.number}`,
      grossTotal: (q) => totalsOf(q).grossTotal,
      validUntil: (q) => q.validUntil,
    }, '-updatedAt');
    return json(paginate(items.map(toQuotationListItem), query));
  }),

  companyRoute('get', '/quotations/:id', (ctx) => {
    expireDueQuotations(db, ctx.company.id);
    return json(toQuotation(findQuotation(ctx, ctx.params.id)));
  }),

  companyRoute('post', '/quotations', async ({ request, company, user }) => {
    const body = await readJson<Partial<CreateQuotationRequest>>(request);
    const errors = new FieldErrors();
    const customer = db.customers.find((c) => c.id === body.customerId && c.companyId === company.id);
    if (!body.customerId) errors.add('customerId', 'Bitte wählen Sie einen Kunden aus.');
    const items = body.lineItems ? validateLineItems(errors, body.lineItems, false) : [];
    if (body.issueDate && !ISO_DATE.test(body.issueDate)) errors.add('issueDate', 'Bitte ein gültiges Datum angeben.');
    if (body.validUntil && !ISO_DATE.test(body.validUntil)) errors.add('validUntil', 'Bitte ein gültiges Datum angeben.');
    if (body.taxMode && !TAX_MODES.includes(body.taxMode)) errors.add('taxMode', 'Bitte eine Steuerart wählen.');
    if (body.title !== undefined && body.title !== null && body.title.trim() === '') errors.add('title', 'Bitte geben Sie einen Betreff ein.');
    errors.throwIfAny();
    if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
    if (customer.isArchived) throw conflict('customer_archived', 'Für archivierte Kunden können keine neuen Angebote erstellt werden.');
    ensureQuotationQuota(company.id);

    let template: TemplateRec | undefined;
    if (body.templateId) {
      template = db.templates.find((t) => t.id === body.templateId && t.companyId === company.id);
      if (!template) throw notFound('Die Vorlage wurde nicht gefunden.');
    }
    const settings = company.settings;
    const now = nowIso();
    const issueDate = body.issueDate ?? companyToday(company);
    const validUntil = body.validUntil ?? addDaysIso(issueDate, settings.defaultValidityDays);
    if (validUntil < issueDate) throw validation('validUntil', 'Das Gültigkeitsdatum darf nicht vor dem Angebotsdatum liegen.');
    const fallbackRate = defaultTaxRate(company.id);
    const lineInputs: LineItemInput[] = items.length > 0
      ? items
      : (template?.lineItems ?? []).map((i) => ({ ...i, taxRatePercent: i.taxRatePercent ?? fallbackRate }));

    const q: QuotationRec = {
      id: newId(),
      companyId: company.id,
      customerId: customer.id,
      number: nextNumber(db, company.id, 'quotation', settings.quotationPrefix, Number(issueDate.slice(0, 4))),
      title: clean(body.title) ?? template?.name ?? 'Angebot',
      status: 'Draft',
      recipientName: '',
      recipientContact: null,
      recipientAddress: null,
      recipientEmail: null,
      recipientVatId: null,
      issueDate,
      validUntil,
      taxMode: body.taxMode ?? template?.taxMode ?? settings.defaultTaxMode,
      introText: clean(body.introText) ?? template?.introText ?? settings.defaultIntroText,
      closingText: clean(body.closingText) ?? template?.closingText ?? settings.defaultClosingText,
      terms: clean(body.terms) ?? template?.terms ?? settings.defaultTerms,
      paymentTerms: clean(body.paymentTerms) ?? settings.paymentTerms,
      internalNotes: clean(body.internalNotes),
      currency: 'EUR',
      lineItems: buildLineItems(lineInputs),
      revisionNumber: 0,
      rootQuotationId: null,
      previousRevisionId: null,
      sourceTemplateId: template?.id ?? null,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
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
      rowVersion: nextRowVersion(db),
    };
    snapshotRecipient(q, customer);
    db.quotations.push(q);
    addEvent(db, q, 'Created', 'User', user.id, template ? `Aus Vorlage „${template.name}“` : null, now);
    addAudit(db, company.id, user.id, 'quotation.created', 'Quotation', q.id, q.number, now);
    return json(toQuotation(q), 201);
  }),

  companyRoute('put', '/quotations/:id', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    if (q.status !== 'Draft') {
      throw conflict('quotation_not_editable', 'Nur Entwürfe können bearbeitet werden. Erstellen Sie eine Revision, um ein versendetes Angebot zu ändern.');
    }
    const body = await readJson<Partial<UpdateQuotationRequest>>(ctx.request);
    if (body.rowVersion !== q.rowVersion) throw concurrencyConflict();
    const errors = new FieldErrors();
    if (!clean(body.title)) errors.add('title', 'Bitte geben Sie einen Betreff ein.');
    if (!body.customerId) errors.add('customerId', 'Bitte wählen Sie einen Kunden aus.');
    if (!body.issueDate || !ISO_DATE.test(body.issueDate)) errors.add('issueDate', 'Bitte ein gültiges Datum angeben.');
    if (!body.validUntil || !ISO_DATE.test(body.validUntil)) errors.add('validUntil', 'Bitte ein gültiges Datum angeben.');
    else if (body.issueDate && body.validUntil < body.issueDate) errors.add('validUntil', 'Das Gültigkeitsdatum darf nicht vor dem Angebotsdatum liegen.');
    if (!body.taxMode || !TAX_MODES.includes(body.taxMode)) errors.add('taxMode', 'Bitte eine Steuerart wählen.');
    const items = validateLineItems(errors, body.lineItems, true);
    errors.throwIfAny();
    const customer = db.customers.find((c) => c.id === body.customerId && c.companyId === ctx.company.id);
    if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
    ensureWritable(ctx.company.id);
    const now = nowIso();
    q.customerId = customer.id;
    q.title = clean(body.title) ?? q.title;
    q.issueDate = body.issueDate ?? q.issueDate;
    q.validUntil = body.validUntil ?? q.validUntil;
    q.taxMode = body.taxMode ?? q.taxMode;
    q.introText = clean(body.introText);
    q.closingText = clean(body.closingText);
    q.terms = clean(body.terms);
    q.paymentTerms = clean(body.paymentTerms);
    q.internalNotes = clean(body.internalNotes);
    if (!customer.isAnonymized) snapshotRecipient(q, customer);
    q.lineItems = buildLineItems(items);
    touch(q, now);
    addEvent(db, q, 'Updated', 'User', ctx.user.id, null, now);
    return json(toQuotation(q));
  }),

  companyRoute('delete', '/quotations/:id', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    if (q.status !== 'Draft') {
      throw conflict('quotation_not_deletable', 'Nur Entwürfe können gelöscht werden. Versendete Angebote können storniert werden.');
    }
    q.deletedAt = nowIso();
    addAudit(db, ctx.company.id, ctx.user.id, 'quotation.deleted', 'Quotation', q.id, `${q.number} (Nummer wird nicht erneut vergeben)`);
    return noContent();
  }),

  companyRoute('post', '/quotations/:id/duplicate', (ctx) => {
    const source = findQuotation(ctx, ctx.params.id);
    ensureQuotationQuota(ctx.company.id);
    const now = nowIso();
    const today = companyToday(ctx.company);
    const copy = newDraftFrom(source, ctx.user.id, now);
    copy.number = nextNumber(db, ctx.company.id, 'quotation', ctx.company.settings.quotationPrefix, Number(today.slice(0, 4)));
    copy.issueDate = today;
    copy.validUntil = addDaysIso(today, ctx.company.settings.defaultValidityDays);
    const customer = db.customers.find((c) => c.id === source.customerId);
    if (customer && !customer.isAnonymized) snapshotRecipient(copy, customer);
    db.quotations.push(copy);
    addEvent(db, copy, 'Created', 'User', ctx.user.id, `Kopie von ${source.number}`, now);
    addEvent(db, source, 'Duplicated', 'User', ctx.user.id, `Kopiert nach ${copy.number}`, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'quotation.duplicated', 'Quotation', copy.id, `${source.number} → ${copy.number}`, now);
    return json(toQuotation(copy), 201);
  }),

  companyRoute('post', '/quotations/:id/revise', (ctx) => {
    const source = findQuotation(ctx, ctx.params.id);
    if (!REVISABLE_STATUSES.includes(source.status)) {
      throw conflict('quotation_not_revisable', 'Nur versendete, abgelehnte oder abgelaufene Angebote können überarbeitet werden.');
    }
    ensureWritable(ctx.company.id);
    const rootId = source.rootQuotationId ?? source.id;
    const root = db.quotations.find((x) => x.id === rootId) ?? source;
    const chain = db.quotations.filter((x) => x.id === rootId || x.rootQuotationId === rootId);
    const nextRevision = Math.max(...chain.map((x) => x.revisionNumber)) + 1;
    const now = nowIso();
    const today = companyToday(ctx.company);
    const revision = newDraftFrom(source, ctx.user.id, now);
    revision.number = `${root.number}-R${nextRevision}`;
    revision.revisionNumber = nextRevision;
    revision.rootQuotationId = rootId;
    revision.previousRevisionId = source.id;
    revision.issueDate = today;
    revision.validUntil = addDaysIso(today, ctx.company.settings.defaultValidityDays);
    db.quotations.push(revision);
    addEvent(db, revision, 'Created', 'User', ctx.user.id, `Revision ${nextRevision} von ${source.number}`, now);
    addEvent(db, source, 'RevisionCreated', 'User', ctx.user.id, revision.number, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'quotation.revised', 'Quotation', revision.id, `${source.number} → ${revision.number}`, now);
    return json(toQuotation(revision), 201);
  }),

  // ---------- send / decide ----------
  companyRoute('post', '/quotations/:id/send', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const body = await readJson<Partial<SendQuotationRequest>>(ctx.request);
    if (q.status !== 'Draft' && q.status !== 'Sent') {
      throw conflict('invalid_status_transition', 'Dieses Angebot kann nicht mehr versendet werden.');
    }
    if (body.mode !== 'Email' && body.mode !== 'Manual') throw validation('mode', 'Bitte wählen Sie die Versandart.');
    const company = ctx.company;
    const customer = db.customers.find((c) => c.id === q.customerId);
    const isEmail = body.mode === 'Email';
    let recipient: string | null = null;
    if (isEmail) {
      if (!ctx.user.emailVerified) {
        throw conflict('email_not_verified', 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail versendet werden.');
      }
      recipient = clean(body.recipientEmail) ?? customer?.email ?? null;
      if (!recipient) throw validation('recipientEmail', 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw validation('recipientEmail', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
      ensureEmailQuota(company.id);
    } else {
      ensureWritable(company.id);
    }

    const now = nowIso();
    const today = companyToday(company);
    const firstSend = q.status === 'Draft';
    if (firstSend) {
      if (q.lineItems.length === 0) throw conflict('quotation_empty', 'Ein Angebot ohne Positionen kann nicht versendet werden.');
      if (q.validUntil < today) throw conflict('quotation_validity_in_past', 'Das Gültigkeitsdatum liegt in der Vergangenheit.');
      if (customer && !customer.isAnonymized) snapshotRecipient(q, customer);
      q.status = 'Sent';
      q.sentAt = now;
      q.sentByUserId = ctx.user.id;
    }
    if (recipient) q.recipientEmail = recipient;

    let publicUrl: string | null = null;
    if (body.includePublicLink) {
      publicUrl = publicQuotationUrl(createPublicLink(q).token);
      addEvent(db, q, 'PublicLinkCreated', 'User', ctx.user.id, null, now);
    }
    if (firstSend) addEvent(db, q, 'PdfGenerated', 'System', null, null, now);

    let deliveryId: string | null = null;
    if (isEmail && recipient) {
      const attachPdf = body.attachPdf ?? company.settings.attachPdfToEmails;
      const subject = clean(body.subject) ?? `Ihr Angebot ${q.number} von ${company.name}`;
      captureEmail(db, recipient, subject, emailBody(q, company, clean(body.message), publicUrl, attachPdf), attachPdf ? [quotationPdfFileName(q)] : [], now);
      deliveryId = newId();
      db.deliveries.push({
        id: deliveryId, companyId: company.id, quotationId: q.id, kind: 'QuotationSent', toAddress: recipient, subject, status: 'HandedOff',
        attempts: 1, createdAt: now, handedOffAt: now, nextAttemptAt: null, lastError: null,
      });
      addEvent(db, q, 'Sent', 'User', ctx.user.id, `An ${recipient}`, now);
      addEvent(db, q, 'EmailHandedOff', 'System', null, `An ${recipient}`, now);
      if (firstSend && body.scheduleFollowUps && !customer?.followUpOptOut) {
        const existing = new Set(db.followUps.filter((f) => f.quotationId === q.id).map((f) => f.kind));
        for (const plan of planFollowUps(company.settings, now, q.validUntil).filter((p) => !existing.has(p.kind))) {
          db.followUps.push({ id: newId(), companyId: company.id, quotationId: q.id, kind: plan.kind, dueAt: plan.dueAt, status: 'Scheduled', statusReason: null, processedAt: null });
        }
      }
      addAudit(db, company.id, ctx.user.id, 'quotation.sent', 'Quotation', q.id, q.number, now);
    } else {
      addEvent(db, q, 'MarkedAsSent', 'User', ctx.user.id, 'Ohne E-Mail durch den Anbieter übermittelt', now);
      addAudit(db, company.id, ctx.user.id, 'quotation.marked_sent', 'Quotation', q.id, q.number, now);
    }
    if (firstSend) supersedeOtherRevisions(q, ctx.user.id, now);
    touch(q, now);
    const response: SendQuotationResponse = { quotation: toQuotation(q), publicUrl, emailDeliveryId: deliveryId };
    return json(response);
  }),

  companyRoute('post', '/quotations/:id/accept', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const body = await readJson<Partial<DecisionRequest>>(ctx.request);
    // A user may record a late acceptance (e.g. by phone) on an expired quotation.
    if (q.status !== 'Expired' && !canTransition(q.status, 'Accepted')) throw transitionError(q.status, 'Accepted');
    decideByUser(ctx, q, true, clean(body.note));
    return json(toQuotation(q));
  }),

  companyRoute('post', '/quotations/:id/reject', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const body = await readJson<Partial<DecisionRequest>>(ctx.request);
    if (!canTransition(q.status, 'Rejected')) throw transitionError(q.status, 'Rejected');
    decideByUser(ctx, q, false, clean(body.note));
    return json(toQuotation(q));
  }),

  companyRoute('post', '/quotations/:id/cancel', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const body = await readJson<Partial<CancelRequest>>(ctx.request);
    if (!canTransition(q.status, 'Cancelled')) throw transitionError(q.status, 'Cancelled');
    const now = nowIso();
    const reason = clean(body.reason);
    q.status = 'Cancelled';
    q.cancelledAt = now;
    q.cancellationReason = reason;
    addEvent(db, q, 'Cancelled', 'User', ctx.user.id, reason, now);
    closeOpenEnds(q, 'Angebot storniert', ctx.user.id, now);
    revokePublicLink(q);
    touch(q, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'quotation.cancelled', 'Quotation', q.id, q.number, now);
    return json(toQuotation(q));
  }),

  // ---------- documents, history ----------
  companyRoute('get', '/quotations/:id/pdf', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const bytes = buildQuotationPdf({ company: ctx.company, quotation: q, draft: q.status === 'Draft' });
    return fileResponse(bytes, 'application/pdf', quotationPdfFileName(q), true);
  }),

  companyRoute('get', '/quotations/:id/events', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    return json(db.events.filter((e) => e.quotationId === q.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(toEvent));
  }),

  companyRoute('get', '/quotations/:id/deliveries', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    return json(db.deliveries.filter((d) => d.quotationId === q.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toDelivery));
  }),

  companyRoute('get', '/quotations/:id/follow-ups', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    return json(db.followUps.filter((f) => f.quotationId === q.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map(toFollowUp));
  }),

  companyRoute('post', '/quotations/:id/follow-ups/cancel', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const now = nowIso();
    if (cancelScheduledFollowUps(db, q.id, 'Manuell beendet', now) > 0) {
      addEvent(db, q, 'FollowUpsCancelled', 'User', ctx.user.id, 'Manuell beendet', now);
      touch(q, now);
    }
    return noContent();
  }),

  companyRoute('post', '/quotations/:id/public-link', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    if (q.status === 'Draft' || q.status === 'Cancelled') {
      throw conflict('public_link_unavailable', 'Ein Kundenlink ist erst nach dem Versand und nicht für stornierte Angebote verfügbar.');
    }
    const { token, expiresAt } = createPublicLink(q);
    addEvent(db, q, 'PublicLinkCreated', 'User', ctx.user.id, 'Neuer Link, frühere Links widerrufen');
    touch(q);
    return json({ url: publicQuotationUrl(token), expiresAt });
  }),

  companyRoute('delete', '/quotations/:id/public-link', (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    if (revokePublicLink(q)) {
      addEvent(db, q, 'PublicLinkRevoked', 'User', ctx.user.id);
      touch(q);
    }
    return noContent();
  }),

  companyRoute('post', '/quotations/:id/convert-to-job', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const body = await readJson<Partial<ConvertToJobRequest>>(ctx.request);
    if (q.status !== 'Accepted') throw conflict('quotation_not_accepted', 'Nur angenommene Angebote können in einen Auftrag umgewandelt werden.');
    if (db.jobs.some((j) => j.quotationId === q.id)) throw conflict('already_converted', 'Dieses Angebot wurde bereits in einen Auftrag umgewandelt.');
    if (body.assignedUserId && !db.memberships.some((m) => m.companyId === ctx.company.id && m.userId === body.assignedUserId && m.status === 'Active')) {
      throw validation('assignedUserId', 'Die Person ist kein aktives Mitglied der Firma.');
    }
    if (body.plannedStartDate && body.dueDate && body.dueDate < body.plannedStartDate) {
      throw validation('dueDate', 'Der Fertigstellungstermin darf nicht vor dem geplanten Beginn liegen.');
    }
    ensureWritable(ctx.company.id);
    const now = nowIso();
    const job: JobRec = {
      id: newId(),
      companyId: ctx.company.id,
      number: nextNumber(db, ctx.company.id, 'job', ctx.company.settings.jobPrefix, Number(companyToday(ctx.company).slice(0, 4))),
      title: clean(body.title) ?? q.title,
      description: clean(body.description),
      status: 'Open',
      customerId: q.customerId,
      quotationId: q.id,
      plannedStartDate: body.plannedStartDate ?? null,
      dueDate: body.dueDate ?? null,
      assignedUserId: body.assignedUserId ?? null,
      notes: clean(body.notes),
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      rowVersion: nextRowVersion(db),
    };
    db.jobs.push(job);
    addEvent(db, q, 'ConvertedToJob', 'User', ctx.user.id, job.number, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'job.created', 'Job', job.id, `${job.number} aus ${q.number}`, now);
    touch(q, now);
    return json(toJob(job), 201);
  }),

  companyRoute('post', '/quotations/:id/save-as-template', async (ctx) => {
    const q = findQuotation(ctx, ctx.params.id);
    const body = await readJson<Partial<SaveAsTemplateRequest>>(ctx.request);
    const name = clean(body.name);
    if (!name) throw validation('name', 'Bitte geben Sie einen Namen für die Vorlage ein.');
    ensureWritable(ctx.company.id);
    const now = nowIso();
    const template: TemplateRec = {
      id: newId(),
      companyId: ctx.company.id,
      name,
      description: clean(body.description),
      introText: q.introText,
      closingText: q.closingText,
      terms: q.terms,
      taxMode: q.taxMode,
      lineItems: q.lineItems.map((i) => ({
        id: newId(), position: i.position, title: i.title, description: i.description, quantity: i.quantity, unit: i.unit,
        unitPriceNet: i.unitPriceNet, discountPercent: i.discountPercent, taxRatePercent: i.taxRatePercent,
      })),
      createdAt: now,
      updatedAt: now,
    };
    db.templates.push(template);
    addAudit(db, ctx.company.id, ctx.user.id, 'template.created', 'Template', template.id, `${template.name} aus ${q.number}`, now);
    return json(toTemplate(template), 201);
  }),
];

function decideByUser(ctx: CompanyCtx, q: QuotationRec, accepted: boolean, note: string | null): void {
  ensureWritable(ctx.company.id);
  const now = nowIso();
  q.status = accepted ? 'Accepted' : 'Rejected';
  q.decidedAt = now;
  q.decidedByActor = 'User';
  q.decidedByUserId = ctx.user.id;
  q.decisionName = null;
  q.decisionNote = note;
  addEvent(db, q, accepted ? 'Accepted' : 'Rejected', 'User', ctx.user.id, `Vom Anbieter erfasst${note ? `: ${note}` : ''}`, now);
  closeOpenEnds(q, accepted ? 'Angebot angenommen' : 'Angebot abgelehnt', ctx.user.id, now);
  touch(q, now);
  addAudit(db, ctx.company.id, ctx.user.id, accepted ? 'quotation.accepted' : 'quotation.rejected', 'Quotation', q.id, q.number, now);
}

// Re-exported for the public routes.
export { allowedTransitions, badRequest };
