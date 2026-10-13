// Display helpers shared by the invoice list, detail and linked-invoice rows.
import { formatEur, type InvoiceKind } from '@angebotpilot/api-contracts';

/** Cancellation invoices (Stornorechnungen) carry positive amounts in the API and are shown negated with "−". */
export function formatInvoiceAmount(amount: number, kind: InvoiceKind): string {
  return kind === 'Cancellation' && amount !== 0 ? `−${formatEur(Math.abs(amount))}` : formatEur(amount);
}

/** "RE-2026-0001", "Stornorechnung RE-2026-0002" or "Entwurf" (drafts get their number when issued). */
export function invoiceLabel(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return i.kind === 'Cancellation' ? 'Stornorechnung (Entwurf)' : 'Entwurf';
  return i.kind === 'Cancellation' ? `Stornorechnung ${i.number}` : i.number;
}

/** Title used in headers: number, or "Rechnungsentwurf" for drafts. */
export function invoiceHeaderTitle(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return 'Rechnungsentwurf';
  return i.kind === 'Cancellation' ? `Storno ${i.number}` : i.number;
}

/** File name (without extension) for shared PDFs/XML. */
export function invoiceFileName(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return 'Rechnungsentwurf';
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'}_${i.number}`;
}
