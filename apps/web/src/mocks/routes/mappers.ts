// Record → DTO mapping (shapes from @angebotpilot/api-contracts/types.ts).
import {
  calculateTotals,
  type ActivityDto,
  type CompanyDto,
  type CustomerDto,
  type CustomerListItemDto,
  type EmailDeliveryDto,
  type FollowUpDto,
  type InvitationDto,
  type JobDto,
  type JobListItemDto,
  type MeDto,
  type MemberDto,
  type MembershipRole,
  type NotificationDto,
  type QuotationDto,
  type QuotationEventDto,
  type QuotationListItemDto,
  type RevisionLinkDto,
  type TemplateDto,
  type TemplateListItemDto,
  type TotalsDto,
} from '@angebotpilot/api-contracts';
import { db } from '../db';
import { allowedTransitions, JOB_TRANSITIONS } from '../domain';
import {
  customerContactPerson,
  customerDisplayName,
  nowIso,
  type AuditRec,
  type CompanyRec,
  type CustomerRec,
  type DeliveryRec,
  type EventRec,
  type FollowUpRec,
  type InvitationRec,
  type JobRec,
  type MembershipRec,
  type NotificationRec,
  type QuotationRec,
  type TemplateRec,
  type UserRec,
} from '../model';

export function userName(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return db.users.find((u) => u.id === userId)?.displayName ?? 'Gelöschter Benutzer';
}

export function toMe(user: UserRec): MeDto {
  const companies = db.memberships
    .filter((m) => m.userId === user.id && m.status === 'Active')
    .flatMap((m) => {
      const company = db.companies.find((c) => c.id === m.companyId);
      return company ? [{ companyId: company.id, companyName: company.name, role: m.role, membershipId: m.id, isDemo: company.isDemo }] : [];
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'de-DE'));
  return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified, companies };
}

export function toCompany(company: CompanyRec, role: MembershipRole): CompanyDto {
  return {
    id: company.id,
    name: company.name,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    postalCode: company.postalCode,
    city: company.city,
    country: company.country,
    email: company.email,
    phone: company.phone,
    website: company.website,
    vatId: company.vatId,
    taxNumber: company.taxNumber,
    brandColor: company.brandColor,
    timeZone: company.timeZone,
    language: company.language,
    hasLogo: company.logo !== null,
    isDemo: company.isDemo,
    myRole: role,
    rowVersion: company.rowVersion,
  };
}

export function toMember(m: MembershipRec): MemberDto {
  const user = db.users.find((u) => u.id === m.userId);
  return {
    membershipId: m.id,
    userId: m.userId,
    displayName: user?.displayName ?? 'Gelöschter Benutzer',
    email: user?.email ?? '',
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
  };
}

export function toInvitation(i: InvitationRec): InvitationDto {
  return { id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, isExpired: i.expiresAt <= nowIso() };
}

// ---------- customers ----------

export function toCustomer(c: CustomerRec): CustomerDto {
  return {
    id: c.id,
    type: c.type,
    displayName: c.isAnonymized ? 'Anonymisierter Kunde' : customerDisplayName(c),
    companyName: c.companyName,
    salutation: c.salutation,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    billingStreet: c.billingStreet,
    billingPostalCode: c.billingPostalCode,
    billingCity: c.billingCity,
    billingCountry: c.billingCountry,
    hasServiceAddress: c.hasServiceAddress,
    serviceStreet: c.serviceStreet,
    servicePostalCode: c.servicePostalCode,
    serviceCity: c.serviceCity,
    serviceCountry: c.serviceCountry,
    vatId: c.vatId,
    notes: c.notes,
    followUpOptOut: c.followUpOptOut,
    isArchived: c.isArchived,
    isAnonymized: c.isAnonymized,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    rowVersion: c.rowVersion,
  };
}

export function customerName(c: CustomerRec | undefined): string {
  if (!c) return 'Unbekannter Kunde';
  return c.isAnonymized ? 'Anonymisierter Kunde' : customerDisplayName(c);
}

export function activeQuotations(companyId: string): QuotationRec[] {
  return db.quotations.filter((q) => q.companyId === companyId && !q.deletedAt);
}

export function toCustomerListItem(c: CustomerRec): CustomerListItemDto {
  const quotations = activeQuotations(c.companyId).filter((q) => q.customerId === c.id);
  const acceptedValue = quotations.filter((q) => q.status === 'Accepted').reduce((sum, q) => sum + totalsOf(q).netTotal, 0);
  return {
    id: c.id,
    type: c.type,
    displayName: customerName(c),
    contactPerson: c.type === 'Business' && !c.isAnonymized ? customerContactPerson(c) : null,
    email: c.email,
    phone: c.phone,
    city: c.billingCity,
    isArchived: c.isArchived,
    quotationCount: quotations.length,
    acceptedValue: Math.round(acceptedValue * 100) / 100,
    createdAt: c.createdAt,
  };
}

// ---------- quotations ----------

export function totalsOf(q: QuotationRec): TotalsDto {
  return calculateTotals(q.lineItems, q.taxMode);
}

export function jobOf(quotationId: string): JobRec | undefined {
  return db.jobs.find((j) => j.quotationId === quotationId);
}

export function toQuotationListItem(q: QuotationRec): QuotationListItemDto {
  const totals = totalsOf(q);
  return {
    id: q.id,
    number: q.number,
    title: q.title,
    status: q.status,
    customerId: q.customerId,
    customerName: q.recipientName,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    netTotal: totals.netTotal,
    grossTotal: totals.grossTotal,
    sentAt: q.sentAt,
    updatedAt: q.updatedAt,
    revisionNumber: q.revisionNumber,
    hasJob: !!jobOf(q.id),
  };
}

export function revisionsOf(q: QuotationRec): RevisionLinkDto[] {
  const rootId = q.rootQuotationId ?? q.id;
  const chain = db.quotations
    .filter((x) => x.id === rootId || x.rootQuotationId === rootId)
    .sort((a, b) => a.revisionNumber - b.revisionNumber)
    .map((x) => ({ id: x.id, number: x.number, revisionNumber: x.revisionNumber, status: x.status }));
  return chain.length > 1 ? chain : [];
}

export function toQuotation(q: QuotationRec): QuotationDto {
  const customer = db.customers.find((c) => c.id === q.customerId);
  const hasActivePublicLink = !!q.publicToken && (!q.publicLinkExpiresAt || q.publicLinkExpiresAt > nowIso());
  return {
    id: q.id,
    number: q.number,
    title: q.title,
    status: q.status,
    customerId: q.customerId,
    customerName: customer ? customerName(customer) : q.recipientName,
    recipientName: q.recipientName,
    recipientContact: q.recipientContact,
    recipientAddress: q.recipientAddress,
    recipientEmail: q.recipientEmail,
    recipientVatId: q.recipientVatId,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    taxMode: q.taxMode,
    introText: q.introText,
    closingText: q.closingText,
    terms: q.terms,
    paymentTerms: q.paymentTerms,
    internalNotes: q.internalNotes,
    currency: q.currency,
    lineItems: [...q.lineItems].sort((a, b) => a.position - b.position),
    totals: totalsOf(q),
    revisionNumber: q.revisionNumber,
    rootQuotationId: q.rootQuotationId,
    previousRevisionId: q.previousRevisionId,
    revisions: revisionsOf(q),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    sentAt: q.sentAt,
    decidedAt: q.decidedAt,
    decidedByActor: q.decidedByActor,
    decisionName: q.decisionName,
    decisionNote: q.decisionNote,
    expiredAt: q.expiredAt,
    cancelledAt: q.cancelledAt,
    cancellationReason: q.cancellationReason,
    jobId: jobOf(q.id)?.id ?? null,
    hasActivePublicLink,
    publicLinkLastOpenedAt: q.publicLinkLastOpenedAt,
    allowedTransitions: allowedTransitions(q.status),
    rowVersion: q.rowVersion,
  };
}

export function toEvent(e: EventRec): QuotationEventDto {
  const actorName = e.actorType === 'Customer' ? 'Kunde' : e.actorType === 'System' ? 'System' : userName(e.actorUserId);
  return { id: e.id, type: e.type, occurredAt: e.occurredAt, actorType: e.actorType, actorName, details: e.details };
}

export function toDelivery(d: DeliveryRec): EmailDeliveryDto {
  return {
    id: d.id,
    kind: d.kind,
    toAddress: d.toAddress,
    subject: d.subject,
    status: d.status,
    attempts: d.attempts,
    createdAt: d.createdAt,
    handedOffAt: d.handedOffAt,
    nextAttemptAt: d.status === 'Pending' || d.status === 'RetryScheduled' ? d.nextAttemptAt : null,
    lastError: d.lastError,
  };
}

export function toFollowUp(f: FollowUpRec): FollowUpDto {
  return { id: f.id, kind: f.kind, dueAt: f.dueAt, status: f.status, statusReason: f.statusReason, processedAt: f.processedAt };
}

// ---------- jobs, templates ----------

export function toJobListItem(j: JobRec): JobListItemDto {
  const q = db.quotations.find((x) => x.id === j.quotationId);
  const customer = db.customers.find((c) => c.id === j.customerId);
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    status: j.status,
    customerId: j.customerId,
    customerName: customerName(customer),
    quotationId: j.quotationId,
    quotationNumber: q?.number ?? '',
    plannedStartDate: j.plannedStartDate,
    dueDate: j.dueDate,
    assignedUserId: j.assignedUserId,
    assignedUserName: j.assignedUserId ? userName(j.assignedUserId) : null,
    netValue: q ? totalsOf(q).netTotal : 0,
    createdAt: j.createdAt,
  };
}

export function toJob(j: JobRec): JobDto {
  const q = db.quotations.find((x) => x.id === j.quotationId);
  const totals = q ? totalsOf(q) : null;
  const customer = db.customers.find((c) => c.id === j.customerId);
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    description: j.description,
    status: j.status,
    customerId: j.customerId,
    customerName: customerName(customer),
    quotationId: j.quotationId,
    quotationNumber: q?.number ?? '',
    quotationNetTotal: totals?.netTotal ?? 0,
    quotationGrossTotal: totals?.grossTotal ?? 0,
    plannedStartDate: j.plannedStartDate,
    dueDate: j.dueDate,
    assignedUserId: j.assignedUserId,
    assignedUserName: j.assignedUserId ? userName(j.assignedUserId) : null,
    notes: j.notes,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    cancelledAt: j.cancelledAt,
    allowedTransitions: [...JOB_TRANSITIONS[j.status]],
    rowVersion: j.rowVersion,
  };
}

export function toTemplate(t: TemplateRec): TemplateDto {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    introText: t.introText,
    closingText: t.closingText,
    terms: t.terms,
    taxMode: t.taxMode,
    lineItems: [...t.lineItems].sort((a, b) => a.position - b.position),
    updatedAt: t.updatedAt,
  };
}

export function toTemplateListItem(t: TemplateRec, defaultTaxRate: number): TemplateListItemDto {
  const totals = calculateTotals(
    t.lineItems.map((i) => ({ quantity: i.quantity, unitPriceNet: i.unitPriceNet, discountPercent: i.discountPercent, taxRatePercent: i.taxRatePercent ?? defaultTaxRate })),
    t.taxMode ?? 'Standard',
  );
  return { id: t.id, name: t.name, description: t.description, lineItemCount: t.lineItems.length, netTotal: totals.netTotal, updatedAt: t.updatedAt };
}

// ---------- notifications, activity ----------

export function toNotification(n: NotificationRec): NotificationDto {
  return { id: n.id, type: n.type, title: n.title, body: n.body, entityType: n.entityType, entityId: n.entityId, createdAt: n.createdAt, isRead: n.readAt !== null };
}

const ACTIVITY_LABELS: Record<string, string> = {
  'company.created': 'Firma angelegt',
  'company.updated': 'Firmendaten geändert',
  'company.settings_updated': 'Einstellungen geändert',
  'company.logo_uploaded': 'Logo hochgeladen',
  'customer.created': 'Kunde angelegt',
  'customer.updated': 'Kunde bearbeitet',
  'customer.archived': 'Kunde archiviert',
  'customer.anonymized': 'Kunde anonymisiert',
  'customer.deleted': 'Kunde gelöscht',
  'customer.opted_out': 'Kunde hat Erinnerungen abbestellt',
  'quotation.created': 'Angebot erstellt',
  'quotation.duplicated': 'Angebot dupliziert',
  'quotation.revised': 'Revision erstellt',
  'quotation.sent': 'Angebot per E-Mail versendet',
  'quotation.marked_sent': 'Angebot als versendet markiert',
  'quotation.accepted': 'Annahme erfasst',
  'quotation.rejected': 'Ablehnung erfasst',
  'quotation.accepted_by_customer': 'Angebot vom Kunden angenommen',
  'quotation.rejected_by_customer': 'Angebot vom Kunden abgelehnt',
  'quotation.cancelled': 'Angebot storniert',
  'quotation.expired': 'Angebot abgelaufen',
  'quotation.deleted': 'Entwurf gelöscht',
  'job.created': 'Auftrag erstellt',
  'job.status_changed': 'Auftragsstatus geändert',
  'template.created': 'Vorlage erstellt',
  'member.invited': 'Teammitglied eingeladen',
  'member.joined': 'Teammitglied beigetreten',
  'member.deactivated': 'Teammitglied deaktiviert',
  'member.role_changed': 'Rolle geändert',
};

export function activityOf(companyId: string): AuditRec[] {
  return db.audit
    .filter((a) => a.companyId === companyId && ACTIVITY_LABELS[a.action] !== undefined)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function toActivity(a: AuditRec): ActivityDto {
  const label = ACTIVITY_LABELS[a.action] ?? a.action;
  const actorName = a.userId
    ? userName(a.userId)
    : a.action.endsWith('_by_customer') || a.action === 'customer.opted_out'
      ? 'Kunde'
      : 'System';
  return {
    id: a.id,
    type: a.action,
    occurredAt: a.occurredAt,
    actorName,
    summary: a.summary ? `${label}: ${a.summary}` : label,
    entityType: a.entityType,
    entityId: a.entityId,
  };
}
