// Client-side validation of the invoice draft form. Mirrors Create/UpdateInvoiceRequestValidator on the server (which
// stays authoritative). Drafts may be saved incomplete (e.g. without line items); what is still missing for issuing is
// reported by the server as issueProblems.
import { addDaysIso, lineItemSchema } from '@angebotpilot/api-contracts';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen.`).optional().or(z.literal(''));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte Datum wählen.');
const optionalIsoDate = isoDate.or(z.literal(''));

export const invoiceFormSchema = z
  .object({
    // z.guid(): the API issues SQL Server sequential GUIDs, which are not RFC 4122 variants.
    customerId: z.guid('Bitte Kunden auswählen.'),
    title: z.string().trim().min(1, 'Bitte Betreff angeben.').max(200, 'Maximal 200 Zeichen.'),
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
    lineItems: z.array(lineItemSchema).max(200, 'Höchstens 200 Positionen.'),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate < v.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.' });
    } else if (v.dueDate > addDaysIso(v.issueDate, 365)) {
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

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1) - Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1)) / 86_400_000);
}
