// Domain rules of the mock backend (mirrors apps/api: Quotation.cs, QuotationService, FollowUpCanceller, NotificationService).
import {
  addDaysIso,
  calculateTotals,
  todayIso,
  type ActorType,
  type CompanySettingsDto,
  type FollowUpKind,
  type InvoiceAction,
  type InvoiceEventType,
  type InvoiceStatus,
  type JobStatus,
  type MembershipRole,
  type QuotationEventType,
  type QuotationStatus,
  type TaxMode,
  type TotalsDto,
} from '@angebotpilot/api-contracts';
import { newId, nowIso, type CompanyRec, type InvoiceRec, type MockDb, type QuotationRec } from './model';

export const IS_TEST = import.meta.env.MODE === 'test';

/** Base URL of the web app (hash router), used for links in emails. */
export function appBaseUrl(): string {
  if (!IS_TEST && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return 'http://localhost:5173/';
}

export function publicQuotationUrl(token: string): string {
  return `${appBaseUrl()}#/q/${token}`;
}

export function appLink(hashPath: string): string {
  return `${appBaseUrl()}#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}`;
}

export function companyToday(company: Pick<CompanyRec, 'timeZone'> | undefined): string {
  try {
    return todayIso(company?.timeZone ?? 'Europe/Berlin');
  } catch {
    return todayIso();
  }
}

// ---------- status transitions ----------

const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  Draft: ['Sent', 'Cancelled'],
  Sent: ['Accepted', 'Rejected', 'Expired', 'Cancelled'],
  Accepted: [],
  Rejected: [],
  Expired: [],
  Cancelled: [],
};

export function canTransition(from: QuotationStatus, to: QuotationStatus): boolean {
  return QUOTATION_TRANSITIONS[from].includes(to);
}

/** allowedTransitions of the DTO: the transition table, plus "Accepted" for expired ones (late acceptance by the user). */
export function allowedTransitions(status: QuotationStatus): QuotationStatus[] {
  const list = [...QUOTATION_TRANSITIONS[status]];
  if (status === 'Expired') list.push('Accepted');
  return list;
}

export const STATUS_LABELS: Record<QuotationStatus, string> = {
  Draft: 'Entwurf',
  Sent: 'Versendet',
  Accepted: 'Angenommen',
  Rejected: 'Abgelehnt',
  Expired: 'Abgelaufen',
  Cancelled: 'Storniert',
};

export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  Open: ['InProgress', 'Completed', 'Cancelled'],
  InProgress: ['Open', 'Completed', 'Cancelled'],
  Completed: ['InProgress'],
  Cancelled: ['Open'],
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  Open: 'Offen',
  InProgress: 'In Arbeit',
  Completed: 'Abgeschlossen',
  Cancelled: 'Storniert',
};

export const REVISABLE_STATUSES: QuotationStatus[] = ['Sent', 'Rejected', 'Expired'];

// ---------- events, audit, notifications, emails ----------

export function addEvent(
  db: MockDb,
  q: QuotationRec,
  type: QuotationEventType,
  actorType: ActorType,
  userId: string | null,
  details: string | null = null,
  at: string = nowIso(),
): void {
  db.events.push({ id: newId(), companyId: q.companyId, quotationId: q.id, type, occurredAt: at, actorType, actorUserId: userId, details });
}

export function addAudit(
  db: MockDb,
  companyId: string,
  userId: string | null,
  action: string,
  entityType: string | null,
  entityId: string | null,
  summary: string | null,
  at: string = nowIso(),
): void {
  db.audit.push({ id: newId(), companyId, userId, action, entityType, entityId, summary, occurredAt: at });
}

/** Notifies active owners/admins plus the given extra users (when active members). */
export function notifyCompany(
  db: MockDb,
  companyId: string,
  extraUserIds: (string | null | undefined)[],
  type: string,
  title: string,
  body: string | null,
  entityType: string | null,
  entityId: string | null,
  at: string = nowIso(),
): void {
  const active = db.memberships.filter((m) => m.companyId === companyId && m.status === 'Active');
  const recipients = new Set<string>(active.filter((m) => m.role !== 'Employee').map((m) => m.userId));
  for (const id of extraUserIds) {
    if (id && active.some((m) => m.userId === id)) recipients.add(id);
  }
  for (const userId of recipients) {
    db.notifications.push({ id: newId(), companyId, userId, type, title, body, entityType, entityId, createdAt: at, readAt: null });
  }
}

export function captureEmail(db: MockDb, to: string, subject: string, bodyText: string, attachments: string[] = [], at: string = nowIso()): string {
  const id = newId();
  db.devEmails.push({ id, to, subject, bodyText, createdAt: at, attachments });
  return id;
}

// ---------- follow-ups ----------

const REMINDER_KINDS = new Set(['FirstReminder', 'SecondReminder', 'ExpiryReminder']);

/** Cancels scheduled reminders and reminder emails not yet handed off. Returns the number of cancelled schedules. */
export function cancelScheduledFollowUps(db: MockDb, quotationId: string, reason: string, at: string = nowIso()): number {
  let count = 0;
  for (const f of db.followUps) {
    if (f.quotationId === quotationId && f.status === 'Scheduled') {
      f.status = 'Cancelled';
      f.statusReason = reason;
      f.processedAt = at;
      count++;
    }
  }
  for (const d of db.deliveries) {
    if (d.quotationId === quotationId && REMINDER_KINDS.has(d.kind) && (d.status === 'Pending' || d.status === 'RetryScheduled')) {
      d.status = 'Cancelled';
      d.lastError = reason;
      d.nextAttemptAt = null;
    }
  }
  return count;
}

/** Reminder plan like the API's FollowUpPlanner: relative to the send time, never after the validity date. */
export function planFollowUps(settings: CompanySettingsDto, sentAt: string, validUntil: string): { kind: FollowUpKind; dueAt: string }[] {
  const plan: { kind: FollowUpKind; dueAt: string }[] = [];
  const sent = new Date(sentAt).getTime();
  const validEnd = new Date(`${validUntil}T23:59:59.000Z`).getTime();
  const day = 86_400_000;
  if (settings.firstReminderEnabled) {
    const due = sent + settings.firstReminderAfterDays * day;
    if (due < validEnd) plan.push({ kind: 'FirstReminder', dueAt: new Date(due).toISOString() });
  }
  if (settings.secondReminderEnabled) {
    const due = sent + settings.secondReminderAfterDays * day;
    if (due < validEnd) plan.push({ kind: 'SecondReminder', dueAt: new Date(due).toISOString() });
  }
  if (settings.expiryReminderEnabled) {
    const due = new Date(`${addDaysIso(validUntil, -settings.expiryReminderDaysBefore)}T07:00:00.000Z`).getTime();
    if (due > sent) plan.push({ kind: 'ExpiryReminder', dueAt: new Date(due).toISOString() });
  }
  return plan.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Background job of the API: sent quotations past their validity date become "Expired". */
export function expireDueQuotations(db: MockDb, companyId?: string): boolean {
  let changed = false;
  const now = nowIso();
  for (const q of db.quotations) {
    if (q.deletedAt || q.status !== 'Sent') continue;
    if (companyId && q.companyId !== companyId) continue;
    const company = db.companies.find((c) => c.id === q.companyId);
    if (q.validUntil < companyToday(company)) {
      expireQuotation(db, q, now);
      changed = true;
    }
  }
  return changed;
}

export function expireQuotation(db: MockDb, q: QuotationRec, at: string = nowIso()): void {
  q.status = 'Expired';
  q.expiredAt = at;
  q.updatedAt = at;
  addEvent(db, q, 'Expired', 'System', null, null, at);
  cancelScheduledFollowUps(db, q.id, 'Angebot abgelaufen', at);
  addAudit(db, q.companyId, null, 'quotation.expired', 'Quotation', q.id, q.number, at);
}

// ---------- invoices (mirrors Invoice.cs, InvoiceDocuments.CompanyProblems and InvoiceService.AllowedActions) ----------

export function invoiceTotals(i: Pick<InvoiceRec, 'lineItems' | 'taxMode'>): TotalsDto {
  return calculateTotals(i.lineItems, i.taxMode);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Issued and not (fully) paid, not cancelled. Cancellation invoices are never open. */
export function isInvoiceOpen(i: Pick<InvoiceRec, 'kind' | 'status'>): boolean {
  return i.kind === 'Invoice' && (i.status === 'Issued' || i.status === 'PartiallyPaid');
}

export function invoiceOpenAmount(i: InvoiceRec): number {
  return isInvoiceOpen(i) ? round2(invoiceTotals(i).grossTotal - i.paidAmount) : 0;
}

export function invoiceDaysOverdue(i: InvoiceRec, today: string): number {
  if (!isInvoiceOpen(i) || i.dueDate >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${i.dueDate}T00:00:00Z`)) / 86_400_000);
}

export function addInvoiceEvent(
  db: MockDb,
  i: InvoiceRec,
  type: InvoiceEventType,
  actorType: ActorType,
  userId: string | null,
  details: string | null = null,
  at: string = nowIso(),
): void {
  db.invoiceEvents.push({ id: newId(), companyId: i.companyId, invoiceId: i.id, type, occurredAt: at, actorType, actorUserId: userId, details });
}

export function invoiceCompanyProblems(company: CompanyRec, taxMode: TaxMode): string[] {
  const problems: string[] = [];
  if (!company.addressLine1?.trim() || !company.postalCode?.trim() || !company.city?.trim()) {
    problems.push('Bitte die vollständige Anschrift Ihrer Firma hinterlegen (Einstellungen → Firma).');
  }
  if (!company.taxNumber?.trim() && !company.vatId?.trim()) {
    problems.push('Bitte Steuernummer oder USt-IdNr. Ihrer Firma hinterlegen (Einstellungen → Firma).');
  }
  if (taxMode === 'ReverseCharge' && !company.vatId?.trim()) {
    problems.push('Für § 13b UStG ist die USt-IdNr. Ihrer Firma erforderlich.');
  }
  return problems;
}

/** Document-level requirements for issuing (§ 14 UStG), like Invoice.IssueProblems of the API. */
export function invoiceIssueProblems(i: InvoiceRec, today: string): string[] {
  const problems: string[] = [];
  if (i.lineItems.length === 0) problems.push('Die Rechnung enthält keine Positionen.');
  else if (i.kind === 'Invoice' && invoiceTotals(i).netTotal <= 0) problems.push('Der Rechnungsbetrag muss größer als 0 € sein.');
  if (!i.serviceDateFrom) problems.push('Bitte das Leistungsdatum bzw. den Leistungszeitraum angeben (§ 14 UStG).');
  else if (i.serviceDateTo && i.serviceDateTo < i.serviceDateFrom) problems.push('Das Ende des Leistungszeitraums liegt vor dem Beginn.');
  if (i.issueDate > today) problems.push('Das Rechnungsdatum darf nicht in der Zukunft liegen.');
  if (i.dueDate < i.issueDate) problems.push('Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.');
  if (!i.recipientName.trim() || !i.recipientStreet || !i.recipientCity) {
    problems.push('Beim Kunden fehlen Name oder vollständige Rechnungsanschrift (Straße, PLZ, Ort).');
  }
  if (i.taxMode === 'ReverseCharge' && !i.recipientVatId?.trim()) {
    problems.push('Für die Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG) ist die USt-IdNr. des Kunden erforderlich.');
  }
  return problems;
}

export function invoiceAllowedActions(i: InvoiceRec, role: MembershipRole): InvoiceAction[] {
  const admin = role === 'Owner' || role === 'Admin';
  if (i.status === 'Draft') return admin ? ['edit', 'delete', 'duplicate', 'issue'] : ['edit', 'delete', 'duplicate'];
  const actions: InvoiceAction[] = [];
  if (i.kind !== 'Cancellation') actions.push('duplicate');
  if (!admin) return actions;
  actions.push('send');
  if (isInvoiceOpen(i)) actions.push('recordPayment', 'remind');
  if (i.status === 'PartiallyPaid' || i.status === 'Paid') actions.push('removePayment');
  if (i.kind !== 'Cancellation' && i.status !== 'Cancelled') actions.push('cancel');
  return actions;
}

/** Recomputes paid amount and status from the recorded payments (Invoice.ApplyPayments). */
export function applyInvoicePayments(db: MockDb, i: InvoiceRec, at: string = nowIso()): void {
  const payments = db.invoicePayments.filter((p) => p.invoiceId === i.id);
  i.paidAmount = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const gross = invoiceTotals(i).grossTotal;
  if (payments.length > 0 && i.paidAmount >= gross) {
    i.status = 'Paid';
    i.paidOn = payments.map((p) => p.paidOn).sort().at(-1) ?? null;
  } else {
    i.status = i.paidAmount > 0 ? 'PartiallyPaid' : 'Issued';
    i.paidOn = null;
  }
  i.updatedAt = at;
}

export function invoicePdfFileName(i: Pick<InvoiceRec, 'number' | 'kind'>): string {
  if (!i.number) return 'Rechnung_Entwurf.pdf';
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'}_${i.number}.pdf`;
}

export function invoiceXmlFileName(i: Pick<InvoiceRec, 'number' | 'kind'>): string {
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'}_${i.number ?? 'Entwurf'}.xml`;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  Draft: 'Entwurf',
  Issued: 'Offen',
  PartiallyPaid: 'Teilweise bezahlt',
  Paid: 'Bezahlt',
  Cancelled: 'Storniert',
};
