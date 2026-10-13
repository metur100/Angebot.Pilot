// /companies/:companyId/customers endpoints.
import type { CustomerType, UpsertCustomerRequest } from '@angebotpilot/api-contracts';
import type { HttpHandler } from 'msw';
import { db } from '../db';
import { addAudit, cancelScheduledFollowUps } from '../domain';
import { customerContactPerson, customerDisplayName, newId, nextRowVersion, nowIso, type CustomerRec } from '../model';
import { ensureWritable } from './billing';
import {
  clean,
  companyRoute,
  concurrencyConflict,
  conflict,
  csvResponse,
  csvDateTime,
  FieldErrors,
  includesCi,
  json,
  notFound,
  paginate,
  readJson,
  sortBy,
  type CompanyCtx,
} from './http';
import { activeQuotations, customerName, toCustomer, toCustomerListItem, toJobListItem, toQuotationListItem } from './mappers';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES: CustomerType[] = ['Business', 'Private'];

export function findCustomer(ctx: CompanyCtx, id: string | undefined): CustomerRec {
  const customer = db.customers.find((c) => c.id === id && c.companyId === ctx.company.id);
  if (!customer) throw notFound('Der Kunde wurde nicht gefunden.');
  return customer;
}

function validate(body: Partial<UpsertCustomerRequest>): void {
  const errors = new FieldErrors();
  if (!body.type || !TYPES.includes(body.type)) errors.add('type', 'Bitte wählen Sie Firma oder Privatperson.');
  if (body.type === 'Business' && !clean(body.companyName)) errors.add('companyName', 'Bitte geben Sie den Firmennamen ein.');
  if (body.type === 'Private' && !clean(body.lastName)) errors.add('lastName', 'Bitte geben Sie den Nachnamen ein.');
  if (body.email && clean(body.email) && !EMAIL_RE.test(body.email.trim())) errors.add('email', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
  if (body.billingPostalCode && clean(body.billingPostalCode) && !/^[0-9A-Za-z -]{3,10}$/.test(body.billingPostalCode.trim())) {
    errors.add('billingPostalCode', 'Bitte geben Sie eine gültige Postleitzahl ein.');
  }
  if (body.hasServiceAddress && !clean(body.serviceStreet)) errors.add('serviceStreet', 'Bitte geben Sie die Straße der Leistungsadresse ein.');
  if (body.hasServiceAddress && !clean(body.serviceCity)) errors.add('serviceCity', 'Bitte geben Sie den Ort der Leistungsadresse ein.');
  errors.throwIfAny();
}

function apply(c: CustomerRec, body: Partial<UpsertCustomerRequest>): void {
  const service = body.hasServiceAddress === true;
  c.type = body.type ?? c.type;
  c.companyName = clean(body.companyName);
  c.salutation = clean(body.salutation);
  c.firstName = clean(body.firstName);
  c.lastName = clean(body.lastName);
  c.email = clean(body.email)?.toLowerCase() ?? null;
  c.phone = clean(body.phone);
  c.billingStreet = clean(body.billingStreet);
  c.billingPostalCode = clean(body.billingPostalCode);
  c.billingCity = clean(body.billingCity);
  c.billingCountry = clean(body.billingCountry)?.toUpperCase() ?? 'DE';
  c.hasServiceAddress = service;
  c.serviceStreet = service ? clean(body.serviceStreet) : null;
  c.servicePostalCode = service ? clean(body.servicePostalCode) : null;
  c.serviceCity = service ? clean(body.serviceCity) : null;
  c.serviceCountry = service ? (clean(body.serviceCountry)?.toUpperCase() ?? 'DE') : null;
  c.vatId = clean(body.vatId);
  c.notes = clean(body.notes);
  c.followUpOptOut = body.followUpOptOut === true;
}

function touch(c: CustomerRec): void {
  c.rowVersion = nextRowVersion(db);
  c.updatedAt = nowIso();
}

export const customerHandlers: HttpHandler[] = [
  companyRoute('get', '/customers', ({ company, query }) => {
    const search = clean(query.get('search'));
    const type = query.get('type');
    const status = query.get('status') ?? 'active';
    let items = db.customers.filter((c) => c.companyId === company.id);
    if (status === 'active') items = items.filter((c) => !c.isArchived);
    else if (status === 'archived') items = items.filter((c) => c.isArchived);
    if (type === 'Business' || type === 'Private') items = items.filter((c) => c.type === type);
    if (search) {
      items = items.filter((c) =>
        [customerName(c), c.email, customerContactPerson(c), c.billingCity, c.phone, c.companyName].some((v) => includesCi(v, search)));
    }
    const sorted = sortBy(items, query.get('sort'), { name: (c) => customerName(c).toLocaleLowerCase('de-DE'), createdAt: (c) => c.createdAt }, 'name');
    return json(paginate(sorted.map(toCustomerListItem), query));
  }),

  companyRoute('get', '/customers/export.csv', ({ company, user }) => {
    const rows = db.customers
      .filter((c) => c.companyId === company.id)
      .sort((a, b) => customerName(a).localeCompare(customerName(b), 'de-DE'))
      .map((c) => [
        customerName(c), c.type === 'Business' ? 'Firma' : 'Privat', c.companyName, c.salutation, c.firstName, c.lastName, c.email, c.phone,
        c.billingStreet, c.billingPostalCode, c.billingCity, c.billingCountry, c.vatId, c.isArchived ? 'ja' : 'nein', csvDateTime(c.createdAt, company.timeZone),
      ]);
    addAudit(db, company.id, user.id, 'customer.exported', 'Customer', null, `${rows.length} Kunden`);
    return csvResponse('kunden.csv', [
      'Name', 'Typ', 'Firma', 'Anrede', 'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Straße', 'PLZ', 'Ort', 'Land', 'USt-IdNr.', 'Archiviert', 'Angelegt am',
    ], rows);
  }, 'Admin'),

  companyRoute('get', '/customers/:customerId', (ctx) => json(toCustomer(findCustomer(ctx, ctx.params.customerId)))),

  companyRoute('post', '/customers', async ({ request, company, user }) => {
    const body = await readJson<Partial<UpsertCustomerRequest>>(request);
    validate(body);
    ensureWritable(company.id);
    const now = nowIso();
    const c: CustomerRec = {
      id: newId(),
      companyId: company.id,
      type: body.type ?? 'Business',
      companyName: null, salutation: null, firstName: null, lastName: null, email: null, phone: null,
      billingStreet: null, billingPostalCode: null, billingCity: null, billingCountry: 'DE',
      hasServiceAddress: false, serviceStreet: null, servicePostalCode: null, serviceCity: null, serviceCountry: null,
      vatId: null, notes: null, followUpOptOut: false, isArchived: false, isAnonymized: false,
      createdAt: now, updatedAt: now, rowVersion: nextRowVersion(db),
    };
    apply(c, body);
    db.customers.push(c);
    addAudit(db, company.id, user.id, 'customer.created', 'Customer', c.id, customerDisplayName(c));
    return json(toCustomer(c), 201);
  }),

  companyRoute('put', '/customers/:customerId', async (ctx) => {
    const c = findCustomer(ctx, ctx.params.customerId);
    const body = await readJson<Partial<UpsertCustomerRequest>>(ctx.request);
    if (body.rowVersion && body.rowVersion !== c.rowVersion) throw concurrencyConflict();
    if (c.isAnonymized) throw conflict('customer_anonymized', 'Anonymisierte Kunden können nicht bearbeitet werden.');
    validate(body);
    ensureWritable(ctx.company.id);
    const wasOptOut = c.followUpOptOut;
    apply(c, body);
    if (!wasOptOut && c.followUpOptOut) {
      for (const q of activeQuotations(ctx.company.id).filter((x) => x.customerId === c.id)) {
        cancelScheduledFollowUps(db, q.id, 'Kunde möchte keine Erinnerungen');
      }
    }
    touch(c);
    addAudit(db, ctx.company.id, ctx.user.id, 'customer.updated', 'Customer', c.id, customerDisplayName(c));
    return json(toCustomer(c));
  }),

  companyRoute('post', '/customers/:customerId/archive', (ctx) => {
    const c = findCustomer(ctx, ctx.params.customerId);
    if (!c.isArchived) {
      c.isArchived = true;
      touch(c);
      addAudit(db, ctx.company.id, ctx.user.id, 'customer.archived', 'Customer', c.id, customerName(c));
    }
    return json(toCustomer(c));
  }),

  companyRoute('post', '/customers/:customerId/unarchive', (ctx) => {
    const c = findCustomer(ctx, ctx.params.customerId);
    if (c.isArchived) {
      c.isArchived = false;
      touch(c);
    }
    return json(toCustomer(c));
  }),

  companyRoute('delete', '/customers/:customerId', (ctx) => {
    const c = findCustomer(ctx, ctx.params.customerId);
    const quotations = db.quotations.filter((q) => q.customerId === c.id);
    const hasDocuments = quotations.length > 0 || db.jobs.some((j) => j.customerId === c.id);
    if (!hasDocuments) {
      db.customers = db.customers.filter((x) => x.id !== c.id);
      addAudit(db, ctx.company.id, ctx.user.id, 'customer.deleted', 'Customer', null, null);
      return json({ result: 'deleted' });
    }
    // Retention: documents stay, personal data is removed.
    Object.assign(c, {
      companyName: null, salutation: null, firstName: null, lastName: null, email: null, phone: null,
      billingStreet: null, billingPostalCode: null, billingCity: null,
      hasServiceAddress: false, serviceStreet: null, servicePostalCode: null, serviceCity: null, serviceCountry: null,
      vatId: null, notes: null, followUpOptOut: true, isArchived: true, isAnonymized: true,
    });
    for (const q of quotations) cancelScheduledFollowUps(db, q.id, 'Kunde anonymisiert');
    touch(c);
    addAudit(db, ctx.company.id, ctx.user.id, 'customer.anonymized', 'Customer', c.id, null);
    return json({ result: 'anonymized' });
  }, 'Admin'),

  companyRoute('get', '/customers/:customerId/quotations', (ctx) => {
    const c = findCustomer(ctx, ctx.params.customerId);
    const list = activeQuotations(ctx.company.id)
      .filter((q) => q.customerId === c.id)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
    return json(list.map(toQuotationListItem));
  }),

  companyRoute('get', '/customers/:customerId/jobs', (ctx) => {
    const c = findCustomer(ctx, ctx.params.customerId);
    return json(db.jobs.filter((j) => j.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toJobListItem));
  }),
];
