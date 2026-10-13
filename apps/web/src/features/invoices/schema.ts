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
import { tr } from '@/lib/i18n';

// Client-side validation of the invoice editor. Mirrors the server's UpdateInvoiceRequestValidator; the server stays
// authoritative. Issue requirements (§ 14 UStG) are not enforced here: drafts may be saved incomplete and the server
// reports what is missing in `issueProblems`.

const msg = (de: string, en: string) => ({ error: () => tr(de, en) });
const optionalText = (max: number) =>
  z.string().trim().max(max, msg(`Maximal ${max} Zeichen.`, `At most ${max} characters.`)).optional().or(z.literal(''));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg('Bitte ein gültiges Datum angeben.', 'Please enter a valid date.'));
const optionalIsoDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, msg('Bitte ein gültiges Datum angeben.', 'Please enter a valid date.'));

export const invoiceSchema = z
  .object({
    // z.guid(): the API issues SQL Server sequential GUIDs, which are not RFC 4122 variants.
    customerId: z.guid(msg('Bitte Kunden auswählen.', 'Please select a customer.')),
    title: z.string().trim().min(1, msg('Bitte Betreff angeben.', 'Please enter a subject.')).max(200, msg('Maximal 200 Zeichen.', 'At most 200 characters.')),
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
    lineItems: z
      .array(lineItemSchema)
      .min(1, msg('Mindestens eine Position.', 'At least one line item.'))
      .max(200, msg('Höchstens 200 Positionen.', 'At most 200 line items.')),
  })
  .superRefine((v, ctx) => {
    // superRefine runs at validation time, so tr() picks up the current UI language.
    if (v.issueDate && v.dueDate && v.dueDate < v.issueDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: tr('Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.', 'The due date must not be before the invoice date.'),
      });
    } else if (v.issueDate && v.dueDate && v.dueDate > addDaysIso(v.issueDate, 365)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: tr('Das Zahlungsziel darf höchstens ein Jahr betragen.', 'Payment terms must not exceed one year.'),
      });
    }
    if (v.servicePeriod) {
      if (!v.serviceDateFrom) {
        ctx.addIssue({
          code: 'custom',
          path: ['serviceDateFrom'],
          message: tr('Bitte Beginn des Leistungszeitraums angeben.', 'Please enter the start of the service period.'),
        });
      }
      if (!v.serviceDateTo) {
        ctx.addIssue({
          code: 'custom',
          path: ['serviceDateTo'],
          message: tr('Bitte Ende des Leistungszeitraums angeben.', 'Please enter the end of the service period.'),
        });
      } else if (v.serviceDateFrom && v.serviceDateTo < v.serviceDateFrom) {
        ctx.addIssue({
          code: 'custom',
          path: ['serviceDateTo'],
          message: tr('Das Ende des Leistungszeitraums muss nach dem Beginn liegen.', 'The end of the service period must be after the start.'),
        });
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
