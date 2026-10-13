// Record types of the in-memory mock database plus small, dependency-free helpers.
// Records are plain JSON (no Dates, no binary) so the whole database can be persisted to localStorage.
import {
  calculateLine,
  type ActorType,
  type CompanySettingsDto,
  type CustomerType,
  type EmailKind,
  type EmailStatus,
  type FollowUpKind,
  type FollowUpStatus,
  type InvoiceEventType,
  type InvoiceKind,
  type InvoiceStatus,
  type JobStatus,
  type LineItemDto,
  type LineItemInput,
  type MembershipRole,
  type MembershipStatus,
  type QuotationEventType,
  type QuotationStatus,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type TaxMode,
  type TemplateLineItemDto,
  type TemplateLineItemInput,
} from '@angebotpilot/api-contracts';

export interface UserRec {
  id: string;
  email: string;
  /** Plain text – this is a mock. */
  password: string;
  displayName: string;
  emailVerified: boolean;
  /** UI language (MeDto.language); German when unset. */
  language?: 'de' | 'en';
  createdAt: string;
}

export interface LogoRec {
  contentType: string;
  base64: string;
}

export interface CompanyRec {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  vatId: string | null;
  taxNumber: string | null;
  brandColor: string;
  timeZone: string;
  language: string;
  isDemo: boolean;
  rowVersion: string;
  createdAt: string;
  updatedAt: string;
  settings: CompanySettingsDto;
  logo: LogoRec | null;
}

export interface MembershipRec {
  id: string;
  companyId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
}

export interface InvitationRec {
  id: string;
  companyId: string;
  email: string;
  role: MembershipRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  status: 'Pending' | 'Accepted' | 'Revoked';
}

export interface TaxRateRec {
  id: string;
  companyId: string;
  name: string;
  ratePercent: number;
  isDefault: boolean;
  isArchived: boolean;
}

export interface CustomerRec {
  id: string;
  companyId: string;
  type: CustomerType;
  companyName: string | null;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  billingStreet: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingCountry: string;
  hasServiceAddress: boolean;
  serviceStreet: string | null;
  servicePostalCode: string | null;
  serviceCity: string | null;
  serviceCountry: string | null;
  vatId: string | null;
  notes: string | null;
  followUpOptOut: boolean;
  isArchived: boolean;
  isAnonymized: boolean;
  createdAt: string;
  updatedAt: string;
  rowVersion: string;
}

export interface QuotationRec {
  id: string;
  companyId: string;
  customerId: string;
  number: string;
  title: string;
  status: QuotationStatus;
  recipientName: string;
  recipientContact: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  recipientVatId: string | null;
  issueDate: string;
  validUntil: string;
  taxMode: TaxMode;
  introText: string | null;
  closingText: string | null;
  terms: string | null;
  paymentTerms: string | null;
  internalNotes: string | null;
  currency: string;
  lineItems: LineItemDto[];
  revisionNumber: number;
  rootQuotationId: string | null;
  previousRevisionId: string | null;
  sourceTemplateId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  sentByUserId: string | null;
  decidedAt: string | null;
  decidedByActor: ActorType | null;
  decidedByUserId: string | null;
  decisionName: string | null;
  decisionNote: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** Raw token of the currently active public link (the real API only stores a hash). */
  publicToken: string | null;
  publicLinkExpiresAt: string | null;
  publicLinkLastOpenedAt: string | null;
  /** Tokens that were revoked – the public page answers 410 for them. */
  revokedTokens: string[];
  deletedAt: string | null;
  rowVersion: string;
}

export interface EventRec {
  id: string;
  companyId: string;
  quotationId: string;
  type: QuotationEventType;
  occurredAt: string;
  actorType: ActorType;
  actorUserId: string | null;
  details: string | null;
}

export interface DeliveryRec {
  id: string;
  companyId: string;
  quotationId: string | null;
  /** Invoice emails (InvoiceSent, PaymentReminder). Optional so older persisted snapshots stay valid. */
  invoiceId?: string | null;
  kind: EmailKind;
  toAddress: string;
  subject: string;
  status: EmailStatus;
  attempts: number;
  createdAt: string;
  handedOffAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
}

export interface FollowUpRec {
  id: string;
  companyId: string;
  quotationId: string;
  kind: FollowUpKind;
  dueAt: string;
  status: FollowUpStatus;
  statusReason: string | null;
  processedAt: string | null;
}

export interface TemplateRec {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  introText: string | null;
  closingText: string | null;
  terms: string | null;
  taxMode: TaxMode | null;
  lineItems: TemplateLineItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface JobRec {
  id: string;
  companyId: string;
  number: string;
  title: string;
  description: string | null;
  status: JobStatus;
  customerId: string;
  quotationId: string;
  plannedStartDate: string | null;
  dueDate: string | null;
  assignedUserId: string | null;
  notes: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  rowVersion: string;
}

export interface InvoiceRec {
  id: string;
  companyId: string;
  customerId: string;
  /** Assigned when the invoice is issued; null for drafts. */
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  title: string;
  recipientName: string;
  recipientContact: string | null;
  recipientAddress: string | null;
  recipientStreet: string | null;
  recipientPostalCode: string | null;
  recipientCity: string | null;
  recipientEmail: string | null;
  recipientVatId: string | null;
  issueDate: string;
  serviceDateFrom: string | null;
  serviceDateTo: string | null;
  dueDate: string;
  taxMode: TaxMode;
  introText: string | null;
  closingText: string | null;
  paymentTerms: string | null;
  buyerReference: string | null;
  internalNotes: string | null;
  currency: string;
  lineItems: LineItemDto[];
  /** Sum of the recorded payments (kept in sync by the payment routes). */
  paidAmount: number;
  paidOn: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
  jobId: string | null;
  jobNumber: string | null;
  cancelledInvoiceId: string | null;
  cancelledInvoiceNumber: string | null;
  cancellationInvoiceId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  issuedByUserId: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
  deletedAt: string | null;
  rowVersion: string;
}

export interface InvoicePaymentRec {
  id: string;
  companyId: string;
  invoiceId: string;
  amount: number;
  paidOn: string;
  method: string | null;
  note: string | null;
  createdAt: string;
  createdByUserId: string;
}

export interface InvoiceEventRec {
  id: string;
  companyId: string;
  invoiceId: string;
  type: InvoiceEventType;
  occurredAt: string;
  actorType: ActorType;
  actorUserId: string | null;
  details: string | null;
}

export interface NotificationRec {
  id: string;
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Audit trail entry; the activity feed is derived from it. */
export interface AuditRec {
  id: string;
  companyId: string;
  userId: string | null;
  action: string;
  summary: string | null;
  entityType: string | null;
  entityId: string | null;
  occurredAt: string;
}

export interface SubscriptionRec {
  companyId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface DevEmailRec {
  id: string;
  to: string;
  subject: string;
  bodyText: string;
  createdAt: string;
  attachments: string[];
}

/** One-time tokens from emails (verification, password reset). */
export interface AuthTokenRec {
  token: string;
  userId: string;
  kind: 'verify' | 'reset';
  createdAt: string;
}

export interface MockDb {
  schemaVersion: number;
  rowCounter: number;
  /** Document sequences keyed `${companyId}:${kind}:${year}`. */
  sequences: Record<string, number>;
  users: UserRec[];
  companies: CompanyRec[];
  memberships: MembershipRec[];
  invitations: InvitationRec[];
  taxRates: TaxRateRec[];
  customers: CustomerRec[];
  quotations: QuotationRec[];
  events: EventRec[];
  deliveries: DeliveryRec[];
  followUps: FollowUpRec[];
  templates: TemplateRec[];
  jobs: JobRec[];
  invoices: InvoiceRec[];
  invoicePayments: InvoicePaymentRec[];
  invoiceEvents: InvoiceEventRec[];
  notifications: NotificationRec[];
  audit: AuditRec[];
  subscriptions: SubscriptionRec[];
  devEmails: DevEmailRec[];
  authTokens: AuthTokenRec[];
}

export const SCHEMA_VERSION = 1;

export function emptyDb(): MockDb {
  return {
    schemaVersion: SCHEMA_VERSION,
    rowCounter: 0,
    sequences: {},
    users: [],
    companies: [],
    memberships: [],
    invitations: [],
    taxRates: [],
    customers: [],
    quotations: [],
    events: [],
    deliveries: [],
    followUps: [],
    templates: [],
    jobs: [],
    invoices: [],
    invoicePayments: [],
    invoiceEvents: [],
    notifications: [],
    audit: [],
    subscriptions: [],
    devEmails: [],
    authTokens: [],
  };
}

// ---------- ids, tokens, versions ----------

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = randomBytes(16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Random URL-safe token (default 32 characters). */
export function randomToken(length = 32): string {
  return [...randomBytes(length)].map((b) => URL_SAFE[b % 64] ?? 'A').join('');
}

export function nextRowVersion(db: MockDb): string {
  db.rowCounter += 1;
  return btoa(`rv:${db.rowCounter.toString().padStart(10, '0')}`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

// ---------- domain helpers ----------

export function customerDisplayName(c: Pick<CustomerRec, 'type' | 'companyName' | 'firstName' | 'lastName' | 'email'>): string {
  const person = [c.firstName, c.lastName].filter((s): s is string => !!s && s.trim() !== '').join(' ');
  if (c.type === 'Business' && c.companyName && c.companyName.trim() !== '') return c.companyName;
  return person !== '' ? person : (c.companyName ?? c.email ?? 'Unbenannter Kunde');
}

export function customerContactPerson(c: Pick<CustomerRec, 'firstName' | 'lastName'>): string | null {
  const person = [c.firstName, c.lastName].filter((s): s is string => !!s && s.trim() !== '').join(' ');
  return person === '' ? null : person;
}

export function formatAddress(...lines: (string | null | undefined)[]): string {
  return lines.filter((l): l is string => !!l && l.trim() !== '').map((l) => l.trim()).join('\n');
}

/** Recipient snapshot exactly like QuotationMapping.SnapshotRecipient of the API. */
export function snapshotRecipient(q: QuotationRec, c: CustomerRec): void {
  const withSalutation = [c.salutation, c.firstName, c.lastName].filter((s): s is string => !!s && s.trim() !== '').join(' ');
  if (c.type === 'Business' && c.companyName && c.companyName.trim() !== '') {
    q.recipientName = c.companyName;
    q.recipientContact = withSalutation === '' ? null : withSalutation;
  } else {
    q.recipientName = withSalutation === '' ? customerDisplayName(c) : withSalutation;
    q.recipientContact = null;
  }
  q.recipientAddress = formatAddress(
    c.billingStreet,
    [c.billingPostalCode, c.billingCity].filter((s): s is string => !!s && s.trim() !== '').join(' '),
    c.billingCountry === 'DE' ? null : c.billingCountry,
  ) || null;
  q.recipientEmail = c.email;
  q.recipientVatId = c.vatId;
}

export function buildLineItems(inputs: readonly LineItemInput[]): LineItemDto[] {
  return inputs.map((input, index) => {
    const calc = calculateLine(input.quantity, input.unitPriceNet, input.discountPercent);
    return {
      id: newId(),
      position: index + 1,
      title: input.title.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      quantity: input.quantity,
      unit: input.unit.trim() || 'Stk.',
      unitPriceNet: input.unitPriceNet,
      discountPercent: input.discountPercent,
      taxRatePercent: input.taxRatePercent,
      lineTotalBeforeDiscount: calc.beforeDiscount,
      lineDiscount: calc.discount,
      lineNet: calc.net,
    };
  });
}

export function buildTemplateLineItems(inputs: readonly TemplateLineItemInput[]): TemplateLineItemDto[] {
  return inputs.map((input, index) => ({
    id: newId(),
    position: index + 1,
    title: input.title.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    quantity: input.quantity,
    unit: input.unit.trim() || 'Stk.',
    unitPriceNet: input.unitPriceNet,
    discountPercent: input.discountPercent,
    taxRatePercent: input.taxRatePercent ?? null,
  }));
}

/** Recipient snapshot of an invoice like InvoiceService.SnapshotRecipient of the API (incl. the structured address). */
export function snapshotInvoiceRecipient(i: InvoiceRec, c: CustomerRec): void {
  const withSalutation = [c.salutation, c.firstName, c.lastName].filter((s): s is string => !!s && s.trim() !== '').join(' ');
  if (c.type === 'Business' && c.companyName && c.companyName.trim() !== '') {
    i.recipientName = c.companyName;
    i.recipientContact = withSalutation === '' ? null : withSalutation;
  } else {
    i.recipientName = withSalutation === '' ? customerDisplayName(c) : withSalutation;
    i.recipientContact = null;
  }
  const trimmed = (v: string | null) => (v && v.trim() !== '' ? v.trim() : null);
  i.recipientStreet = trimmed(c.billingStreet);
  i.recipientPostalCode = trimmed(c.billingPostalCode);
  i.recipientCity = trimmed(c.billingCity);
  i.recipientAddress = formatAddress(
    c.billingStreet,
    [c.billingPostalCode, c.billingCity].filter((s): s is string => !!s && s.trim() !== '').join(' '),
    c.billingCountry === 'DE' ? null : c.billingCountry,
  ) || null;
  i.recipientEmail = c.email;
  i.recipientVatId = c.vatId;
}

/** Next document number, e.g. AN-2026-0042. Numbers are never reused (invoices: gap-free, assigned when issued). */
export function nextNumber(db: MockDb, companyId: string, kind: 'quotation' | 'job' | 'invoice', prefix: string, year: number): string {
  const key = `${companyId}:${kind}:${year}`;
  const value = (db.sequences[key] ?? 0) + 1;
  db.sequences[key] = value;
  return `${prefix}-${year}-${value.toString().padStart(4, '0')}`;
}

export function defaultSettings(companyName: string, overrides: Partial<CompanySettingsDto> = {}): CompanySettingsDto {
  return {
    quotationPrefix: 'AN',
    jobPrefix: 'AU',
    defaultValidityDays: 30,
    defaultTaxMode: 'Standard',
    defaultIntroText: 'Sehr geehrte Damen und Herren,\nvielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:',
    defaultClosingText: 'Wir würden uns freuen, den Auftrag für Sie ausführen zu dürfen. Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.\n\nMit freundlichen Grüßen',
    defaultTerms: null,
    paymentTerms: 'Zahlbar innerhalb von 14 Tagen nach Rechnungsstellung ohne Abzug.',
    showBankDetails: false,
    bankAccountHolder: null,
    iban: null,
    bic: null,
    bankName: null,
    emailSignature: `Mit freundlichen Grüßen\n${companyName}`,
    replyToEmail: null,
    firstReminderEnabled: true,
    firstReminderAfterDays: 7,
    secondReminderEnabled: true,
    secondReminderAfterDays: 14,
    expiryReminderEnabled: true,
    expiryReminderDaysBefore: 3,
    attachPdfToEmails: true,
    notifyOnCustomerDecision: true,
    invoicePrefix: 'RE',
    invoicePaymentDays: 14,
    invoiceIntroText: 'Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihren Auftrag. Für unsere Leistungen erlauben wir uns, Folgendes in Rechnung zu stellen:',
    invoiceClosingText: 'Vielen Dank für die gute Zusammenarbeit.\n\nMit freundlichen Grüßen',
    invoiceReminderEnabled: false,
    invoiceReminderAfterDays: 7,
    ...overrides,
  };
}
