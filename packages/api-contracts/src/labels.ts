import type {
  EmailKind, EmailStatus, FollowUpKind, FollowUpStatus, JobStatus, MembershipRole, QuotationEventType,
  QuotationStatus, SubscriptionStatus, TaxMode, CustomerType,
} from './types';

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
