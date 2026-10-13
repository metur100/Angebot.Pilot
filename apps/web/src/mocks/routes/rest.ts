// Mock routes for jobs, templates, notifications, the public customer page and the dev email sink.
import type {
  ChangeJobStatusRequest,
  PublicAcceptRequest,
  PublicQuotationDto,
  PublicRejectRequest,
  UpdateJobRequest,
  UpsertTemplateRequest,
} from '@angebotpilot/api-contracts';
import type { HttpHandler } from 'msw';
import { db } from '../db';
import { addAudit, addEvent, companyToday, JOB_STATUS_LABELS, JOB_TRANSITIONS, notifyCompany } from '../domain';
import { buildTemplateLineItems, formatAddress, newId, nextRowVersion, nowIso, type JobRec, type QuotationRec } from '../model';
import { buildQuotationPdf, quotationPdfFileName } from '../pdf';
import {
  badRequest,
  base64ToBytes,
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
  route,
  sortBy,
  validation,
} from './http';
import { customerName, toJob, toJobListItem, toNotification, toTemplate, toTemplateListItem, totalsOf } from './mappers';
import { closeOpenEnds, validateLineItems } from './quotations';

// ---------- jobs ----------

function findJob(companyId: string, id: string | undefined): JobRec {
  const job = db.jobs.find((j) => j.companyId === companyId && j.id === id);
  if (!job) throw notFound('Der Auftrag wurde nicht gefunden.');
  return job;
}

function filterJobs(companyId: string, query: URLSearchParams): JobRec[] {
  let items = db.jobs.filter((j) => j.companyId === companyId);
  const statuses = listParam(query, 'status');
  if (statuses.length) items = items.filter((j) => statuses.includes(j.status));
  const assignee = query.get('assignedUserId');
  if (assignee) items = items.filter((j) => j.assignedUserId === assignee);
  const customerId = query.get('customerId');
  if (customerId) items = items.filter((j) => j.customerId === customerId);
  const search = clean(query.get('search'));
  if (search) {
    items = items.filter((j) => {
      const q = db.quotations.find((x) => x.id === j.quotationId);
      return [j.number, j.title, q?.number, customerName(db.customers.find((c) => c.id === j.customerId))].some((v) => includesCi(v, search));
    });
  }
  return sortBy(items, query.get('sort'), { dueDate: (j) => j.dueDate, createdAt: (j) => j.createdAt, number: (j) => j.number }, '-createdAt');
}

const jobHandlers: HttpHandler[] = [
  companyRoute('get', '/jobs/export.csv', ({ company, query }) => {
    const rows = filterJobs(company.id, query).map((j) => {
      const dto = toJobListItem(j);
      return [dto.number, dto.title, JOB_STATUS_LABELS[dto.status], dto.customerName, dto.quotationNumber, csvDate(dto.plannedStartDate), csvDate(dto.dueDate), dto.assignedUserName, csvMoney(dto.netValue)];
    });
    return csvResponse('auftraege.csv', ['Nummer', 'Titel', 'Status', 'Kunde', 'Angebot', 'Start', 'Fällig', 'Zuständig', 'Wert netto'], rows);
  }, 'Admin'),

  companyRoute('get', '/jobs', ({ company, query }) => json(paginate(filterJobs(company.id, query).map(toJobListItem), query))),

  companyRoute('get', '/jobs/:id', ({ company, params }) => json(toJob(findJob(company.id, params.id)))),

  companyRoute('put', '/jobs/:id', async ({ company, params, request, user }) => {
    const job = findJob(company.id, params.id);
    const body = await readJson<Partial<UpdateJobRequest>>(request);
    if (body.rowVersion !== job.rowVersion) throw concurrencyConflict();
    const errors = new FieldErrors();
    const title = clean(body.title);
    if (!title) errors.add('title', 'Bitte Titel angeben.');
    if (body.plannedStartDate && body.dueDate && body.dueDate < body.plannedStartDate) {
      errors.add('dueDate', 'Der Fertigstellungstermin darf nicht vor dem geplanten Beginn liegen.');
    }
    if (body.assignedUserId && !db.memberships.some((m) => m.companyId === company.id && m.userId === body.assignedUserId && m.status === 'Active')) {
      errors.add('assignedUserId', 'Die Person ist kein aktives Mitglied der Firma.');
    }
    errors.throwIfAny();
    Object.assign(job, {
      title: title ?? job.title,
      description: clean(body.description),
      plannedStartDate: body.plannedStartDate ?? null,
      dueDate: body.dueDate ?? null,
      assignedUserId: body.assignedUserId ?? null,
      notes: clean(body.notes),
      updatedAt: nowIso(),
      rowVersion: nextRowVersion(db),
    });
    addAudit(db, company.id, user.id, 'job.updated', 'Job', job.id, job.number);
    return json(toJob(job));
  }),

  companyRoute('post', '/jobs/:id/status', async ({ company, params, request, user }) => {
    const job = findJob(company.id, params.id);
    const { status } = await readJson<Partial<ChangeJobStatusRequest>>(request);
    if (!status || !(JOB_TRANSITIONS[job.status]).includes(status)) {
      throw conflict('invalid_status_transition', `Der Status kann nicht von „${JOB_STATUS_LABELS[job.status]}“ zu „${status ? JOB_STATUS_LABELS[status] : '?'}“ geändert werden.`);
    }
    const now = nowIso();
    job.status = status;
    if (status === 'InProgress') job.startedAt = now;
    if (status === 'Completed') job.completedAt = now;
    if (status === 'Cancelled') job.cancelledAt = now;
    job.updatedAt = now;
    job.rowVersion = nextRowVersion(db);
    addAudit(db, company.id, user.id, 'job.status', 'Job', job.id, `${job.number}: ${JOB_STATUS_LABELS[status]}`, now);
    return json(toJob(job));
  }),
];

// ---------- templates ----------

function defaultRate(companyId: string): number {
  const rates = db.taxRates.filter((r) => r.companyId === companyId && !r.isArchived);
  return rates.find((r) => r.isDefault)?.ratePercent ?? rates[0]?.ratePercent ?? 19;
}

function readTemplate(body: Partial<UpsertTemplateRequest>) {
  const errors = new FieldErrors();
  const name = clean(body.name);
  if (!name) errors.add('name', 'Bitte Namen angeben.');
  const items = (body.lineItems ?? []).map((l) => ({ ...l, taxRatePercent: l.taxRatePercent ?? 0 }));
  validateLineItems(errors, items, false);
  errors.throwIfAny();
  return {
    name: name ?? '',
    description: clean(body.description),
    introText: clean(body.introText),
    closingText: clean(body.closingText),
    terms: clean(body.terms),
    taxMode: body.taxMode ?? null,
    lineItems: buildTemplateLineItems(body.lineItems ?? []),
  };
}

const templateHandlers: HttpHandler[] = [
  companyRoute('get', '/templates', ({ company }) =>
    json(
      db.templates
        .filter((t) => t.companyId === company.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'de-DE'))
        .map((t) => toTemplateListItem(t, defaultRate(company.id))),
    ),
  ),
  companyRoute('get', '/templates/:id', ({ company, params }) => {
    const t = db.templates.find((x) => x.companyId === company.id && x.id === params.id);
    if (!t) throw notFound('Die Vorlage wurde nicht gefunden.');
    return json(toTemplate(t));
  }),
  companyRoute('post', '/templates', async ({ company, request }) => {
    const data = readTemplate(await readJson<Partial<UpsertTemplateRequest>>(request));
    const now = nowIso();
    const t = { id: newId(), companyId: company.id, ...data, createdAt: now, updatedAt: now };
    db.templates.push(t);
    return json(toTemplate(t), 201);
  }),
  companyRoute('put', '/templates/:id', async ({ company, params, request }) => {
    const t = db.templates.find((x) => x.companyId === company.id && x.id === params.id);
    if (!t) throw notFound('Die Vorlage wurde nicht gefunden.');
    Object.assign(t, readTemplate(await readJson<Partial<UpsertTemplateRequest>>(request)), { updatedAt: nowIso() });
    return json(toTemplate(t));
  }),
  companyRoute('delete', '/templates/:id', ({ company, params }) => {
    const index = db.templates.findIndex((x) => x.companyId === company.id && x.id === params.id);
    if (index < 0) throw notFound('Die Vorlage wurde nicht gefunden.');
    db.templates.splice(index, 1);
    return noContent();
  }),
];

// ---------- notifications ----------

const notificationHandlers: HttpHandler[] = [
  companyRoute('get', '/notifications/unread-count', ({ company, user }) =>
    json({ count: db.notifications.filter((n) => n.companyId === company.id && n.userId === user.id && !n.readAt).length }),
  ),
  companyRoute('get', '/notifications', ({ company, user, query }) => {
    let items = db.notifications.filter((n) => n.companyId === company.id && n.userId === user.id);
    if (query.get('unreadOnly') === 'true') items = items.filter((n) => !n.readAt);
    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(paginate(items.map(toNotification), query));
  }),
  companyRoute('post', '/notifications/read-all', ({ company, user }) => {
    const now = nowIso();
    for (const n of db.notifications) if (n.companyId === company.id && n.userId === user.id && !n.readAt) n.readAt = now;
    return noContent();
  }),
  companyRoute('post', '/notifications/:id/read', ({ company, user, params }) => {
    const n = db.notifications.find((x) => x.companyId === company.id && x.userId === user.id && x.id === params.id);
    if (!n) throw notFound();
    n.readAt ??= nowIso();
    return noContent();
  }),
];

// ---------- public customer page ----------

function byToken(token: string | undefined): QuotationRec {
  const active = db.quotations.find((q) => q.publicToken && q.publicToken === token && !q.deletedAt);
  if (active) {
    if (active.status === 'Cancelled') throw problem(410, 'link_gone', 'Dieses Angebot wurde storniert und ist nicht mehr verfügbar.');
    if (active.publicLinkExpiresAt && active.publicLinkExpiresAt < nowIso()) throw problem(410, 'link_expired', 'Dieser Link ist abgelaufen.');
    return active;
  }
  if (db.quotations.some((q) => token && q.revokedTokens.includes(token))) {
    throw problem(410, 'link_gone', 'Dieser Link wurde widerrufen und ist nicht mehr gültig.');
  }
  throw notFound('Dieser Link ist ungültig.', 'link_not_found');
}

function companyOf(q: QuotationRec) {
  const company = db.companies.find((c) => c.id === q.companyId);
  if (!company) throw notFound();
  return company;
}

function toPublic(q: QuotationRec): PublicQuotationDto {
  const company = companyOf(q);
  const customer = db.customers.find((c) => c.id === q.customerId);
  const today = companyToday(company);
  return {
    number: q.number,
    title: q.title,
    status: q.status,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    canDecide: q.status === 'Sent' && q.validUntil >= today,
    isPastValidity: q.validUntil < today,
    companyName: company.name,
    companyAddress: formatAddress(company.addressLine1, company.addressLine2, [company.postalCode, company.city].filter(Boolean).join(' ')) || null,
    companyEmail: company.email,
    companyPhone: company.phone,
    brandColor: company.brandColor,
    hasLogo: Boolean(company.logo),
    recipientName: q.recipientName,
    recipientAddress: q.recipientAddress,
    taxMode: q.taxMode,
    introText: q.introText,
    closingText: q.closingText,
    terms: q.terms,
    paymentTerms: q.paymentTerms,
    lineItems: q.lineItems.map((l) => ({
      position: l.position,
      title: l.title,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceNet: l.unitPriceNet,
      discountPercent: l.discountPercent,
      taxRatePercent: l.taxRatePercent,
      lineNet: l.lineNet,
    })),
    totals: totalsOf(q),
    decidedAt: q.decidedAt,
    decisionName: q.decisionName,
    followUpOptOut: customer?.followUpOptOut ?? false,
  };
}

function decide(q: QuotationRec, status: 'Accepted' | 'Rejected', name: string | null, note: string | null) {
  const company = companyOf(q);
  if (!(q.status === 'Sent' && q.validUntil >= companyToday(company))) {
    throw conflict('quotation_not_decidable', 'Über dieses Angebot kann nicht mehr entschieden werden.');
  }
  const now = nowIso();
  q.status = status;
  q.decidedAt = now;
  q.decidedByActor = 'Customer';
  q.decisionName = name;
  q.decisionNote = note;
  q.updatedAt = now;
  q.rowVersion = nextRowVersion(db);
  addEvent(db, q, status, 'Customer', null, name, now);
  closeOpenEnds(q, status === 'Accepted' ? 'Angebot angenommen' : 'Angebot abgelehnt', null, now);
  notifyCompany(
    db,
    q.companyId,
    [q.createdByUserId],
    status === 'Accepted' ? 'QuotationAccepted' : 'QuotationRejected',
    `${q.number} wurde ${status === 'Accepted' ? 'angenommen' : 'abgelehnt'}`,
    `${name ?? 'Der Kunde'} hat das Angebot „${q.title}“ online ${status === 'Accepted' ? 'angenommen' : 'abgelehnt'}.`,
    'Quotation',
    q.id,
    now,
  );
  return json({ status, decidedAt: now, number: q.number, companyName: company.name });
}

const publicHandlers: HttpHandler[] = [
  route('get', '/public/quotations/:token', ({ params }) => {
    const q = byToken(params.token);
    const now = nowIso();
    q.publicLinkLastOpenedAt = now;
    addEvent(db, q, 'PublicLinkOpened', 'Customer', null, null, now);
    return json(toPublic(q));
  }),
  route('get', '/public/quotations/:token/pdf', ({ params }) => {
    const q = byToken(params.token);
    return fileResponse(buildQuotationPdf({ company: companyOf(q), quotation: q, draft: false }), 'application/pdf', quotationPdfFileName(q));
  }),
  route('get', '/public/quotations/:token/logo', ({ params }) => {
    const company = companyOf(byToken(params.token));
    if (!company.logo) throw notFound('Es ist kein Logo hinterlegt.');
    return fileResponse(base64ToBytes(company.logo.base64), company.logo.contentType);
  }),
  route('post', '/public/quotations/:token/accept', async ({ params, request }) => {
    const q = byToken(params.token);
    const body = await readJson<Partial<PublicAcceptRequest>>(request);
    const errors = new FieldErrors();
    const fullName = clean(body.fullName);
    if (!fullName) errors.add('fullName', 'Bitte geben Sie Ihren vollständigen Namen an.');
    if (body.confirmBinding !== true) errors.add('confirmBinding', 'Bitte bestätigen Sie die verbindliche Annahme.');
    errors.throwIfAny();
    return decide(q, 'Accepted', fullName, clean(body.note));
  }),
  route('post', '/public/quotations/:token/reject', async ({ params, request }) => {
    const q = byToken(params.token);
    const body = await readJson<Partial<PublicRejectRequest>>(request);
    return decide(q, 'Rejected', clean(body.fullName), clean(body.reason));
  }),
  route('post', '/public/quotations/:token/opt-out', ({ params }) => {
    const q = byToken(params.token);
    const customer = db.customers.find((c) => c.id === q.customerId);
    if (!customer) throw badRequest('opt_out_failed', 'Abmeldung nicht möglich.');
    customer.followUpOptOut = true;
    const now = nowIso();
    addEvent(db, q, 'CustomerOptedOut', 'Customer', null, null, now);
    closeOpenEnds(q, 'Kunde hat Erinnerungen abbestellt', null, now);
    return noContent();
  }),
];

// ---------- dev email sink ----------

const devHandlers: HttpHandler[] = [
  route('get', '/dev/emails', ({ query }) => {
    const to = query.get('to');
    if (to !== null && !to.includes('@') && to.length > 0) throw validation('to', 'Ungültige Adresse.');
    const items = db.devEmails.filter((e) => !to || e.to.toLowerCase() === to.toLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(items);
  }),
];

export const restHandlers: HttpHandler[] = [...jobHandlers, ...templateHandlers, ...notificationHandlers, ...publicHandlers, ...devHandlers];
