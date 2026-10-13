// DTOs of the AngebotPilot REST API (/api/v1). Mirrors apps/api/src/AngebotPilot.Application/Contracts/Dtos.cs.
// Enums are serialised as strings. DateOnly values are ISO dates (yyyy-MM-dd); timestamps are ISO 8601 in UTC.
// Monetary values are JSON numbers with at most 2 decimals; use money.ts for any arithmetic.

export type Guid = string;
export type IsoDate = string; // yyyy-MM-dd
export type IsoDateTime = string;

export type MembershipRole = 'Employee' | 'Admin' | 'Owner';
export type MembershipStatus = 'Active' | 'Deactivated';
export type CustomerType = 'Business' | 'Private';
export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired' | 'Cancelled';
export type TaxMode = 'Standard' | 'SmallBusiness' | 'ReverseCharge';
export type ActorType = 'User' | 'Customer' | 'System';
export type QuotationEventType =
  | 'Created' | 'Updated' | 'Sent' | 'MarkedAsSent' | 'ReminderQueued' | 'Accepted' | 'Rejected'
  | 'Expired' | 'Cancelled' | 'RevisionCreated' | 'SupersededByRevision' | 'ConvertedToJob'
  | 'PdfGenerated' | 'PublicLinkCreated' | 'PublicLinkRevoked' | 'PublicLinkOpened' | 'EmailHandedOff'
  | 'EmailFailed' | 'FollowUpsCancelled' | 'Duplicated' | 'CustomerOptedOut';
export type EmailKind =
  | 'QuotationSent' | 'FirstReminder' | 'SecondReminder' | 'ExpiryReminder' | 'Invitation'
  | 'PasswordReset' | 'EmailVerification' | 'DecisionNotification' | 'InvoiceSent' | 'PaymentReminder';
/** HandedOff = accepted by the outgoing mail server. It is NOT proof of inbox delivery. */
export type EmailStatus = 'Pending' | 'Sending' | 'HandedOff' | 'RetryScheduled' | 'Failed' | 'Cancelled';
export type FollowUpKind = 'FirstReminder' | 'SecondReminder' | 'ExpiryReminder';
export type FollowUpStatus = 'Scheduled' | 'Queued' | 'Cancelled' | 'Skipped';
export type JobStatus = 'Open' | 'InProgress' | 'Completed' | 'Cancelled';
export type ClientKind = 'Web' | 'Mobile';
export type SubscriptionPlan = 'Trial' | 'Starter' | 'Team' | 'Business';
export type SubscriptionStatus = 'Trialing' | 'Active' | 'PastDue' | 'Canceled' | 'Expired';
export type SendMode = 'Email' | 'Manual';
/** Issued = open (finalised, numbered, awaiting payment). "Overdue" is derived, see InvoiceListItemDto.isOverdue. */
export type InvoiceStatus = 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid' | 'Cancelled';
/** Cancellation = Stornorechnung. Its amounts are positive in the API and shown negated. */
export type InvoiceKind = 'Invoice' | 'Cancellation';
export type InvoiceEventType =
  | 'Created' | 'Updated' | 'Issued' | 'Sent' | 'MarkedAsSent' | 'PaymentRecorded' | 'PaymentRemoved'
  | 'Paid' | 'Cancelled' | 'CancellationCreated' | 'ReminderQueued' | 'EmailHandedOff' | 'EmailFailed' | 'Duplicated';
/** Actions the current member may perform on an invoice (computed by the server from status and role). */
export type InvoiceAction = 'edit' | 'delete' | 'duplicate' | 'issue' | 'send' | 'recordPayment' | 'removePayment' | 'remind' | 'cancel';

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/** RFC 7807 problem details as returned by the API. */
export interface ApiProblem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  /** Stable machine-readable error code, e.g. "validation_failed", "concurrency_conflict", "quotation_not_editable". */
  code?: string;
  /** Field errors keyed by camelCase property path, e.g. "lineItems[0].quantity". */
  errors?: Record<string, string[]>;
  traceId?: string;
}

// ---------- Auth ----------
export interface RegisterRequest { email: string; password: string; displayName: string; acceptTerms: boolean; client?: ClientKind }
export interface LoginRequest { email: string; password: string; client?: ClientKind }
export interface RefreshRequest { refreshToken?: string | null }
export interface LogoutRequest { refreshToken?: string | null }
export interface ForgotPasswordRequest { email: string }
export interface ResetPasswordRequest { token: string; newPassword: string }
export interface VerifyEmailRequest { token: string }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface UpdateProfileRequest { displayName: string }
export interface DeleteAccountRequest { password: string }

/** refreshToken is null only when the API is configured for the HttpOnly cookie transport (same-site web deployments). */
export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: IsoDateTime;
  refreshToken: string | null;
  refreshTokenExpiresAt: IsoDateTime;
  user: MeDto;
}
export interface MeDto { id: Guid; email: string; displayName: string; emailVerified: boolean; companies: MembershipDto[] }
export interface MembershipDto { companyId: Guid; companyName: string; role: MembershipRole; membershipId: Guid; isDemo: boolean }
export interface InvitationPreviewDto { companyName: string; email: string; role: MembershipRole; expiresAt: IsoDateTime }
export interface AcceptInvitationRequest { token: string }

// ---------- Company ----------
export interface CreateCompanyRequest {
  name: string;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  vatId?: string | null;
  defaultTaxMode: TaxMode;
  quotationPrefix?: string | null;
}
export interface CompanyDto {
  id: Guid; name: string; addressLine1: string | null; addressLine2: string | null; postalCode: string | null;
  city: string | null; country: string; email: string | null; phone: string | null; website: string | null;
  vatId: string | null; taxNumber: string | null; brandColor: string; timeZone: string; language: string;
  hasLogo: boolean; isDemo: boolean; myRole: MembershipRole; rowVersion: string;
}
export interface UpdateCompanyRequest {
  name: string; addressLine1?: string | null; addressLine2?: string | null; postalCode?: string | null; city?: string | null;
  country: string; email?: string | null; phone?: string | null; website?: string | null; vatId?: string | null;
  taxNumber?: string | null; brandColor: string; timeZone: string; language: string; rowVersion: string;
}
export interface CompanySettingsDto {
  quotationPrefix: string; jobPrefix: string; defaultValidityDays: number; defaultTaxMode: TaxMode;
  defaultIntroText: string | null; defaultClosingText: string | null; defaultTerms: string | null; paymentTerms: string | null;
  showBankDetails: boolean; bankAccountHolder: string | null; iban: string | null; bic: string | null; bankName: string | null;
  emailSignature: string | null; replyToEmail: string | null;
  firstReminderEnabled: boolean; firstReminderAfterDays: number;
  secondReminderEnabled: boolean; secondReminderAfterDays: number;
  expiryReminderEnabled: boolean; expiryReminderDaysBefore: number;
  attachPdfToEmails: boolean; notifyOnCustomerDecision: boolean;
  /** Invoice settings: always returned. On PUT, omitted or null values are left unchanged. */
  invoicePrefix: string; invoicePaymentDays: number; invoiceIntroText: string | null; invoiceClosingText: string | null;
  invoiceReminderEnabled: boolean; invoiceReminderAfterDays: number;
}
export interface TaxRateDto { id: Guid; name: string; ratePercent: number; isDefault: boolean; isArchived: boolean }
export interface UpsertTaxRateRequest { name: string; ratePercent: number; isDefault: boolean; isArchived: boolean }
export interface MemberDto { membershipId: Guid; userId: Guid; displayName: string; email: string; role: MembershipRole; status: MembershipStatus; joinedAt: IsoDateTime }
export interface UpdateMemberRequest { role: MembershipRole }
export interface InvitationDto { id: Guid; email: string; role: MembershipRole; createdAt: IsoDateTime; expiresAt: IsoDateTime; isExpired: boolean }
export interface CreateInvitationRequest { email: string; role: MembershipRole }
export interface DeleteCompanyRequest { confirmName: string }

// ---------- Customers ----------
export interface CustomerListItemDto {
  id: Guid; type: CustomerType; displayName: string; contactPerson: string | null; email: string | null; phone: string | null;
  city: string | null; isArchived: boolean; quotationCount: number; acceptedValue: number; createdAt: IsoDateTime;
}
export interface CustomerDto {
  id: Guid; type: CustomerType; displayName: string; companyName: string | null; salutation: string | null;
  firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  billingStreet: string | null; billingPostalCode: string | null; billingCity: string | null; billingCountry: string;
  hasServiceAddress: boolean; serviceStreet: string | null; servicePostalCode: string | null; serviceCity: string | null; serviceCountry: string | null;
  vatId: string | null; notes: string | null; followUpOptOut: boolean; isArchived: boolean; isAnonymized: boolean;
  createdAt: IsoDateTime; updatedAt: IsoDateTime; rowVersion: string;
}
export interface UpsertCustomerRequest {
  type: CustomerType; companyName?: string | null; salutation?: string | null; firstName?: string | null; lastName?: string | null;
  email?: string | null; phone?: string | null; billingStreet?: string | null; billingPostalCode?: string | null; billingCity?: string | null;
  billingCountry?: string | null; hasServiceAddress: boolean; serviceStreet?: string | null; servicePostalCode?: string | null;
  serviceCity?: string | null; serviceCountry?: string | null; vatId?: string | null; notes?: string | null;
  followUpOptOut: boolean; rowVersion?: string | null;
}
export interface CustomerListQuery {
  search?: string; type?: CustomerType; status?: 'active' | 'archived' | 'all';
  sort?: 'name' | '-name' | 'createdAt' | '-createdAt'; page?: number; pageSize?: number;
}
export interface DeleteCustomerResponse { result: 'deleted' | 'anonymized' }

// ---------- Quotations ----------
export interface LineItemInput {
  title: string; description?: string | null; quantity: number; unit: string; unitPriceNet: number;
  discountPercent: number; taxRatePercent: number;
}
export interface LineItemDto extends LineItemInput {
  id: Guid; position: number; description: string | null;
  lineTotalBeforeDiscount: number; lineDiscount: number; lineNet: number;
}
export interface TaxGroupDto { ratePercent: number; netAmount: number; taxAmount: number }
export interface TotalsDto {
  subtotalBeforeDiscount: number; discountTotal: number; netTotal: number; taxGroups: TaxGroupDto[]; taxTotal: number; grossTotal: number;
}
export interface CalculateRequest { taxMode: TaxMode; lineItems: LineItemInput[] }
export interface CreateQuotationRequest {
  customerId: Guid; title?: string | null; templateId?: Guid | null; issueDate?: IsoDate | null; validUntil?: IsoDate | null;
  taxMode?: TaxMode | null; introText?: string | null; closingText?: string | null; terms?: string | null;
  paymentTerms?: string | null; internalNotes?: string | null; lineItems?: LineItemInput[] | null;
}
export interface UpdateQuotationRequest {
  customerId: Guid; title: string; issueDate: IsoDate; validUntil: IsoDate; taxMode: TaxMode;
  introText?: string | null; closingText?: string | null; terms?: string | null; paymentTerms?: string | null;
  internalNotes?: string | null; lineItems: LineItemInput[]; rowVersion: string;
}
export interface QuotationListItemDto {
  id: Guid; number: string; title: string; status: QuotationStatus; customerId: Guid; customerName: string;
  issueDate: IsoDate; validUntil: IsoDate; netTotal: number; grossTotal: number; sentAt: IsoDateTime | null;
  updatedAt: IsoDateTime; revisionNumber: number; hasJob: boolean;
}
export interface RevisionLinkDto { id: Guid; number: string; revisionNumber: number; status: QuotationStatus }
export interface QuotationDto {
  id: Guid; number: string; title: string; status: QuotationStatus; customerId: Guid; customerName: string;
  recipientName: string; recipientContact: string | null; recipientAddress: string | null; recipientEmail: string | null; recipientVatId: string | null;
  issueDate: IsoDate; validUntil: IsoDate; taxMode: TaxMode; introText: string | null; closingText: string | null;
  terms: string | null; paymentTerms: string | null; internalNotes: string | null; currency: string;
  lineItems: LineItemDto[]; totals: TotalsDto; revisionNumber: number; rootQuotationId: Guid | null;
  previousRevisionId: Guid | null; revisions: RevisionLinkDto[]; createdAt: IsoDateTime; updatedAt: IsoDateTime;
  sentAt: IsoDateTime | null; decidedAt: IsoDateTime | null; decidedByActor: ActorType | null; decisionName: string | null;
  decisionNote: string | null; expiredAt: IsoDateTime | null; cancelledAt: IsoDateTime | null; cancellationReason: string | null;
  jobId: Guid | null; hasActivePublicLink: boolean; publicLinkLastOpenedAt: IsoDateTime | null;
  allowedTransitions: QuotationStatus[]; rowVersion: string;
  /** Invoices created from this quotation (drafts included). */
  invoices: InvoiceLinkDto[];
}
export interface QuotationListQuery {
  search?: string; status?: QuotationStatus[]; customerId?: Guid; from?: IsoDate; to?: IsoDate;
  sort?: 'updatedAt' | '-updatedAt' | 'number' | '-number' | 'issueDate' | '-issueDate' | 'grossTotal' | '-grossTotal' | 'validUntil' | '-validUntil';
  page?: number; pageSize?: number;
}
export interface SendQuotationRequest {
  mode: SendMode; recipientEmail?: string | null; subject?: string | null; message?: string | null;
  attachPdf?: boolean | null; includePublicLink: boolean; scheduleFollowUps: boolean;
}
export interface SendQuotationResponse { quotation: QuotationDto; publicUrl: string | null; emailDeliveryId: Guid | null }
export interface DecisionRequest { note?: string | null }
export interface CancelRequest { reason?: string | null }
export interface PublicLinkResponse { url: string; expiresAt: IsoDateTime }
export interface QuotationEventDto { id: Guid; type: QuotationEventType; occurredAt: IsoDateTime; actorType: ActorType; actorName: string | null; details: string | null }
export interface EmailDeliveryDto {
  id: Guid; kind: EmailKind; toAddress: string; subject: string; status: EmailStatus; attempts: number;
  createdAt: IsoDateTime; handedOffAt: IsoDateTime | null; nextAttemptAt: IsoDateTime | null; lastError: string | null;
}
export interface FollowUpDto { id: Guid; kind: FollowUpKind; dueAt: IsoDateTime; status: FollowUpStatus; statusReason: string | null; processedAt: IsoDateTime | null }
export interface LookupByTokenRequest { token: string }
export interface LookupByTokenResponse { quotationId: Guid }

// ---------- Jobs ----------
export interface ConvertToJobRequest {
  title?: string | null; description?: string | null; plannedStartDate?: IsoDate | null; dueDate?: IsoDate | null;
  assignedUserId?: Guid | null; notes?: string | null;
}
export interface JobListItemDto {
  id: Guid; number: string; title: string; status: JobStatus; customerId: Guid; customerName: string; quotationId: Guid;
  quotationNumber: string; plannedStartDate: IsoDate | null; dueDate: IsoDate | null; assignedUserId: Guid | null;
  assignedUserName: string | null; netValue: number; createdAt: IsoDateTime;
}
export interface JobDto {
  id: Guid; number: string; title: string; description: string | null; status: JobStatus; customerId: Guid; customerName: string;
  quotationId: Guid; quotationNumber: string; quotationNetTotal: number; quotationGrossTotal: number;
  plannedStartDate: IsoDate | null; dueDate: IsoDate | null; assignedUserId: Guid | null; assignedUserName: string | null;
  notes: string | null; createdAt: IsoDateTime; updatedAt: IsoDateTime; startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null; cancelledAt: IsoDateTime | null; allowedTransitions: JobStatus[]; rowVersion: string;
  /** Invoices created from this job (drafts included). */
  invoices: InvoiceLinkDto[];
}
export interface UpdateJobRequest {
  title: string; description?: string | null; plannedStartDate?: IsoDate | null; dueDate?: IsoDate | null;
  assignedUserId?: Guid | null; notes?: string | null; rowVersion: string;
}
export interface ChangeJobStatusRequest { status: JobStatus }
export interface JobListQuery {
  search?: string; status?: JobStatus[]; assignedUserId?: Guid; customerId?: Guid;
  sort?: 'dueDate' | '-dueDate' | 'createdAt' | '-createdAt' | 'number' | '-number'; page?: number; pageSize?: number;
}

// ---------- Invoices ----------
export interface InvoiceLinkDto { id: Guid; number: string | null; kind: InvoiceKind; status: InvoiceStatus; grossTotal: number }
export interface CreateInvoiceRequest {
  customerId: Guid; title?: string | null; issueDate?: IsoDate | null; serviceDateFrom?: IsoDate | null; serviceDateTo?: IsoDate | null;
  dueDate?: IsoDate | null; taxMode?: TaxMode | null; introText?: string | null; closingText?: string | null; paymentTerms?: string | null;
  buyerReference?: string | null; internalNotes?: string | null; lineItems?: LineItemInput[] | null;
}
export interface UpdateInvoiceRequest {
  customerId: Guid; title: string; issueDate: IsoDate; serviceDateFrom: IsoDate | null; serviceDateTo: IsoDate | null; dueDate: IsoDate;
  taxMode: TaxMode; introText?: string | null; closingText?: string | null; paymentTerms?: string | null; buyerReference?: string | null;
  internalNotes?: string | null; lineItems: LineItemInput[]; rowVersion: string;
}
export interface InvoiceListItemDto {
  /** number is null for drafts: it is assigned when the invoice is issued. */
  id: Guid; number: string | null; kind: InvoiceKind; status: InvoiceStatus; title: string; customerId: Guid; customerName: string;
  issueDate: IsoDate; dueDate: IsoDate; netTotal: number; grossTotal: number; paidAmount: number; openAmount: number;
  isOverdue: boolean; daysOverdue: number; sentAt: IsoDateTime | null; updatedAt: IsoDateTime;
}
export interface InvoicePaymentDto { id: Guid; amount: number; paidOn: IsoDate; method: string | null; note: string | null; createdAt: IsoDateTime; createdByName: string | null }
export interface InvoiceDto {
  id: Guid; number: string | null; kind: InvoiceKind; status: InvoiceStatus; title: string; customerId: Guid; customerName: string;
  recipientName: string; recipientContact: string | null; recipientAddress: string | null; recipientEmail: string | null; recipientVatId: string | null;
  issueDate: IsoDate; serviceDateFrom: IsoDate | null; serviceDateTo: IsoDate | null; dueDate: IsoDate; taxMode: TaxMode;
  introText: string | null; closingText: string | null; paymentTerms: string | null; buyerReference: string | null; internalNotes: string | null;
  currency: string; lineItems: LineItemDto[]; totals: TotalsDto;
  paidAmount: number; openAmount: number; isOverdue: boolean; daysOverdue: number; paidOn: IsoDate | null; payments: InvoicePaymentDto[];
  quotationId: Guid | null; quotationNumber: string | null; jobId: Guid | null; jobNumber: string | null;
  /** Set on a cancellation invoice: the invoice it reverses. */
  cancelledInvoiceId: Guid | null; cancelledInvoiceNumber: string | null;
  /** Set on a cancelled invoice: its cancellation invoice. */
  cancellationInvoiceId: Guid | null; cancellationInvoiceNumber: string | null;
  createdAt: IsoDateTime; updatedAt: IsoDateTime; issuedAt: IsoDateTime | null; sentAt: IsoDateTime | null;
  cancelledAt: IsoDateTime | null; cancellationReason: string | null; lastReminderAt: IsoDateTime | null; reminderCount: number;
  /** True once issued: the PDF embeds the ZUGFeRD/Factur-X XML and the XML can be downloaded separately. */
  hasEInvoice: boolean;
  /** Drafts only: what is still missing before the invoice can be issued (empty = ready). */
  issueProblems: string[];
  allowedActions: InvoiceAction[]; rowVersion: string;
}
export interface InvoiceListQuery {
  search?: string; status?: InvoiceStatus[]; overdue?: boolean; customerId?: Guid; from?: IsoDate; to?: IsoDate;
  sort?: 'updatedAt' | '-updatedAt' | 'number' | '-number' | 'issueDate' | '-issueDate' | 'dueDate' | '-dueDate' | 'grossTotal' | '-grossTotal';
  page?: number; pageSize?: number;
}
export interface SendInvoiceRequest { mode: SendMode; recipientEmail?: string | null; subject?: string | null; message?: string | null }
export interface SendInvoiceResponse { invoice: InvoiceDto; emailDeliveryId: Guid | null }
export interface RecordPaymentRequest { amount: number; paidOn: IsoDate; method?: string | null; note?: string | null }
export interface PaymentReminderRequest { recipientEmail?: string | null; message?: string | null }
export interface InvoiceEventDto { id: Guid; type: InvoiceEventType; occurredAt: IsoDateTime; actorType: ActorType; actorName: string | null; details: string | null }

// ---------- Templates ----------
export interface TemplateLineItemInput {
  title: string; description?: string | null; quantity: number; unit: string; unitPriceNet: number;
  discountPercent: number; taxRatePercent?: number | null;
}
export interface TemplateLineItemDto extends TemplateLineItemInput { id: Guid; position: number; description: string | null; taxRatePercent: number | null }
export interface TemplateDto {
  id: Guid; name: string; description: string | null; introText: string | null; closingText: string | null; terms: string | null;
  taxMode: TaxMode | null; lineItems: TemplateLineItemDto[]; updatedAt: IsoDateTime;
}
export interface TemplateListItemDto { id: Guid; name: string; description: string | null; lineItemCount: number; netTotal: number; updatedAt: IsoDateTime }
export interface UpsertTemplateRequest {
  name: string; description?: string | null; introText?: string | null; closingText?: string | null; terms?: string | null;
  taxMode?: TaxMode | null; lineItems: TemplateLineItemInput[];
}
export interface SaveAsTemplateRequest { name: string; description?: string | null }

// ---------- Dashboard / activity / notifications ----------
export interface FollowUpDueDto { quotationId: Guid; quotationNumber: string; customerName: string; kind: FollowUpKind; dueAt: IsoDateTime }
export interface ActivityDto { id: Guid; type: string; occurredAt: IsoDateTime; actorName: string | null; summary: string; entityType: string | null; entityId: Guid | null }
export interface DashboardDto {
  from: IsoDate; to: IsoDate; draftCount: number; sentCount: number; acceptedCount: number; rejectedCount: number;
  expiredCount: number; expiringSoonCount: number; followUpsDueCount: number; quotedValueNet: number; acceptedValueNet: number;
  /** null when no quotation in the period has reached a decision yet. */
  conversionRatePercent: number | null;
  conversionRateDefinition: string;
  awaitingDecision: QuotationListItemDto[]; expiringSoon: QuotationListItemDto[]; upcomingFollowUps: FollowUpDueDto[];
  recentActivity: ActivityDto[]; openJobsCount: number;
  /** Current state, not limited to the period. */
  openInvoicesCount: number; openInvoicesAmount: number; overdueInvoicesCount: number; overdueInvoicesAmount: number;
  /** Net amount invoiced in the period (cancellations subtracted). */
  invoicedNet: number;
  /** Payments received in the period. */
  paymentsReceived: number;
  overdueInvoices: InvoiceListItemDto[];
}
export interface NotificationDto { id: Guid; type: string; title: string; body: string | null; entityType: string | null; entityId: Guid | null; createdAt: IsoDateTime; isRead: boolean }

// ---------- Billing ----------
export interface PlanDto { plan: SubscriptionPlan; name: string; monthlyPriceEur: number; maxActiveMembers: number; maxQuotationsPerMonth: number | null; maxEmailsPerDay: number }
export interface SubscriptionDto {
  plan: SubscriptionPlan; planName: string; status: SubscriptionStatus; trialEndsAt: IsoDateTime | null;
  currentPeriodEnd: IsoDateTime | null; graceUntil: IsoDateTime | null; cancelAtPeriodEnd: boolean; hasFullAccess: boolean;
  /** "mock" until a real payment provider is configured. */
  provider: string; providerIsLive: boolean; activeMembers: number; quotationsThisMonth: number; availablePlans: PlanDto[];
}
export interface ChangePlanRequest { plan: SubscriptionPlan }
export interface ChangePlanResponse { redirectUrl: string | null; activatedImmediately: boolean; subscription: SubscriptionDto }

// ---------- Public customer page ----------
export interface PublicLineItemDto {
  position: number; title: string; description: string | null; quantity: number; unit: string; unitPriceNet: number;
  discountPercent: number; taxRatePercent: number; lineNet: number;
}
export interface PublicQuotationDto {
  number: string; title: string; status: QuotationStatus; issueDate: IsoDate; validUntil: IsoDate; canDecide: boolean; isPastValidity: boolean;
  companyName: string; companyAddress: string | null; companyEmail: string | null; companyPhone: string | null; brandColor: string; hasLogo: boolean;
  recipientName: string; recipientAddress: string | null; taxMode: TaxMode; introText: string | null; closingText: string | null;
  terms: string | null; paymentTerms: string | null; lineItems: PublicLineItemDto[]; totals: TotalsDto;
  decidedAt: IsoDateTime | null; decisionName: string | null; followUpOptOut: boolean;
}
export interface PublicAcceptRequest { fullName: string; confirmBinding: boolean; note?: string | null }
export interface PublicRejectRequest { fullName?: string | null; reason?: string | null }
export interface PublicDecisionResponse { status: QuotationStatus; decidedAt: IsoDateTime; number: string; companyName: string }

/** Development/Test only: emails captured by the development email sink. */
export interface DevEmailDto { id: Guid; to: string; subject: string; bodyText: string; createdAt: IsoDateTime; attachments: string[] }
