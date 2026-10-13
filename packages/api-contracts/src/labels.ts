import type {
  EmailKind, EmailStatus, FollowUpKind, FollowUpStatus, JobStatus, MembershipRole, QuotationEventType,
  QuotationStatus, SubscriptionStatus, TaxMode, CustomerType,
} from './types';
import type * as T from './types';

/** Semantic tone for status badges. UIs must always render the text label too (never colour alone). */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export const quotationStatusLabel: Record<QuotationStatus, string> = {
  Draft: 'Entwurf',
  Sent: 'Versendet',
  Accepted: 'Angenommen',
  Rejected: 'Abgelehnt',
  Expired: 'Abgelaufen',
  Cancelled: 'Storniert',
};

export const quotationStatusTone: Record<QuotationStatus, Tone> = {
  Draft: 'neutral',
  Sent: 'info',
  Accepted: 'success',
  Rejected: 'danger',
  Expired: 'warning',
  Cancelled: 'muted',
};

export const jobStatusLabel: Record<JobStatus, string> = {
  Open: 'Offen',
  InProgress: 'In Arbeit',
  Completed: 'Abgeschlossen',
  Cancelled: 'Storniert',
};

export const jobStatusTone: Record<JobStatus, Tone> = {
  Open: 'info',
  InProgress: 'warning',
  Completed: 'success',
  Cancelled: 'muted',
};

export const roleLabel: Record<MembershipRole, string> = {
  Owner: 'Inhaber:in',
  Admin: 'Administrator:in',
  Employee: 'Mitarbeiter:in',
};

export const customerTypeLabel: Record<CustomerType, string> = {
  Business: 'Geschäftskunde',
  Private: 'Privatkunde',
};

export const taxModeLabel: Record<TaxMode, string> = {
  Standard: 'Regelbesteuerung (USt. je Position)',
  SmallBusiness: 'Kleinunternehmerregelung (§ 19 UStG)',
  ReverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)',
};

export const emailKindLabel: Record<EmailKind, string> = {
  QuotationSent: 'Angebotsversand',
  FirstReminder: '1. Erinnerung',
  SecondReminder: '2. Erinnerung',
  ExpiryReminder: 'Erinnerung vor Ablauf',
  InvoiceSent: 'Rechnungsversand',
  PaymentReminder: 'Zahlungserinnerung',
  Invitation: 'Einladung',
  PasswordReset: 'Passwort zurücksetzen',
  EmailVerification: 'E-Mail-Bestätigung',
  DecisionNotification: 'Benachrichtigung',
};

/** "HandedOff" deliberately avoids claiming inbox delivery. */
export const emailStatusLabel: Record<EmailStatus, string> = {
  Pending: 'In Warteschlange',
  Sending: 'Wird gesendet',
  HandedOff: 'An Mailserver übergeben',
  RetryScheduled: 'Erneuter Versuch geplant',
  Failed: 'Fehlgeschlagen',
  Cancelled: 'Abgebrochen',
};

export const emailStatusTone: Record<EmailStatus, Tone> = {
  Pending: 'neutral',
  Sending: 'info',
  HandedOff: 'success',
  RetryScheduled: 'warning',
  Failed: 'danger',
  Cancelled: 'muted',
};

export const followUpKindLabel: Record<FollowUpKind, string> = {
  FirstReminder: '1. Erinnerung',
  SecondReminder: '2. Erinnerung',
  ExpiryReminder: 'Erinnerung vor Ablauf',
};

export const followUpStatusLabel: Record<FollowUpStatus, string> = {
  Scheduled: 'Geplant',
  Queued: 'Versand ausgelöst',
  Cancelled: 'Abgebrochen',
  Skipped: 'Übersprungen',
};

export const subscriptionStatusLabel: Record<SubscriptionStatus, string> = {
  Trialing: 'Testphase',
  Active: 'Aktiv',
  PastDue: 'Zahlung ausstehend',
  Canceled: 'Gekündigt',
  Expired: 'Abgelaufen',
};

export const quotationEventLabel: Record<QuotationEventType, string> = {
  Created: 'Angebot erstellt',
  Updated: 'Angebot bearbeitet',
  Sent: 'Per E-Mail versendet',
  MarkedAsSent: 'Als versendet markiert',
  ReminderQueued: 'Erinnerung ausgelöst',
  Accepted: 'Angenommen',
  Rejected: 'Abgelehnt',
  Expired: 'Abgelaufen',
  Cancelled: 'Storniert',
  RevisionCreated: 'Revision erstellt',
  SupersededByRevision: 'Durch Revision ersetzt',
  ConvertedToJob: 'In Auftrag umgewandelt',
  PdfGenerated: 'PDF erzeugt',
  PublicLinkCreated: 'Kundenlink erstellt',
  PublicLinkRevoked: 'Kundenlink widerrufen',
  PublicLinkOpened: 'Kundenlink geöffnet',
  EmailHandedOff: 'E-Mail an Mailserver übergeben',
  EmailFailed: 'E-Mail-Versand fehlgeschlagen',
  FollowUpsCancelled: 'Erinnerungen abgebrochen',
  Duplicated: 'Dupliziert',
  CustomerOptedOut: 'Kunde hat Erinnerungen abbestellt',
};

export const unitSuggestions = ['Stk.', 'Std.', 'Tag', 'pauschal', 'm', 'm²', 'm³', 'kg', 'l', 'km', 'Monat'];

// ---------- Invoices ----------
export const invoiceStatusLabel: Record<T.InvoiceStatus, string> = {
  Draft: 'Entwurf', Issued: 'Offen', PartiallyPaid: 'Teilweise bezahlt', Paid: 'Bezahlt', Cancelled: 'Storniert',
};
export const invoiceStatusTone: Record<T.InvoiceStatus, Tone> = {
  Draft: 'neutral', Issued: 'info', PartiallyPaid: 'warning', Paid: 'success', Cancelled: 'muted',
};
/** Label shown in lists/badges: cancellation invoices and overdue invoices get their own wording. */
export function invoiceDisplayStatus(i: { kind: T.InvoiceKind; status: T.InvoiceStatus; isOverdue: boolean }): { label: string; tone: Tone } {
  if (i.kind === 'Cancellation') return { label: 'Stornorechnung', tone: 'muted' };
  if (i.isOverdue) return { label: i.status === 'PartiallyPaid' ? 'Teilweise bezahlt · überfällig' : 'Überfällig', tone: 'danger' };
  return { label: invoiceStatusLabel[i.status], tone: invoiceStatusTone[i.status] };
}
export const invoiceEventLabel: Record<T.InvoiceEventType, string> = {
  Created: 'Entwurf erstellt', Updated: 'Bearbeitet', Issued: 'Rechnung gestellt', Sent: 'Per E-Mail versendet',
  MarkedAsSent: 'Als versendet markiert', PaymentRecorded: 'Zahlung erfasst', PaymentRemoved: 'Zahlung entfernt', Paid: 'Vollständig bezahlt',
  Cancelled: 'Storniert', CancellationCreated: 'Stornorechnung erstellt', ReminderQueued: 'Zahlungserinnerung',
  EmailHandedOff: 'E-Mail übergeben', EmailFailed: 'E-Mail fehlgeschlagen', Duplicated: 'Kopiert',
};
/** Common payment methods offered in the payment dialog (free text is allowed too). */
export const paymentMethodSuggestions = ['Überweisung', 'Lastschrift', 'Bar', 'EC-/Kreditkarte', 'PayPal'];
