import { useQuery } from '@tanstack/react-query';
import { Download, FileCode2, Printer } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useCompany } from '@/app/company';
import { PdfViewer } from '@/components/domain/PdfViewer';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert, ErrorState, PageSkeleton, Spinner } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { downloadBlob, downloadDocument } from '@/lib/download';
import { errorMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { invoiceName, invoicePdfFileName, invoiceXmlFileName } from './shared';

export default function InvoicePdfPage() {
  const { id = '' } = useParams();
  const { companyId } = useCompany();
  const [downloadingXml, setDownloadingXml] = useState(false);
  const invoice = useQuery({ queryKey: qk.invoice(companyId, id), queryFn: () => api.invoices.get(companyId, id) });
  const rowVersion = invoice.data?.rowVersion ?? '';
  const pdf = useQuery({
    queryKey: qk.invoicePdf(companyId, id, rowVersion),
    queryFn: () => api.invoices.pdf(companyId, id),
    enabled: Boolean(invoice.data),
    staleTime: 5 * 60_000,
  });

  if (invoice.isPending) return <PageSkeleton />;
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => void invoice.refetch()} />;
  const i = invoice.data;
  const name = invoiceName(i);
  const fileName = invoicePdfFileName(i);

  return (
    <>
      <PageHeader
        title={`PDF ${i.number ?? tr('Rechnungsentwurf', 'Invoice draft')}`}
        documentTitle={`PDF ${name}`}
        back={{ to: `/rechnungen/${i.id}`, label: name }}
        meta={<InvoiceStatusBadge status={i.status} kind={i.kind} isOverdue={i.isOverdue} />}
        description={i.title}
        actions={
          <>
            {i.hasEInvoice && (
              <Button
                icon={FileCode2}
                loading={downloadingXml}
                onClick={async () => {
                  setDownloadingXml(true);
                  try {
                    await downloadDocument(() => api.invoices.xml(companyId, i.id), invoiceXmlFileName(i), 'application/xml');
                    toast.success(tr('E-Rechnung heruntergeladen', 'E-invoice downloaded'), invoiceXmlFileName(i));
                  } catch (error) {
                    toast.error(tr('Download fehlgeschlagen', 'Download failed'), errorMessage(error));
                  } finally {
                    setDownloadingXml(false);
                  }
                }}
              >
                {tr('E-Rechnung (XML)', 'E-invoice (XML)')}
              </Button>
            )}
            <Button icon={Printer} disabled={!pdf.data} onClick={() => window.print()}>
              {tr('Drucken', 'Print')}
            </Button>
            <Button
              variant="primary"
              icon={Download}
              disabled={!pdf.data}
              onClick={() => {
                if (!pdf.data) return;
                downloadBlob(pdf.data, fileName);
                toast.success(tr('PDF heruntergeladen', 'PDF downloaded'), fileName);
              }}
            >
              {tr('Herunterladen', 'Download')}
            </Button>
          </>
        }
      />
      {i.status === 'Draft' ? (
        <Alert tone="info" className="mb-6">
          {tr(
            'Vorschau des Entwurfs mit Wasserzeichen „Entwurf“ und ohne Rechnungsnummer. Erst beim Stellen wird die endgültige Rechnung mit Nummer und eingebetteter E-Rechnung erzeugt.',
            'Preview of the draft with the watermark “Entwurf” (draft) and no invoice number. The final invoice with its number and embedded e-invoice is only created when you issue it.',
          )}
        </Alert>
      ) : (
        <Alert tone="neutral" className="mb-6">
          {tr(
            'Dieses PDF ist festgeschrieben und enthält die E-Rechnung im ZUGFeRD-Format (EN 16931).',
            'This PDF is locked and contains the e-invoice in ZUGFeRD format (EN 16931).',
          )}
        </Alert>
      )}
      <div className="ap-print-area rounded-xl bg-neutral-100 px-3 py-6 sm:px-8 sm:py-10">
        {pdf.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner label={tr('PDF wird erzeugt …', 'Generating PDF …')} />
          </div>
        ) : pdf.isError ? (
          <ErrorState error={pdf.error} title={tr('PDF konnte nicht erzeugt werden', 'PDF could not be generated')} onRetry={() => void pdf.refetch()} />
        ) : (
          <PdfViewer data={pdf.data} label={name} />
        )}
      </div>
    </>
  );
}
