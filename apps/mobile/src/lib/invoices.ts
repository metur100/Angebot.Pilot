// Display helpers shared by the invoice list, detail and linked-invoice rows.
import { formatEur, tr, type InvoiceKind } from '@angebotpilot/api-contracts';

/** Cancellation invoices (Stornorechnungen) carry positive amounts in the API and are shown negated with "−". */
export function formatInvoiceAmount(amount: number, kind: InvoiceKind): string {
  return kind === 'Cancellation' && amount !== 0 ? `−${formatEur(Math.abs(amount))}` : formatEur(amount);
}

/** "RE-2026-0001", "Stornorechnung RE-2026-0002" or "Entwurf" (drafts get their number when issued). UI language. */
export function invoiceLabel(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return i.kind === 'Cancellation' ? tr('Stornorechnung (Entwurf)', 'Cancellation invoice (draft)') : tr('Entwurf', 'Draft');
  return i.kind === 'Cancellation' ? tr(`Stornorechnung ${i.number}`, `Cancellation invoice ${i.number}`) : i.number;
}

/** Title used in headers: number, or "Rechnungsentwurf" for drafts. */
export function invoiceHeaderTitle(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return tr('Rechnungsentwurf', 'Draft invoice');
  return i.kind === 'Cancellation' ? tr(`Storno ${i.number}`, `Cancellation ${i.number}`) : i.number;
}

/** File name (without extension) for shared PDFs/XML. Documents are German, so is their file name. */
export function invoiceFileName(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return 'Rechnungsentwurf';
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'}_${i.number}`;
}
