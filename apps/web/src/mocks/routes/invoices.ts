// /companies/:companyId/invoices endpoints plus the "create invoice from job/quotation" routes
// (mirrors InvoiceService of the API: drafts without number, gap-free numbering at issue, payments,
// cancellation invoices, reminders, PDF with ENTWURF marker for drafts and the e-invoice XML for issued invoices).
import {
  addDaysIso,
  formatDate,
  formatEur,
  type CancelRequest,
  type CreateInvoiceRequest,
  type LineItemInput,
  type PaymentReminderRequest,
  type RecordPaymentRequest,
  type SendInvoiceRequest,
  type SendInvoiceResponse,
  type TaxMode,
  type UpdateInvoiceRequest,
} from '@angebotpilot/api-contracts';
import type { HttpHandler } from 'msw';
import { db } from '../db';
import {
  addAudit,
  addInvoiceEvent,
  applyInvoicePayments,
  captureEmail,
  companyToday,
  INVOICE_STATUS_LABELS,
  invoiceCompanyProblems,
  invoiceDaysOverdue,
  invoiceIssueProblems,
  invoiceOpenAmount,
  invoicePdfFileName,
  invoiceTotals,
  invoiceXmlFileName,
  isInvoiceOpen,
} from '../domain';
import {
  buildLineItems,
  newId,
  nextNumber,
  nextRowVersion,
  nowIso,
  snapshotInvoiceRecipient,
  type CompanyRec,
  type CustomerRec,
  type InvoiceRec,
  type QuotationRec,
} from '../model';
import { buildInvoicePdf } from '../pdf';
import { ensureEmailQuota, ensureWritable } from './billing';
import {
  clean,
  companyRoute,
  concurrencyConflict,
  conflict,
  csvDate,
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
  problem,
  readJson,
  sortBy,
  validation,
  type CompanyCtx,
} from './http';
import { activeInvoices, toDelivery, toInvoice, toInvoiceEvent, toInvoiceListItem } from './mappers';
import { validateLineItems } from './quotations';

const TAX_MODES: TaxMode[] = ['Standard', 'SmallBusiness', 'ReverseCharge'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ONLY = 'Rechnungen stellen, versenden, Zahlungen erfassen und stornieren dürfen nur Inhaber:innen und Admins.';

function requireAdmin(ctx: CompanyCtx): void {
  if (ctx.membership.role === 'Employee') throw problem(403, 'forbidden', ADMIN_ONLY);
}

export function findInvoice(ctx: CompanyCtx, id: string | undefined): InvoiceRec {
  const invoice = db.invoices.find((x) => x.id === id && x.companyId === ctx.company.id && !x.deletedAt);
  if (!invoice) throw notFound('Die Rechnung wurde nicht gefunden.');
  return invoice;
}

function touch(i: InvoiceRec, at: string = nowIso()): void {
  i.updatedAt = at;
  i.rowVersion = nextRowVersion(db);
}

const dto = (ctx: CompanyCtx, i: InvoiceRec) => toInvoice(i, ctx.membership.role);

function ensureEditable(i: InvoiceRec): void {
  if (i.status !== 'Draft') {
    throw conflict('invoice_not_editable', 'Gestellte Rechnungen können nicht mehr geändert werden. Stornieren Sie die Rechnung und erstellen Sie eine neue.');
  }
}

/** New draft for a customer with the defaults of the company settings (InvoiceService.NewDraft). */
function newDraft(company: CompanyRec, customer: CustomerRec, userId: string, now: string, issueDate: string): InvoiceRec {
  const s = company.settings;
  const invoice: InvoiceRec = {
    id: newId(),
    companyId: company.id,
    customerId: customer.id,
    number: null,
    kind: 'Invoice',
    status: 'Draft',
    title: 'Rechnung',
    recipientName: '',
    recipientContact: null,
    recipientAddress: null,
    recipientStreet: null,
    recipientPostalCode: null,
    recipientCity: null,
    recipientEmail: null,
    recipientVatId: null,
    issueDate,
    serviceDateFrom: issueDate,
    serviceDateTo: null,
    dueDate: addDaysIso(issueDate, s.invoicePaymentDays),
    taxMode: s.defaultTaxMode,
    introText: s.invoiceIntroText,
    closingText: s.invoiceClosingText,
    paymentTerms: null,
    buyerReference: null,
    internalNotes: null,
    currency: 'EUR',
    lineItems: [],
    paidAmount: 0,
    paidOn: null,
    quotationId: null,
    quotationNumber: null,
    jobId: null,
    jobNumber: null,
    cancelledInvoiceId: null,
    cancelledInvoiceNumber: null,
    cancellationInvoiceId: null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
    issuedAt: null,
    issuedByUserId: null,
    sentAt: null,
    cancelledAt: null,
    cancellationReason: null,
    lastReminderAt: null,
    reminderCount: 0,
    deletedAt: null,
    rowVersion: nextRowVersion(db),
  };
  snapshotInvoiceRecipient(invoice, customer);
  return invoice;
}

/** Draft prefilled from a quotation (line items copied). */
export function invoiceFromQuotation(company: CompanyRec, q: QuotationRec, userId: string, title: string, serviceDate: string | null, now = nowIso()): InvoiceRec {
  const customer = db.customers.find((c) => c.id === q.customerId);
  if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
  const today = companyToday(company);
  const invoice = newDraft(company, customer, userId, now, today);
  if (customer.isAnonymized) {
    invoice.recipientName = q.recipientName;
    invoice.recipientContact = q.recipientContact;
    invoice.recipientAddress = q.recipientAddress;
  }
  invoice.title = title;
  invoice.serviceDateFrom = serviceDate ?? today;
  invoice.taxMode = q.taxMode;
  invoice.quotationId = q.id;
  invoice.quotationNumber = q.number;
  invoice.lineItems = buildLineItems([...q.lineItems].sort((a, b) => a.position - b.position));
  return invoice;
}

function filterInvoices(company: CompanyRec, query: URLSearchParams): InvoiceRec[] {
  let items = activeInvoices(company.id);
  const today = companyToday(company);
  const statuses = listParam(query, 'status');
  // Regular invoices match by status; cancellation invoices are only listed when the filter contains "Cancelled".
  if (statuses.length > 0) {
    items = items.filter((i) => (i.kind === 'Cancellation' ? statuses.includes('Cancelled') : statuses.includes(i.status)));
  }
  if (query.get('overdue') === 'true') items = items.filter((i) => invoiceDaysOverdue(i, today) > 0);
  const customerId = query.get('customerId');
  if (customerId) items = items.filter((i) => i.customerId === customerId);
  const from = query.get('from');
  if (from) items = items.filter((i) => i.issueDate >= from);
  const to = query.get('to');
  if (to) items = items.filter((i) => i.issueDate <= to);
  const search = clean(query.get('search'));
  if (search) {
    items = items.filter((i) => [i.number, i.title, i.recipientName, i.quotationNumber, i.jobNumber].some((v) => includesCi(v, search)));
  }
  return items;
}

interface DraftFields {
  title: string | null;
  issueDate: string | null;
  serviceDateFrom: string | null;
  serviceDateTo: string | null;
  dueDate: string | null;
}

function validateDates(errors: FieldErrors, body: Partial<DraftFields>, requireAll: boolean): void {
  for (const key of ['issueDate', 'dueDate'] as const) {
    const value = body[key];
    if (value ? !ISO_DATE.test(value) : requireAll) errors.add(key, 'Bitte ein gültiges Datum angeben.');
  }
  for (const key of ['serviceDateFrom', 'serviceDateTo'] as const) {
    const value = body[key];
    if (value && !ISO_DATE.test(value)) errors.add(key, 'Bitte ein gültiges Datum angeben.');
  }
  if (body.serviceDateFrom && body.serviceDateTo && body.serviceDateTo < body.serviceDateFrom) {
    errors.add('serviceDateTo', 'Das Ende des Leistungszeitraums muss nach dem Beginn liegen.');
  }
  if (body.issueDate && body.dueDate && body.dueDate < body.issueDate) {
    errors.add('dueDate', 'Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.');
  } else if (body.issueDate && body.dueDate && body.dueDate > addDaysIso(body.issueDate, 365)) {
    errors.add('dueDate', 'Das Zahlungsziel darf höchstens ein Jahr betragen.');
  }
}

function senderOrThrow(ctx: CompanyCtx): void {
  if (!ctx.user.emailVerified) {
    throw conflict('email_not_verified', 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Rechnungen per E-Mail versendet werden.');
  }
}

function recipientOrThrow(requested: string | null | undefined, i: InvoiceRec): string {
  const recipient = clean(requested) ?? i.recipientEmail;
  if (!recipient) throw validation('recipientEmail', 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.');
  if (!EMAIL_RE.test(recipient)) throw validation('recipientEmail', 'Bitte gültige E-Mail-Adresse angeben.');
  return recipient;
}

function pushDelivery(company: CompanyRec, i: InvoiceRec, kind: 'InvoiceSent' | 'PaymentReminder', to: string, subject: string, now: string): string {
  const id = newId();
  db.deliveries.push({
    id, companyId: company.id, quotationId: null, invoiceId: i.id, kind, toAddress: to, subject, status: 'HandedOff', attempts: 1,
    createdAt: now, handedOffAt: now, nextAttemptAt: null, lastError: null,
  });
  return id;
}

function xmlEscape(value: string | null | undefined): string {
  return (value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Minimal UN/CEFACT CII document (EN 16931 profile) – enough to download and inspect in the mock. */
function buildInvoiceXml(company: CompanyRec, i: InvoiceRec): string {
  const totals = invoiceTotals(i);
  const sign = i.kind === 'Cancellation' ? -1 : 1;
  const amount = (v: number) => (sign * v).toFixed(2);
  const date = (iso: string | null) => (iso ? iso.replace(/-/g, '') : '');
  const lines = i.lineItems
    .map(
      (l) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${l.position}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${xmlEscape(l.title)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l.unitPriceNet.toFixed(2)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:RateApplicablePercent>${i.taxMode === 'Standard' ? l.taxRatePercent : 0}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(l.lineNet)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xmlEscape(i.number)}</ram:ID>
    <ram:TypeCode>${i.kind === 'Cancellation' ? '381' : '380'}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${date(i.issueDate)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
      ${i.buyerReference ? `<ram:BuyerReference>${xmlEscape(i.buyerReference)}</ram:BuyerReference>` : ''}
      <ram:SellerTradeParty><ram:Name>${xmlEscape(company.name)}</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${xmlEscape(i.recipientName)}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${date(i.serviceDateFrom)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${date(i.dueDate)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amount(totals.netTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amount(totals.netTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amount(totals.taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amount(totals.grossTotal)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amount(i.kind === 'Cancellation' ? totals.grossTotal : totals.grossTotal - i.paidAmount)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

function readLineItems(errors: FieldErrors, items: unknown): LineItemInput[] {
  return validateLineItems(errors, items ?? [], false);
}

export const invoiceHandlers: HttpHandler[] = [
  // ---------- static paths first (before /invoices/:id) ----------
  companyRoute('get', '/invoices/export.csv', ({ company, query, user }) => {
    const rows = filterInvoices(company, query)
      .filter((i) => i.number !== null)
      .sort((a, b) => (a.number ?? '').localeCompare(b.number ?? ''))
      .map((i) => {
        const t = invoiceTotals(i);
        const sign = i.kind === 'Cancellation' ? -1 : 1;
        return [
          i.number, i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung', i.kind === 'Cancellation' ? 'Storno' : INVOICE_STATUS_LABELS[i.status], i.title,
          i.recipientName, csvDate(i.issueDate), csvDate(i.serviceDateFrom), csvDate(i.serviceDateTo), csvDate(i.dueDate), csvMoney(sign * t.netTotal),
          csvMoney(sign * t.taxTotal), csvMoney(sign * t.grossTotal), csvMoney(i.paidAmount), csvDate(i.paidOn), i.cancelledInvoiceNumber,
        ];
      });
    addAudit(db, company.id, user.id, 'invoice.exported', 'Invoice', null, `${rows.length} Rechnungen`);
    return csvResponse('rechnungen.csv', [
      'Nummer', 'Art', 'Status', 'Betreff', 'Kunde', 'Rechnungsdatum', 'Leistung von', 'Leistung bis', 'Fällig am', 'Netto (EUR)', 'USt. (EUR)',
      'Brutto (EUR)', 'Bezahlt (EUR)', 'Bezahlt am', 'Storno zu',
    ], rows);
  }, 'Admin'),

  // ---------- list / CRUD ----------
  companyRoute('get', '/invoices', ({ company, query }) => {
    const items = sortBy(filterInvoices(company, query), query.get('sort'), {
      updatedAt: (i) => i.updatedAt,
      number: (i) => i.number,
      issueDate: (i) => `${i.issueDate}|${i.number ?? ''}`,
      dueDate: (i) => i.dueDate,
      grossTotal: (i) => invoiceTotals(i).grossTotal,
    }, '-updatedAt');
    return json(paginate(items.map(toInvoiceListItem), query));
  }),

  companyRoute('get', '/invoices/:id', (ctx) => json(dto(ctx, findInvoice(ctx, ctx.params.id)))),

  companyRoute('post', '/invoices', async (ctx) => {
    const { company, user } = ctx;
    const body = await readJson<Partial<CreateInvoiceRequest>>(ctx.request);
    const errors = new FieldErrors();
    if (!body.customerId) errors.add('customerId', 'Bitte Kunden auswählen.');
    if (body.taxMode && !TAX_MODES.includes(body.taxMode)) errors.add('taxMode', 'Bitte eine Steuerart wählen.');
    validateDates(errors, body, false);
    const items = readLineItems(errors, body.lineItems);
    errors.throwIfAny();
    const customer = db.customers.find((c) => c.id === body.customerId && c.companyId === company.id);
    if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
    if (customer.isArchived) throw conflict('customer_archived', 'Für archivierte Kunden können keine neuen Rechnungen erstellt werden.');
    ensureWritable(company.id);
    const now = nowIso();
    const issueDate = body.issueDate ?? companyToday(company);
    const invoice = newDraft(company, customer, user.id, now, issueDate);
    invoice.title = clean(body.title) ?? 'Rechnung';
    invoice.serviceDateFrom = body.serviceDateFrom ?? issueDate;
    invoice.serviceDateTo = body.serviceDateTo ?? null;
    invoice.dueDate = body.dueDate ?? addDaysIso(issueDate, company.settings.invoicePaymentDays);
    invoice.taxMode = body.taxMode ?? company.settings.defaultTaxMode;
    invoice.introText = body.introText === undefined || body.introText === null ? company.settings.invoiceIntroText : clean(body.introText);
    invoice.closingText = body.closingText === undefined || body.closingText === null ? company.settings.invoiceClosingText : clean(body.closingText);
    invoice.paymentTerms = clean(body.paymentTerms);
    invoice.buyerReference = clean(body.buyerReference);
    invoice.internalNotes = clean(body.internalNotes);
    invoice.lineItems = buildLineItems(items);
    db.invoices.push(invoice);
    addInvoiceEvent(db, invoice, 'Created', 'User', user.id, null, now);
    addAudit(db, company.id, user.id, 'invoice.created', 'Invoice', invoice.id, `${invoice.title} für ${invoice.recipientName}`, now);
    return json(dto(ctx, invoice), 201);
  }),

  companyRoute('put', '/invoices/:id', async (ctx) => {
    const invoice = findInvoice(ctx, ctx.params.id);
    ensureEditable(invoice);
    const body = await readJson<Partial<UpdateInvoiceRequest>>(ctx.request);
    if (body.rowVersion !== invoice.rowVersion) throw concurrencyConflict();
    const errors = new FieldErrors();
    if (!body.customerId) errors.add('customerId', 'Bitte Kunden auswählen.');
    if (!clean(body.title)) errors.add('title', 'Bitte Betreff angeben.');
    if (!body.taxMode || !TAX_MODES.includes(body.taxMode)) errors.add('taxMode', 'Bitte eine Steuerart wählen.');
    if (body.buyerReference && body.buyerReference.length > 100) errors.add('buyerReference', 'Maximal 100 Zeichen.');
    validateDates(errors, body, true);
    const items = readLineItems(errors, body.lineItems);
    errors.throwIfAny();
    const customer = db.customers.find((c) => c.id === body.customerId && c.companyId === ctx.company.id);
    if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
    ensureWritable(ctx.company.id);
    const now = nowIso();
    invoice.customerId = customer.id;
    invoice.title = clean(body.title) ?? invoice.title;
    invoice.issueDate = body.issueDate ?? invoice.issueDate;
    invoice.serviceDateFrom = body.serviceDateFrom ?? null;
    invoice.serviceDateTo = body.serviceDateTo ?? null;
    invoice.dueDate = body.dueDate ?? invoice.dueDate;
    invoice.taxMode = body.taxMode ?? invoice.taxMode;
    invoice.introText = clean(body.introText);
    invoice.closingText = clean(body.closingText);
    invoice.paymentTerms = clean(body.paymentTerms);
    invoice.buyerReference = clean(body.buyerReference);
    invoice.internalNotes = clean(body.internalNotes);
    if (!customer.isAnonymized) snapshotInvoiceRecipient(invoice, customer);
    invoice.lineItems = buildLineItems(items);
    touch(invoice, now);
    addInvoiceEvent(db, invoice, 'Updated', 'User', ctx.user.id, null, now);
    return json(dto(ctx, invoice));
  }),

  companyRoute('delete', '/invoices/:id', (ctx) => {
    const invoice = findInvoice(ctx, ctx.params.id);
    if (invoice.status !== 'Draft') {
      throw conflict('invoice_not_deletable', 'Gestellte Rechnungen können nicht gelöscht werden. Stornieren Sie die Rechnung stattdessen.');
    }
    invoice.deletedAt = nowIso();
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.deleted', 'Invoice', invoice.id, invoice.title);
    return noContent();
  }),

  companyRoute('post', '/invoices/:id/duplicate', (ctx) => {
    const source = findInvoice(ctx, ctx.params.id);
    if (source.kind === 'Cancellation') throw conflict('invoice_not_duplicable', 'Stornorechnungen können nicht kopiert werden.');
    const customer = db.customers.find((c) => c.id === source.customerId);
    if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
    ensureWritable(ctx.company.id);
    const now = nowIso();
    const today = companyToday(ctx.company);
    const copy = newDraft(ctx.company, customer, ctx.user.id, now, today);
    if (customer.isAnonymized) {
      Object.assign(copy, {
        recipientName: source.recipientName, recipientContact: source.recipientContact, recipientAddress: source.recipientAddress,
        recipientStreet: source.recipientStreet, recipientPostalCode: source.recipientPostalCode, recipientCity: source.recipientCity,
        recipientEmail: source.recipientEmail, recipientVatId: source.recipientVatId,
      });
    }
    copy.title = source.title;
    copy.taxMode = source.taxMode;
    copy.introText = source.introText;
    copy.closingText = source.closingText;
    copy.paymentTerms = source.paymentTerms;
    copy.buyerReference = source.buyerReference;
    copy.internalNotes = source.internalNotes;
    copy.lineItems = buildLineItems([...source.lineItems].sort((a, b) => a.position - b.position));
    db.invoices.push(copy);
    const label = source.number ?? 'Entwurf';
    addInvoiceEvent(db, copy, 'Created', 'User', ctx.user.id, `Kopie von ${label}`, now);
    addInvoiceEvent(db, source, 'Duplicated', 'User', ctx.user.id, 'Als neuer Entwurf kopiert', now);
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.created', 'Invoice', copy.id, `Kopie von ${label}`, now);
    return json(dto(ctx, copy), 201);
  }),

  // ---------- issue / send ----------
  companyRoute('post', '/invoices/:id/issue', (ctx) => {
    requireAdmin(ctx);
    const invoice = findInvoice(ctx, ctx.params.id);
    ensureEditable(invoice);
    ensureWritable(ctx.company.id);
    const customer = db.customers.find((c) => c.id === invoice.customerId);
    if (customer && !customer.isAnonymized) snapshotInvoiceRecipient(invoice, customer);
    const today = companyToday(ctx.company);
    const problems = [...invoiceCompanyProblems(ctx.company, invoice.taxMode), ...invoiceIssueProblems(invoice, today)];
    if (problems.length > 0) throw conflict('invoice_incomplete', `Die Rechnung kann noch nicht gestellt werden: ${problems.join(' ')}`);
    const now = nowIso();
    const number = nextNumber(db, ctx.company.id, 'invoice', ctx.company.settings.invoicePrefix, Number(invoice.issueDate.slice(0, 4)));
    invoice.number = number;
    invoice.status = 'Issued';
    invoice.issuedAt = now;
    invoice.issuedByUserId = ctx.user.id;
    touch(invoice, now);
    addInvoiceEvent(db, invoice, 'Issued', 'User', ctx.user.id, number, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.issued', 'Invoice', invoice.id, `${number} · ${formatEur(invoiceTotals(invoice).grossTotal)}`, now);
    return json(dto(ctx, invoice));
  }),

  companyRoute('post', '/invoices/:id/send', async (ctx) => {
    requireAdmin(ctx);
    const invoice = findInvoice(ctx, ctx.params.id);
    const body = await readJson<Partial<SendInvoiceRequest>>(ctx.request);
    if (body.mode !== 'Email' && body.mode !== 'Manual') throw validation('mode', 'Bitte wählen Sie die Versandart.');
    if (invoice.status === 'Draft') {
      throw conflict('invoice_not_issued', 'Bitte stellen Sie die Rechnung zuerst (Rechnungsnummer vergeben), bevor Sie sie versenden.');
    }
    const now = nowIso();
    let deliveryId: string | null = null;
    if (body.mode === 'Email') {
      senderOrThrow(ctx);
      const recipient = recipientOrThrow(body.recipientEmail, invoice);
      ensureEmailQuota(ctx.company.id);
      const gross = invoiceTotals(invoice).grossTotal;
      const subject = clean(body.subject) ?? `Ihre Rechnung ${invoice.number} von ${ctx.company.name}`;
      const text = [
        clean(body.message) ?? `Guten Tag,\n\nanbei erhalten Sie unsere Rechnung ${invoice.number} über ${formatEur(gross)}. Bitte begleichen Sie den Betrag bis zum ${formatDate(invoice.dueDate)}.`,
        `Die Rechnung finden Sie als PDF im Anhang (${invoicePdfFileName(invoice)}); sie enthält die E-Rechnung im ZUGFeRD-Format.`,
        ctx.company.settings.emailSignature ?? `Mit freundlichen Grüßen\n${ctx.company.name}`,
      ].join('\n\n');
      captureEmail(db, recipient, subject, text, [invoicePdfFileName(invoice)], now);
      deliveryId = pushDelivery(ctx.company, invoice, 'InvoiceSent', recipient, subject, now);
      addInvoiceEvent(db, invoice, 'Sent', 'User', ctx.user.id, `An ${recipient}`, now);
      addInvoiceEvent(db, invoice, 'EmailHandedOff', 'System', null, `An ${recipient}`, now);
      addAudit(db, ctx.company.id, ctx.user.id, 'invoice.sent', 'Invoice', invoice.id, invoice.number, now);
    } else {
      ensureWritable(ctx.company.id);
      addInvoiceEvent(db, invoice, 'MarkedAsSent', 'User', ctx.user.id, 'Ohne E-Mail übermittelt (z. B. per Post)', now);
      addAudit(db, ctx.company.id, ctx.user.id, 'invoice.marked_sent', 'Invoice', invoice.id, invoice.number, now);
    }
    invoice.sentAt ??= now;
    touch(invoice, now);
    const response: SendInvoiceResponse = { invoice: dto(ctx, invoice), emailDeliveryId: deliveryId };
    return json(response);
  }),

  // ---------- payments ----------
  companyRoute('post', '/invoices/:id/payments', async (ctx) => {
    requireAdmin(ctx);
    const invoice = findInvoice(ctx, ctx.params.id);
    const body = await readJson<Partial<RecordPaymentRequest>>(ctx.request);
    const errors = new FieldErrors();
    const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) ? body.amount : Number.NaN;
    if (!(amount > 0)) errors.add('amount', 'Der Betrag muss größer als 0 € sein.');
    else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) errors.add('amount', 'Höchstens 2 Nachkommastellen.');
    if (!body.paidOn || !ISO_DATE.test(body.paidOn)) errors.add('paidOn', 'Bitte Zahlungsdatum angeben.');
    else if (body.paidOn > companyToday(ctx.company)) errors.add('paidOn', 'Das Zahlungsdatum darf nicht in der Zukunft liegen.');
    if (body.method && body.method.length > 50) errors.add('method', 'Maximal 50 Zeichen.');
    if (body.note && body.note.length > 500) errors.add('note', 'Maximal 500 Zeichen.');
    errors.throwIfAny();
    if (!isInvoiceOpen(invoice)) {
      throw conflict('invoice_not_payable', invoice.status === 'Paid'
        ? 'Diese Rechnung ist bereits vollständig bezahlt.'
        : 'Zahlungen können nur für gestellte, offene Rechnungen erfasst werden.');
    }
    const open = invoiceOpenAmount(invoice);
    if (amount > open + 0.001) throw conflict('payment_exceeds_open_amount', `Der Betrag übersteigt den offenen Betrag von ${formatEur(open)}.`);
    ensureWritable(ctx.company.id);
    const now = nowIso();
    db.invoicePayments.push({
      id: newId(), companyId: ctx.company.id, invoiceId: invoice.id, amount: Math.round(amount * 100) / 100, paidOn: body.paidOn ?? companyToday(ctx.company),
      method: clean(body.method), note: clean(body.note), createdAt: now, createdByUserId: ctx.user.id,
    });
    applyInvoicePayments(db, invoice, now);
    touch(invoice, now);
    addInvoiceEvent(db, invoice, 'PaymentRecorded', 'User', ctx.user.id, `${formatEur(amount)} am ${formatDate(body.paidOn)}`, now);
    if (invoice.status === 'Paid') {
      addInvoiceEvent(db, invoice, 'Paid', 'User', ctx.user.id, null, now);
      for (const d of db.deliveries) {
        if (d.invoiceId === invoice.id && d.kind === 'PaymentReminder' && (d.status === 'Pending' || d.status === 'RetryScheduled')) {
          d.status = 'Cancelled';
          d.lastError = 'Rechnung bezahlt';
        }
      }
    }
    addAudit(db, ctx.company.id, ctx.user.id, invoice.status === 'Paid' ? 'invoice.paid' : 'invoice.payment_recorded', 'Invoice', invoice.id,
      `${invoice.number}: ${formatEur(amount)}`, now);
    return json(dto(ctx, invoice));
  }),

  companyRoute('delete', '/invoices/:id/payments/:paymentId', (ctx) => {
    requireAdmin(ctx);
    const invoice = findInvoice(ctx, ctx.params.id);
    const payment = db.invoicePayments.find((p) => p.id === ctx.params.paymentId && p.invoiceId === invoice.id);
    if (!payment) throw notFound('Die Zahlung wurde nicht gefunden.');
    if (invoice.status !== 'PartiallyPaid' && invoice.status !== 'Paid') {
      throw conflict('payment_not_removable', 'Zahlungen stornierter Rechnungen können nicht mehr geändert werden.');
    }
    ensureWritable(ctx.company.id);
    const now = nowIso();
    db.invoicePayments = db.invoicePayments.filter((p) => p.id !== payment.id);
    applyInvoicePayments(db, invoice, now);
    touch(invoice, now);
    addInvoiceEvent(db, invoice, 'PaymentRemoved', 'User', ctx.user.id, `${formatEur(payment.amount)} vom ${formatDate(payment.paidOn)}`, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.payment_removed', 'Invoice', invoice.id, `${invoice.number}: ${formatEur(payment.amount)}`, now);
    return json(dto(ctx, invoice));
  }),

  companyRoute('post', '/invoices/:id/remind', async (ctx) => {
    requireAdmin(ctx);
    const invoice = findInvoice(ctx, ctx.params.id);
    const body = await readJson<Partial<PaymentReminderRequest>>(ctx.request);
    if (!isInvoiceOpen(invoice)) throw conflict('invoice_not_open', 'Zahlungserinnerungen sind nur für offene Rechnungen möglich.');
    senderOrThrow(ctx);
    const recipient = recipientOrThrow(body.recipientEmail, invoice);
    ensureEmailQuota(ctx.company.id);
    const now = nowIso();
    invoice.reminderCount += 1;
    invoice.lastReminderAt = now;
    const subject = `Zahlungserinnerung: Rechnung ${invoice.number}`;
    const text = [
      `Guten Tag,\n\nsicher ist es Ihrer Aufmerksamkeit entgangen: Unsere Rechnung ${invoice.number} vom ${formatDate(invoice.issueDate)} über ${formatEur(invoiceOpenAmount(invoice))} war am ${formatDate(invoice.dueDate)} fällig.`,
      clean(body.message),
      ctx.company.settings.emailSignature ?? `Mit freundlichen Grüßen\n${ctx.company.name}`,
    ].filter(Boolean).join('\n\n');
    captureEmail(db, recipient, subject, text, [invoicePdfFileName(invoice)], now);
    const deliveryId = pushDelivery(ctx.company, invoice, 'PaymentReminder', recipient, subject, now);
    touch(invoice, now);
    addInvoiceEvent(db, invoice, 'ReminderQueued', 'User', ctx.user.id, `Zahlungserinnerung an ${recipient}`, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.reminder_sent', 'Invoice', invoice.id, invoice.number, now);
    const response: SendInvoiceResponse = { invoice: dto(ctx, invoice), emailDeliveryId: deliveryId };
    return json(response);
  }),

  // ---------- cancellation ----------
  companyRoute('post', '/invoices/:id/cancel', async (ctx) => {
    requireAdmin(ctx);
    const original = findInvoice(ctx, ctx.params.id);
    const body = await readJson<Partial<CancelRequest>>(ctx.request);
    if (original.kind === 'Cancellation' || original.status === 'Draft' || original.status === 'Cancelled') {
      throw conflict('invoice_not_cancellable', original.status === 'Draft' ? 'Entwürfe werden gelöscht, nicht storniert.' : 'Diese Rechnung kann nicht storniert werden.');
    }
    ensureWritable(ctx.company.id);
    const now = nowIso();
    const today = companyToday(ctx.company);
    const reason = clean(body.reason);
    const number = nextNumber(db, ctx.company.id, 'invoice', ctx.company.settings.invoicePrefix, Number(today.slice(0, 4)));
    const storno: InvoiceRec = {
      ...original,
      id: newId(),
      number,
      kind: 'Cancellation',
      status: 'Issued',
      title: `Storno: ${original.title}`,
      issueDate: today,
      dueDate: today,
      introText: `hiermit stornieren wir unsere Rechnung ${original.number} vom ${formatDate(original.issueDate)} in voller Höhe.${reason ? ` Grund: ${reason}` : ''}`,
      closingText: original.paidAmount > 0
        ? `Bereits geleistete Zahlungen in Höhe von ${formatEur(original.paidAmount)} erstatten bzw. verrechnen wir mit Ihnen.`
        : null,
      paymentTerms: null,
      internalNotes: null,
      lineItems: buildLineItems([...original.lineItems].sort((a, b) => a.position - b.position)),
      paidAmount: 0,
      paidOn: null,
      cancelledInvoiceId: original.id,
      cancelledInvoiceNumber: original.number,
      cancellationInvoiceId: null,
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
      issuedAt: now,
      issuedByUserId: ctx.user.id,
      sentAt: null,
      cancelledAt: null,
      cancellationReason: null,
      lastReminderAt: null,
      reminderCount: 0,
      deletedAt: null,
      rowVersion: nextRowVersion(db),
    };
    db.invoices.push(storno);
    addInvoiceEvent(db, storno, 'Issued', 'User', ctx.user.id, `Stornorechnung zu ${original.number}`, now);

    original.status = 'Cancelled';
    original.cancellationInvoiceId = storno.id;
    original.cancelledAt = now;
    original.cancellationReason = reason;
    touch(original, now);
    addInvoiceEvent(db, original, 'Cancelled', 'User', ctx.user.id, reason, now);
    addInvoiceEvent(db, original, 'CancellationCreated', 'User', ctx.user.id, number, now);
    for (const d of db.deliveries) {
      if (d.invoiceId === original.id && d.kind === 'PaymentReminder' && (d.status === 'Pending' || d.status === 'RetryScheduled')) {
        d.status = 'Cancelled';
        d.lastError = 'Rechnung storniert';
      }
    }
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.cancelled', 'Invoice', original.id, `${original.number} → Storno ${number}`, now);
    return json(dto(ctx, original));
  }),

  // ---------- documents, history ----------
  companyRoute('get', '/invoices/:id/pdf', (ctx) => {
    const invoice = findInvoice(ctx, ctx.params.id);
    return fileResponse(buildInvoicePdf({ company: ctx.company, invoice }), 'application/pdf', invoicePdfFileName(invoice), true);
  }),

  companyRoute('get', '/invoices/:id/xml', (ctx) => {
    const invoice = findInvoice(ctx, ctx.params.id);
    if (invoice.status === 'Draft') throw conflict('einvoice_unavailable', 'Die E-Rechnung wird erst beim Stellen der Rechnung erzeugt.');
    return fileResponse(buildInvoiceXml(ctx.company, invoice), 'application/xml', invoiceXmlFileName(invoice));
  }),

  companyRoute('get', '/invoices/:id/events', (ctx) => {
    const invoice = findInvoice(ctx, ctx.params.id);
    return json(db.invoiceEvents.filter((e) => e.invoiceId === invoice.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(toInvoiceEvent));
  }),

  companyRoute('get', '/invoices/:id/deliveries', (ctx) => {
    const invoice = findInvoice(ctx, ctx.params.id);
    return json(db.deliveries.filter((d) => d.invoiceId === invoice.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toDelivery));
  }),

  // ---------- drafts from jobs and quotations ----------
  companyRoute('post', '/jobs/:id/invoice', (ctx) => {
    const job = db.jobs.find((j) => j.companyId === ctx.company.id && j.id === ctx.params.id);
    if (!job) throw notFound('Der Auftrag wurde nicht gefunden.');
    const q = db.quotations.find((x) => x.id === job.quotationId);
    if (!q) throw notFound('Das Angebot zum Auftrag wurde nicht gefunden.');
    ensureWritable(ctx.company.id);
    const now = nowIso();
    const serviceDate = job.completedAt ? job.completedAt.slice(0, 10) : null;
    const invoice = invoiceFromQuotation(ctx.company, q, ctx.user.id, job.title, serviceDate, now);
    invoice.jobId = job.id;
    invoice.jobNumber = job.number;
    db.invoices.push(invoice);
    addInvoiceEvent(db, invoice, 'Created', 'User', ctx.user.id, `Aus Auftrag ${job.number}`, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.created', 'Invoice', invoice.id, `aus Auftrag ${job.number}`, now);
    return json(dto(ctx, invoice), 201);
  }),

  companyRoute('post', '/quotations/:id/invoice', (ctx) => {
    const q = db.quotations.find((x) => x.id === ctx.params.id && x.companyId === ctx.company.id && !x.deletedAt);
    if (!q) throw notFound('Das Angebot wurde nicht gefunden.');
    if (q.status !== 'Accepted') throw conflict('quotation_not_accepted', 'Nur angenommene Angebote können abgerechnet werden.');
    ensureWritable(ctx.company.id);
    const now = nowIso();
    const job = db.jobs.find((j) => j.quotationId === q.id);
    const invoice = invoiceFromQuotation(ctx.company, q, ctx.user.id, q.title, null, now);
    invoice.jobId = job?.id ?? null;
    invoice.jobNumber = job?.number ?? null;
    db.invoices.push(invoice);
    addInvoiceEvent(db, invoice, 'Created', 'User', ctx.user.id, `Aus Angebot ${q.number}`, now);
    addAudit(db, ctx.company.id, ctx.user.id, 'invoice.created', 'Invoice', invoice.id, `aus Angebot ${q.number}`, now);
    return json(dto(ctx, invoice), 201);
  }),
];
