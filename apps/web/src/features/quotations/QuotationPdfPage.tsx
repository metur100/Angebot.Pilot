import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { useCompany } from '@/app/company';
import { PdfViewer } from '@/components/domain/PdfViewer';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert, ErrorState, PageSkeleton, Spinner } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { qk } from '@/lib/queryKeys';

export function pdfFileName(number: string) {
  return `Angebot-${number.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
}

export default function QuotationPdfPage() {
  const { id = '' } = useParams();
  const { companyId } = useCompany();
  const quotation = useQuery({ queryKey: qk.quotation(companyId, id), queryFn: () => api.quotations.get(companyId, id) });
  const rowVersion = quotation.data?.rowVersion ?? '';
  const pdf = useQuery({
    queryKey: qk.quotationPdf(companyId, id, rowVersion),
    queryFn: () => api.quotations.pdf(companyId, id),
    enabled: Boolean(quotation.data),
    staleTime: 5 * 60_000,
  });

  if (quotation.isPending) return <PageSkeleton />;
  if (quotation.isError) return <ErrorState error={quotation.error} onRetry={() => void quotation.refetch()} />;
  const q = quotation.data;

  return (
    <>
      <PageHeader
        title={`PDF ${q.number}`}
        back={{ to: `/angebote/${q.id}`, label: q.number }}
        meta={<QuotationStatusBadge status={q.status} />}
        description={q.title}
        actions={
          <>
            <ButtonLink to={`/angebote/${q.id}/vorschau`} icon={Eye}>
              HTML-Vorschau
            </ButtonLink>
            <Button icon={Printer} disabled={!pdf.data} onClick={() => window.print()}>
              Drucken
            </Button>
            <Button
              variant="primary"
              icon={Download}
              disabled={!pdf.data}
              onClick={() => {
                if (!pdf.data) return;
                downloadBlob(pdf.data, pdfFileName(q.number));
                toast.success('PDF heruntergeladen', pdfFileName(q.number));
              }}
            >
              Herunterladen
            </Button>
          </>
        }
      />
      {q.status === 'Draft' && (
        <Alert tone="info" className="mb-6">
          Entwürfe erhalten im PDF ein Wasserzeichen „Entwurf“. Es entfällt automatisch, sobald Sie das Angebot versenden.
        </Alert>
      )}
      <div className="ap-print-area rounded-xl bg-neutral-100 px-3 py-6 sm:px-8 sm:py-10">
        {pdf.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner label="PDF wird erzeugt …" />
          </div>
        ) : pdf.isError ? (
          <ErrorState error={pdf.error} title="PDF konnte nicht erzeugt werden" onRetry={() => void pdf.refetch()} />
        ) : (
          <PdfViewer data={pdf.data} label={`Angebot ${q.number}`} />
        )}
      </div>
    </>
  );
}
