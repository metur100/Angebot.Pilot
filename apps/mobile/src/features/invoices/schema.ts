// Client-side validation of the invoice draft form. Mirrors Create/UpdateInvoiceRequestValidator on the server (which
// stays authoritative). Drafts may be saved incomplete (e.g. without line items); what is still missing for issuing is
// reported by the server as issueProblems.
import { addDaysIso, lineItemSchema, tr } from '@angebotpilot/api-contracts';
import { z } from 'zod';

/** Validation message in the current UI language, resolved when the value is validated. */
const msg = (de: string, en: string) => ({ error: () => tr(de, en) });

const optionalText = (max: number) => z.string().trim().max(max, msg(`Maximal ${max} Zeichen.`, `At most ${max} characters.`)).optional().or(z.literal(''));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg('Bitte Datum wählen.', 'Please choose a date.'));
const optionalIsoDate = isoDate.or(z.literal(''));

export const invoiceFormSchema = z
  .object({
    // z.guid(): the API issues SQL Server sequential GUIDs, which are not RFC 4122 variants.
    customerId: z.guid(msg('Bitte Kunden auswählen.', 'Please choose a customer.')),
    title: z.string().trim().min(1, msg('Bitte Betreff angeben.', 'Please enter a subject.')).max(200, msg('Maximal 200 Zeichen.', 'At most 200 characters.')),
    issueDate: isoDate,
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
    lineItems: z.array(lineItemSchema).max(200, msg('Höchstens 200 Positionen.', 'At most 200 line items.')),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate < v.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: tr('Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.', 'The due date must not be before the invoice date.') });
    } else if (v.dueDate > addDaysIso(v.issueDate, 365)) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: tr('Das Zahlungsziel darf höchstens ein Jahr betragen.', 'The payment term may be at most one year.') });
    }
    if (v.servicePeriod) {
      if (!v.serviceDateFrom) ctx.addIssue({ code: 'custom', path: ['serviceDateFrom'], message: tr('Bitte Beginn des Leistungszeitraums angeben.', 'Please enter the start of the service period.') });
      if (!v.serviceDateTo) ctx.addIssue({ code: 'custom', path: ['serviceDateTo'], message: tr('Bitte Ende des Leistungszeitraums angeben.', 'Please enter the end of the service period.') });
      else if (v.serviceDateFrom && v.serviceDateTo < v.serviceDateFrom) {
        ctx.addIssue({ code: 'custom', path: ['serviceDateTo'], message: tr('Das Ende des Leistungszeitraums muss nach dem Beginn liegen.', 'The end of the service period must be after the start.') });
      }
    }
  });

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1) - Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1)) / 86_400_000);
}
