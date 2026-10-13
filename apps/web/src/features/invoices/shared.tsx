import type { InvoiceDto, InvoiceKind, InvoiceLinkDto } from '@angebotpilot/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useCompany } from '@/app/company';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { signedEur } from '@/features/quotations/Totals';
import { api } from '@/lib/api';
import { safeFileName } from '@/lib/download';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatEur } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

/** Heading of an invoice: its number, or "Rechnungsentwurf" for drafts (numbers are assigned when issued). */
export function invoiceTitle(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return 'Rechnungsentwurf';
  return i.number;
}

/** Plain-text name for document titles, toasts and dialogs, e.g. "Rechnung RE-2026-0001". */
export function invoiceName(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return 'Rechnungsentwurf';
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'} ${i.number}`;
}

/** Amount as shown in the UI: cancellation invoices are negated ("− 1.190,00 €"). */
export function invoiceAmount(value: number, kind: InvoiceKind): string {
  return signedEur(value, kind === 'Cancellation');
}

export function invoicePdfFileName(i: { number: string | null; kind: InvoiceKind }): string {
  if (!i.number) return 'Rechnung-Entwurf.pdf';
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'}-${safeFileName(i.number)}.pdf`;
}

export function invoiceXmlFileName(i: { number: string | null; kind: InvoiceKind }): string {
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'}-${safeFileName(i.number ?? 'Entwurf')}.xml`;
}

/** "12.10.2026" or "01.10.2026 – 12.10.2026". */
export function servicePeriodText(from: string | null, to: string | null): string | null {
  if (!from) return null;
  return to && to !== from ? `${formatDate(from)} – ${formatDate(to)}` : formatDate(from);
}

/** "1 Tag" / "3 Tage". */
export function daysText(days: number): string {
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
}

/** Dative after "seit": "seit 1 Tag" / "seit 3 Tagen". */
export function sinceDaysText(days: number): string {
  return `${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

/** Keeps every view of an invoice fresh after a mutation (lists, detail, dashboard, linked job/quotation/customer). */
export function useInvalidateInvoice() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  return (updated?: Pick<InvoiceDto, 'id' | 'customerId' | 'jobId' | 'quotationId'> & Partial<InvoiceDto>) => {
    if (updated && 'rowVersion' in updated && updated.rowVersion) queryClient.setQueryData(qk.invoice(companyId, updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: qk.invoices(companyId) });
    void queryClient.invalidateQueries({ queryKey: ['c', companyId, 'dashboard'] });
    if (updated?.jobId) void queryClient.invalidateQueries({ queryKey: qk.job(companyId, updated.jobId) });
    if (updated?.quotationId) void queryClient.invalidateQueries({ queryKey: qk.quotation(companyId, updated.quotationId) });
    if (updated?.customerId) void queryClient.invalidateQueries({ queryKey: qk.customerInvoices(companyId, updated.customerId) });
  };
}

/** Creates an invoice draft from a job or an accepted quotation and opens it in the editor. */
export function useCreateInvoiceFrom(source: { type: 'job' | 'quotation'; id: string }) {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const invalidate = useInvalidateInvoice();
  return useMutation({
    mutationFn: () => (source.type === 'job' ? api.jobs.createInvoice(companyId, source.id) : api.quotations.createInvoice(companyId, source.id)),
    onSuccess: (invoice) => {
      invalidate(invoice);
      toast.success('Rechnungsentwurf erstellt', `${invoice.title} · ${formatEur(invoice.totals.grossTotal)} – Positionen wurden übernommen.`);
      void navigate(`/rechnungen/${invoice.id}/bearbeiten`);
    },
    onError: (error) => toast.error('Rechnung konnte nicht erstellt werden', errorMessage(error)),
  });
}

/** Compact list of invoices linked to a job or quotation. */
export function InvoiceLinkList({ invoices, empty }: { invoices: InvoiceLinkDto[]; empty: string }) {
  if (invoices.length === 0) return <p className="text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200" data-testid="invoice-links">
      {invoices.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5">
          <Link to={`/rechnungen/${i.id}`} className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
            <ReceiptText aria-hidden size={15} className="shrink-0" />
            <span className="truncate">{i.number ?? 'Entwurf'}</span>
          </Link>
          <span className="flex items-center gap-2">
            <InvoiceStatusBadge status={i.status} kind={i.kind} />
            <span className="text-sm font-medium whitespace-nowrap text-neutral-900 tabular">{invoiceAmount(i.grossTotal, i.kind)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
