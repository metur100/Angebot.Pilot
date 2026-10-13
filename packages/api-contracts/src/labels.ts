import type {
  EmailKind, EmailStatus, FollowUpKind, FollowUpStatus, JobStatus, MembershipRole, QuotationEventType,
  QuotationStatus, SubscriptionStatus, TaxMode, CustomerType,
} from './types';
import type * as T from './types';
import { getLocale, onLocaleChange, tr, type Locale } from './locale';

/**
 * A label table that follows the UI language: the returned object is updated in place when the locale changes,
 * so lookups like `jobStatusLabel[status]` made during render always use the current language.
 */
function localized<V extends object>(values: Record<Locale, V>): V {
  const initial = values[getLocale()];
  const live = (Array.isArray(initial) ? [...initial] : { ...initial }) as V;
  onLocaleChange((locale) => {
    if (Array.isArray(live)) live.splice(0, live.length, ...(values[locale] as unknown[]));
    else Object.assign(live, values[locale]);
  });
  return live;
}

/** Semantic tone for status badges. UIs must always render the text label too (never colour alone). */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export const quotationStatusLabel: Record<QuotationStatus, string> = localized({
  de: {
    Draft: 'Entwurf',
    Sent: 'Versendet',
    Accepted: 'Angenommen',
    Rejected: 'Abgelehnt',
    Expired: 'Abgelaufen',
    Cancelled: 'Storniert',
  },
  en: { Draft: 'Draft', Sent: 'Sent', Accepted: 'Accepted', Rejected: 'Rejected', Expired: 'Expired', Cancelled: 'Cancelled' },
});

export const quotationStatusTone: Record<QuotationStatus, Tone> = {
  Draft: 'neutral',
  Sent: 'info',
  Accepted: 'success',
  Rejected: 'danger',
  Expired: 'warning',
  Cancelled: 'muted',
};

export const jobStatusLabel: Record<JobStatus, string> = localized({
  de: {
    Open: 'Offen',
    InProgress: 'In Arbeit',
    Completed: 'Abgeschlossen',
    Cancelled: 'Storniert',
  },
  en: { Open: 'Open', InProgress: 'In progress', Completed: 'Completed', Cancelled: 'Cancelled' },
});

export const jobStatusTone: Record<JobStatus, Tone> = {
  Open: 'info',
  InProgress: 'warning',
  Completed: 'success',
  Cancelled: 'muted',
};

export const roleLabel: Record<MembershipRole, string> = localized({
  de: {
    Owner: 'Inhaber:in',
    Admin: 'Administrator:in',
    Employee: 'Mitarbeiter:in',
  },
  en: { Owner: 'Owner', Admin: 'Administrator', Employee: 'Employee' },
});

export const customerTypeLabel: Record<CustomerType, string> = localized({
  de: {
    Business: 'Geschäftskunde',
    Private: 'Privatkunde',
  },
  en: { Business: 'Business customer', Private: 'Private customer' },
});

export const taxModeLabel: Record<TaxMode, string> = localized({
  de: {
    Standard: 'Regelbesteuerung (USt. je Position)',
    SmallBusiness: 'Kleinunternehmerregelung (§ 19 UStG)',
    ReverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)',
  },
  en: {
    Standard: 'Standard taxation (VAT per line item)',
    SmallBusiness: 'Small business scheme (§ 19 UStG)',
    ReverseCharge: 'Reverse charge (§ 13b UStG)',
  },
});

export const emailKindLabel: Record<EmailKind, string> = localized({
  de: {
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
  },
  en: {
    QuotationSent: 'Quotation sent', FirstReminder: '1st reminder', SecondReminder: '2nd reminder', ExpiryReminder: 'Reminder before expiry',
    InvoiceSent: 'Invoice sent', PaymentReminder: 'Payment reminder', Invitation: 'Invitation', PasswordReset: 'Password reset',
    EmailVerification: 'Email verification', DecisionNotification: 'Notification',
  },
});

/** "HandedOff" deliberately avoids claiming inbox delivery. */
export const emailStatusLabel: Record<EmailStatus, string> = localized({
  de: {
    Pending: 'In Warteschlange',
    Sending: 'Wird gesendet',
    HandedOff: 'An Mailserver übergeben',
    RetryScheduled: 'Erneuter Versuch geplant',
    Failed: 'Fehlgeschlagen',
    Cancelled: 'Abgebrochen',
  },
  en: {
    Pending: 'Queued', Sending: 'Sending', HandedOff: 'Handed to mail server', RetryScheduled: 'Retry scheduled', Failed: 'Failed', Cancelled: 'Cancelled',
  },
});

export const emailStatusTone: Record<EmailStatus, Tone> = {
  Pending: 'neutral',
  Sending: 'info',
  HandedOff: 'success',
  RetryScheduled: 'warning',
  Failed: 'danger',
  Cancelled: 'muted',
};

export const followUpKindLabel: Record<FollowUpKind, string> = localized({
  de: {
    FirstReminder: '1. Erinnerung',
    SecondReminder: '2. Erinnerung',
    ExpiryReminder: 'Erinnerung vor Ablauf',
  },
  en: { FirstReminder: '1st reminder', SecondReminder: '2nd reminder', ExpiryReminder: 'Reminder before expiry' },
});

export const followUpStatusLabel: Record<FollowUpStatus, string> = localized({
  de: {
    Scheduled: 'Geplant',
    Queued: 'Versand ausgelöst',
    Cancelled: 'Abgebrochen',
    Skipped: 'Übersprungen',
  },
  en: { Scheduled: 'Scheduled', Queued: 'Sending triggered', Cancelled: 'Cancelled', Skipped: 'Skipped' },
});

export const subscriptionStatusLabel: Record<SubscriptionStatus, string> = localized({
  de: {
    Trialing: 'Testphase',
    Active: 'Aktiv',
    PastDue: 'Zahlung ausstehend',
    Canceled: 'Gekündigt',
    Expired: 'Abgelaufen',
  },
  en: { Trialing: 'Trial', Active: 'Active', PastDue: 'Payment due', Canceled: 'Cancelled', Expired: 'Expired' },
});

export const quotationEventLabel: Record<QuotationEventType, string> = localized({
  de: {
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
  },
  en: {
    Created: 'Quotation created', Updated: 'Quotation edited', Sent: 'Sent by email', MarkedAsSent: 'Marked as sent',
    ReminderQueued: 'Reminder triggered', Accepted: 'Accepted', Rejected: 'Rejected', Expired: 'Expired', Cancelled: 'Cancelled',
    RevisionCreated: 'Revision created', SupersededByRevision: 'Replaced by revision', ConvertedToJob: 'Converted to job',
    PdfGenerated: 'PDF generated', PublicLinkCreated: 'Customer link created', PublicLinkRevoked: 'Customer link revoked',
    PublicLinkOpened: 'Customer link opened', EmailHandedOff: 'Email handed to mail server', EmailFailed: 'Email delivery failed',
    FollowUpsCancelled: 'Reminders cancelled', Duplicated: 'Duplicated', CustomerOptedOut: 'Customer unsubscribed from reminders',
  },
});

/** Units are printed on the (German) documents, so the suggestions stay German in both UI languages. */
export const unitSuggestions = ['Stk.', 'Std.', 'Tag', 'pauschal', 'm', 'm²', 'm³', 'kg', 'l', 'km', 'Monat'];

// ---------- Invoices ----------
export const invoiceStatusLabel: Record<T.InvoiceStatus, string> = localized({
  de: {
    Draft: 'Entwurf', Issued: 'Offen', PartiallyPaid: 'Teilweise bezahlt', Paid: 'Bezahlt', Cancelled: 'Storniert',
  },
  en: { Draft: 'Draft', Issued: 'Open', PartiallyPaid: 'Partially paid', Paid: 'Paid', Cancelled: 'Cancelled' },
});
export const invoiceStatusTone: Record<T.InvoiceStatus, Tone> = {
  Draft: 'neutral', Issued: 'info', PartiallyPaid: 'warning', Paid: 'success', Cancelled: 'muted',
};
/** Label shown in lists/badges: cancellation invoices and overdue invoices get their own wording. */
export function invoiceDisplayStatus(i: { kind: T.InvoiceKind; status: T.InvoiceStatus; isOverdue: boolean }): { label: string; tone: Tone } {
  if (i.kind === 'Cancellation') return { label: tr('Stornorechnung', 'Cancellation invoice'), tone: 'muted' };
  if (i.isOverdue) {
    return {
      label: i.status === 'PartiallyPaid' ? tr('Teilweise bezahlt · überfällig', 'Partially paid · overdue') : tr('Überfällig', 'Overdue'),
      tone: 'danger',
    };
  }
  return { label: invoiceStatusLabel[i.status], tone: invoiceStatusTone[i.status] };
}
export const invoiceEventLabel: Record<T.InvoiceEventType, string> = localized({
  de: {
    Created: 'Entwurf erstellt', Updated: 'Bearbeitet', Issued: 'Rechnung gestellt', Sent: 'Per E-Mail versendet',
    MarkedAsSent: 'Als versendet markiert', PaymentRecorded: 'Zahlung erfasst', PaymentRemoved: 'Zahlung entfernt', Paid: 'Vollständig bezahlt',
    Cancelled: 'Storniert', CancellationCreated: 'Stornorechnung erstellt', ReminderQueued: 'Zahlungserinnerung',
    EmailHandedOff: 'E-Mail übergeben', EmailFailed: 'E-Mail fehlgeschlagen', Duplicated: 'Kopiert',
  },
  en: {
    Created: 'Draft created', Updated: 'Edited', Issued: 'Invoice issued', Sent: 'Sent by email', MarkedAsSent: 'Marked as sent',
    PaymentRecorded: 'Payment recorded', PaymentRemoved: 'Payment removed', Paid: 'Paid in full', Cancelled: 'Cancelled',
    CancellationCreated: 'Cancellation invoice created', ReminderQueued: 'Payment reminder', EmailHandedOff: 'Email handed off',
    EmailFailed: 'Email failed', Duplicated: 'Copied',
  },
});
/** Common payment methods offered in the payment dialog (free text is allowed too). */
export const paymentMethodSuggestions: string[] = localized({
  de: ['Überweisung', 'Lastschrift', 'Bar', 'EC-/Kreditkarte', 'PayPal'],
  en: ['Bank transfer', 'Direct debit', 'Cash', 'Debit/credit card', 'PayPal'],
});
