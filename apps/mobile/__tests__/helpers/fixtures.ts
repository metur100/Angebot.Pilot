import type {
  AuthResponse, CompanySettingsDto, CustomerDto, CustomerListItemDto, DashboardDto, InvoiceAction, InvoiceDto, InvoiceListItemDto,
  InvoiceStatus, JobDto, MeDto, MembershipRole, PagedResult, QuotationDto, QuotationListItemDto, QuotationStatus, TaxRateDto,
} from '@angebotpilot/api-contracts';

export const COMPANY_ID = '0b9f1c2e-5d1a-4c3e-9a7b-111111111111';
export const CUSTOMER_ID = '7c1e2d3f-4a5b-4c6d-8e9f-222222222222';
export const QUOTATION_ID = '9a8b7c6d-5e4f-4a3b-9c2d-333333333333';
export const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

export const me: MeDto = {
  id: 'u-1', email: 'anna@elektro-muster.de', displayName: 'Anna Muster', emailVerified: true,
  companies: [{ companyId: COMPANY_ID, companyName: 'Muster Elektrotechnik', role: 'Owner', membershipId: 'm-1', isDemo: false }],
};

export function auth(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    accessToken: 'access-1', accessTokenExpiresAt: '2026-10-12T12:15:00Z', refreshToken: 'refresh-2',
    refreshTokenExpiresAt: '2026-11-12T12:00:00Z', user: me, ...overrides,
  };
}

export const settings: CompanySettingsDto = {
  quotationPrefix: 'AN', jobPrefix: 'AU', defaultValidityDays: 30, defaultTaxMode: 'Standard',
  defaultIntroText: 'vielen Dank für Ihre Anfrage.', defaultClosingText: 'Mit freundlichen Grüßen', defaultTerms: null,
  paymentTerms: '14 Tage netto', showBankDetails: false, bankAccountHolder: null, iban: null, bic: null, bankName: null,
  emailSignature: null, replyToEmail: null, firstReminderEnabled: true, firstReminderAfterDays: 7, secondReminderEnabled: true,
  secondReminderAfterDays: 14, expiryReminderEnabled: true, expiryReminderDaysBefore: 3, attachPdfToEmails: true,
  notifyOnCustomerDecision: true, invoicePrefix: 'RE', invoicePaymentDays: 14, invoiceIntroText: 'wir erlauben uns, folgende Leistungen zu berechnen.',
  invoiceClosingText: 'Vielen Dank für Ihren Auftrag.', invoiceReminderEnabled: true, invoiceReminderAfterDays: 7,
};

export const taxRates: TaxRateDto[] = [
  { id: 't-19', name: 'Regelsatz', ratePercent: 19, isDefault: true, isArchived: false },
  { id: 't-7', name: 'Ermäßigt', ratePercent: 7, isDefault: false, isArchived: false },
];

export const customerListItem: CustomerListItemDto = {
  id: CUSTOMER_ID, type: 'Business', displayName: 'Bäckerei Sonnenschein GmbH', contactPerson: 'Jonas Becker',
  email: 'info@sonnenschein.example', phone: '+49 30 1234567', city: 'Berlin', isArchived: false, quotationCount: 2,
  acceptedValue: 4200, createdAt: '2026-09-01T08:00:00Z',
};

export const customer: CustomerDto = {
  id: CUSTOMER_ID, type: 'Business', displayName: 'Bäckerei Sonnenschein GmbH', companyName: 'Bäckerei Sonnenschein GmbH',
  salutation: null, firstName: 'Jonas', lastName: 'Becker', email: 'info@sonnenschein.example', phone: '+49 30 1234567',
  billingStreet: 'Hauptstraße 5', billingPostalCode: '10115', billingCity: 'Berlin', billingCountry: 'DE', hasServiceAddress: false,
  serviceStreet: null, servicePostalCode: null, serviceCity: null, serviceCountry: null, vatId: null, notes: null,
  followUpOptOut: false, isArchived: false, isAnonymized: false, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-09-01T08:00:00Z',
  rowVersion: 'AAAAAAAAB9E=',
};

export function quotationListItem(n: number, status: QuotationStatus = 'Sent'): QuotationListItemDto {
  return {
    id: `q-${n}`, number: `AN-2026-00${n}`, title: `Elektroinstallation Halle ${n}`, status, customerId: CUSTOMER_ID,
    customerName: 'Bäckerei Sonnenschein GmbH', issueDate: '2026-10-01', validUntil: '2026-10-31', netTotal: 1000 * n,
    grossTotal: 1190 * n, sentAt: status === 'Draft' ? null : '2026-10-01T09:00:00Z', updatedAt: '2026-10-02T09:00:00Z',
    revisionNumber: 0, hasJob: false,
  };
}

export function page<T>(items: T[], totalCount = items.length, pageNo = 1, pageSize = 20): PagedResult<T> {
  return { items, page: pageNo, pageSize, totalCount };
}

export function quotation(status: QuotationStatus, overrides: Partial<QuotationDto> = {}): QuotationDto {
  const allowed: Record<QuotationStatus, QuotationStatus[]> = {
    Draft: ['Sent', 'Cancelled'], Sent: ['Accepted', 'Rejected', 'Expired', 'Cancelled'], Accepted: [], Rejected: [], Expired: [], Cancelled: [],
  };
  return {
    id: QUOTATION_ID, number: 'AN-2026-0007', title: 'Beleuchtung Verkaufsraum', status, customerId: CUSTOMER_ID,
    customerName: 'Bäckerei Sonnenschein GmbH', recipientName: 'Bäckerei Sonnenschein GmbH', recipientContact: 'Jonas Becker',
    recipientAddress: 'Hauptstraße 5\n10115 Berlin', recipientEmail: 'info@sonnenschein.example', recipientVatId: null,
    issueDate: '2026-10-01', validUntil: '2026-10-31', taxMode: 'Standard', introText: null, closingText: null, terms: null,
    paymentTerms: '14 Tage netto', internalNotes: null, currency: 'EUR',
    lineItems: [
      {
        id: 'li-1', position: 1, title: 'LED-Panel 60×60', description: 'inkl. Montage', quantity: 4, unit: 'Stk.', unitPriceNet: 120,
        discountPercent: 0, taxRatePercent: 19, lineTotalBeforeDiscount: 480, lineDiscount: 0, lineNet: 480,
      },
    ],
    totals: { subtotalBeforeDiscount: 480, discountTotal: 0, netTotal: 480, taxGroups: [{ ratePercent: 19, netAmount: 480, taxAmount: 91.2 }], taxTotal: 91.2, grossTotal: 571.2 },
    revisionNumber: 0, rootQuotationId: null, previousRevisionId: null, revisions: [], createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-01T08:00:00Z', sentAt: status === 'Draft' ? null : '2026-10-01T09:00:00Z', decidedAt: null, decidedByActor: null,
    decisionName: null, decisionNote: null, expiredAt: null, cancelledAt: null, cancellationReason: null, jobId: null,
    hasActivePublicLink: status !== 'Draft', publicLinkLastOpenedAt: null, allowedTransitions: allowed[status], rowVersion: 'AAAAAAAAC1A=',
    invoices: [],
    ...overrides,
  };
}

export const dashboard: DashboardDto = {
  from: '2026-07-14', to: '2026-10-12', draftCount: 1, sentCount: 2, acceptedCount: 1, rejectedCount: 1, expiredCount: 1,
  expiringSoonCount: 1, followUpsDueCount: 0, quotedValueNet: 18450, acceptedValueNet: 4200, conversionRatePercent: 33.33,
  conversionRateDefinition: 'Angenommene ÷ entschiedene Angebote (angenommen, abgelehnt, abgelaufen) im Zeitraum.',
  awaitingDecision: [quotationListItem(1)], expiringSoon: [], upcomingFollowUps: [], recentActivity: [], openJobsCount: 1,
  openInvoicesCount: 0, openInvoicesAmount: 0, overdueInvoicesCount: 0, overdueInvoicesAmount: 0, invoicedNet: 0, paymentsReceived: 0,
  overdueInvoices: [],
};

export const job: JobDto = {
  id: 'j-1', number: 'AU-2026-0001', title: 'Beleuchtung Verkaufsraum', description: null, status: 'Open', customerId: CUSTOMER_ID,
  customerName: 'Bäckerei Sonnenschein GmbH', quotationId: QUOTATION_ID, quotationNumber: 'AN-2026-0007', quotationNetTotal: 480,
  quotationGrossTotal: 571.2, plannedStartDate: null, dueDate: null, assignedUserId: null, assignedUserName: null, notes: null,
  createdAt: '2026-10-05T08:00:00Z', updatedAt: '2026-10-05T08:00:00Z', startedAt: null, completedAt: null, cancelledAt: null,
  allowedTransitions: ['InProgress', 'Completed', 'Cancelled'], rowVersion: 'AAAAAAAAD1A=', invoices: [],
};

// ---------- Invoices ----------
export const INVOICE_ID = '5d4c3b2a-1f0e-4d9c-8b7a-444444444444';

/** Mirrors InvoiceService.AllowedActions on the server (status + role). */
export function invoiceAllowedActions(status: InvoiceStatus, role: MembershipRole = 'Owner', kind: InvoiceDto['kind'] = 'Invoice'): InvoiceAction[] {
  const admin = role !== 'Employee';
  if (status === 'Draft') return admin ? ['edit', 'delete', 'duplicate', 'issue'] : ['edit', 'delete', 'duplicate'];
  const actions: InvoiceAction[] = kind === 'Cancellation' ? [] : ['duplicate'];
  if (!admin) return actions;
  actions.push('send');
  const open = kind === 'Invoice' && (status === 'Issued' || status === 'PartiallyPaid');
  if (open) actions.push('recordPayment', 'remind');
  if (status === 'PartiallyPaid' || status === 'Paid') actions.push('removePayment');
  if (kind === 'Invoice' && status !== 'Cancelled') actions.push('cancel');
  return actions;
}

export function invoice(status: InvoiceStatus, overrides: Partial<InvoiceDto> & { role?: MembershipRole } = {}): InvoiceDto {
  const { role, ...extra } = overrides;
  const kind = extra.kind ?? 'Invoice';
  const issued = status !== 'Draft';
  const paid = status === 'Paid' ? 571.2 : status === 'PartiallyPaid' ? 200 : 0;
  const open = kind === 'Invoice' && (status === 'Issued' || status === 'PartiallyPaid');
  return {
    id: INVOICE_ID, number: issued ? 'RE-2026-0001' : null, kind, status, title: 'Beleuchtung Verkaufsraum', customerId: CUSTOMER_ID,
    customerName: 'Bäckerei Sonnenschein GmbH', recipientName: 'Bäckerei Sonnenschein GmbH', recipientContact: 'Jonas Becker',
    recipientAddress: 'Hauptstraße 5\n10115 Berlin', recipientEmail: 'info@sonnenschein.example', recipientVatId: null,
    issueDate: '2026-10-05', serviceDateFrom: '2026-10-02', serviceDateTo: null, dueDate: '2026-10-19', taxMode: 'Standard',
    introText: 'wir erlauben uns, folgende Leistungen zu berechnen.', closingText: null, paymentTerms: null, buyerReference: null,
    internalNotes: null, currency: 'EUR',
    lineItems: [
      {
        id: 'ili-1', position: 1, title: 'LED-Panel 60×60', description: 'inkl. Montage', quantity: 4, unit: 'Stk.', unitPriceNet: 120,
        discountPercent: 0, taxRatePercent: 19, lineTotalBeforeDiscount: 480, lineDiscount: 0, lineNet: 480,
      },
    ],
    totals: { subtotalBeforeDiscount: 480, discountTotal: 0, netTotal: 480, taxGroups: [{ ratePercent: 19, netAmount: 480, taxAmount: 91.2 }], taxTotal: 91.2, grossTotal: 571.2 },
    paidAmount: paid, openAmount: open ? 571.2 - paid : 0, isOverdue: false, daysOverdue: 0, paidOn: status === 'Paid' ? '2026-10-10' : null,
    payments: paid > 0 ? [{ id: 'pay-1', amount: paid, paidOn: '2026-10-10', method: 'Überweisung', note: null, createdAt: '2026-10-10T09:00:00Z', createdByName: 'Anna Muster' }] : [],
    quotationId: QUOTATION_ID, quotationNumber: 'AN-2026-0007', jobId: 'j-1', jobNumber: 'AU-2026-0001',
    cancelledInvoiceId: null, cancelledInvoiceNumber: null, cancellationInvoiceId: null, cancellationInvoiceNumber: null,
    createdAt: '2026-10-05T08:00:00Z', updatedAt: '2026-10-05T08:00:00Z', issuedAt: issued ? '2026-10-05T09:00:00Z' : null, sentAt: null,
    cancelledAt: null, cancellationReason: null, lastReminderAt: null, reminderCount: 0, hasEInvoice: issued, issueProblems: [],
    allowedActions: invoiceAllowedActions(status, role ?? 'Owner', kind), rowVersion: 'AAAAAAAAE1A=',
    ...extra,
  };
}

export function invoiceListItem(n: number, status: InvoiceStatus = 'Issued', overrides: Partial<InvoiceListItemDto> = {}): InvoiceListItemDto {
  return {
    id: `inv-${n}`, number: status === 'Draft' ? null : `RE-2026-000${n}`, kind: 'Invoice', status, title: `Elektroinstallation Halle ${n}`,
    customerId: CUSTOMER_ID, customerName: 'Bäckerei Sonnenschein GmbH', issueDate: '2026-10-01', dueDate: '2026-10-15', netTotal: 1000 * n,
    grossTotal: 1190 * n, paidAmount: 0, openAmount: status === 'Issued' ? 1190 * n : 0, isOverdue: false, daysOverdue: 0, sentAt: null,
    updatedAt: '2026-10-02T09:00:00Z', ...overrides,
  };
}

export const c = (path: string) => `/companies/${COMPANY_ID}${path}`;
