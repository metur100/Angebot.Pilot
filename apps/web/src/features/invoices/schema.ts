import {
  addDaysIso,
  lineItemSchema,
  todayIso,
  type CompanySettingsDto,
  type InvoiceDto,
  type TaxRateDto,
  type UpdateInvoiceRequest,
} from '@angebotpilot/api-contracts';
import { z } from 'zod';
import { defaultTaxRateOf, toLineInputs } from '@/features/quotations/QuotationEditorPage';
import { newLineItem } from '@/features/quotations/LineItemsEditor';
import { daysUntil } from '@/lib/format';

// Client-side validation of the invoice editor. Mirrors the server's UpdateInvoiceRequestValidator; the server stays
// authoritative. Issue requirements (§ 14 UStG) are not enforced here: drafts may be saved incomplete and the server
// reports what is missing in `issueProblems`.

const optionalText = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen.`).optional().or(z.literal(''));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte ein gültiges Datum angeben.');
const optionalIsoDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Bitte ein gültiges Datum angeben.');

export const invoiceSchema = z
  .object({
    // z.guid(): the API issues SQL Server sequential GUIDs, which are not RFC 4122 variants.
    customerId: z.guid('Bitte Kunden auswählen.'),
    title: z.string().trim().min(1, 'Bitte Betreff angeben.').max(200, 'Maximal 200 Zeichen.'),
    issueDate: isoDate,
    /** UI only: true shows "von – bis" instead of a single Leistungsdatum. */
    servicePeriod: z.boolean(),
    serviceDateFrom: optionalIsoDate,
    serviceDateTo: optionalIsoDate,
    dueDate: isoDate,
    taxMode: z.enum(['Standard', 'SmallBusiness', 'ReverseCharge']),
    buyerReference: optionalText(100),
    introText: optionalText(4000),
    closingText: optionalText(4000),
    paymentTerms: optionalText(1000),
    internalNotes: optionalText(4000),
    lineItems: z.array(lineItemSchema).min(1, 'Mindestens eine Position.').max(200, 'Höchstens 200 Positionen.'),
  })
  .superRefine((v, ctx) => {
    if (v.issueDate && v.dueDate && v.dueDate < v.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.' });
    } else if (v.issueDate && v.dueDate && v.dueDate > addDaysIso(v.issueDate, 365)) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Das Zahlungsziel darf höchstens ein Jahr betragen.' });
    }
    if (v.servicePeriod) {
      if (!v.serviceDateFrom) ctx.addIssue({ code: 'custom', path: ['serviceDateFrom'], message: 'Bitte Beginn des Leistungszeitraums angeben.' });
      if (!v.serviceDateTo) ctx.addIssue({ code: 'custom', path: ['serviceDateTo'], message: 'Bitte Ende des Leistungszeitraums angeben.' });
      else if (v.serviceDateFrom && v.serviceDateTo < v.serviceDateFrom) {
        ctx.addIssue({ code: 'custom', path: ['serviceDateTo'], message: 'Das Ende des Leistungszeitraums muss nach dem Beginn liegen.' });
      }
    }
  });

export type InvoiceFormInput = z.input<typeof invoiceSchema>;
export type InvoiceFormOutput = z.output<typeof invoiceSchema>;

/** Form fields that server field errors can be mapped to. */
export const invoiceFormFields = [
  'customerId', 'title', 'issueDate', 'serviceDateFrom', 'serviceDateTo', 'dueDate', 'taxMode', 'buyerReference', 'introText', 'closingText',
  'paymentTerms', 'internalNotes', 'lineItems',
];

const nullIfEmpty = (value: string | undefined | null) => (value && value.trim() ? value.trim() : null);

export function invoiceToForm(i: InvoiceDto): InvoiceFormInput {
  return {
    customerId: i.customerId,
    title: i.title,
    issueDate: i.issueDate,
    servicePeriod: Boolean(i.serviceDateTo),
    serviceDateFrom: i.serviceDateFrom ?? '',
    serviceDateTo: i.serviceDateTo ?? '',
    dueDate: i.dueDate,
    taxMode: i.taxMode,
    buyerReference: i.buyerReference ?? '',
    introText: i.introText ?? '',
    closingText: i.closingText ?? '',
    paymentTerms: i.paymentTerms ?? '',
    internalNotes: i.internalNotes ?? '',
    lineItems: [...i.lineItems]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        title: l.title,
        description: l.description ?? '',
        quantity: l.quantity,
        unit: l.unit,
        unitPriceNet: l.unitPriceNet,
        discountPercent: l.discountPercent,
        taxRatePercent: l.taxRatePercent,
      })),
  };
}

/** Defaults of a new invoice from the company settings (Rechnungsdatum = Leistungsdatum = today). */
export function newInvoiceDefaults(settings: CompanySettingsDto, rates: TaxRateDto[], customerId: string, today = todayIso()): InvoiceFormInput {
  return {
    customerId,
    title: '',
    issueDate: today,
    servicePeriod: false,
    serviceDateFrom: today,
    serviceDateTo: '',
    dueDate: addDaysIso(today, settings.invoicePaymentDays),
    taxMode: settings.defaultTaxMode,
    buyerReference: '',
    introText: settings.invoiceIntroText ?? '',
    closingText: settings.invoiceClosingText ?? '',
    paymentTerms: '',
    internalNotes: '',
    lineItems: [newLineItem(defaultTaxRateOf(rates)) as InvoiceFormInput['lineItems'][number]],
  };
}

/** Request body for create/update (rowVersion is added for updates). */
export function invoiceRequest(values: InvoiceFormOutput): Omit<UpdateInvoiceRequest, 'rowVersion'> {
  return {
    customerId: values.customerId,
    title: values.title.trim(),
    issueDate: values.issueDate,
    serviceDateFrom: values.serviceDateFrom || null,
    serviceDateTo: values.servicePeriod ? values.serviceDateTo || null : null,
    dueDate: values.dueDate,
    taxMode: values.taxMode,
    // An empty string means "deliberately empty"; null would make the server fall back to the company default on create.
    introText: values.introText?.trim() ?? '',
    closingText: values.closingText?.trim() ?? '',
    paymentTerms: nullIfEmpty(values.paymentTerms),
    buyerReference: nullIfEmpty(values.buyerReference),
    internalNotes: nullIfEmpty(values.internalNotes),
    lineItems: toLineInputs(values.lineItems),
  };
}

/** Whether the due date still equals Rechnungsdatum + default payment term (then it follows the Rechnungsdatum). */
export function dueDateFollowsIssueDate(issueDate: string, dueDate: string, paymentDays: number): boolean {
  return Boolean(issueDate && dueDate) && daysUntil(dueDate, issueDate) === paymentDays;
}
