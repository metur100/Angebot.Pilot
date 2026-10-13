// Domain rules of the mock backend (mirrors apps/api: Quotation.cs, QuotationService, FollowUpCanceller, NotificationService).
import { addDaysIso, todayIso, type ActorType, type CompanySettingsDto, type FollowUpKind, type JobStatus, type QuotationEventType, type QuotationStatus } from '@angebotpilot/api-contracts';
import { newId, nowIso, type CompanyRec, type MockDb, type QuotationRec } from './model';

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
