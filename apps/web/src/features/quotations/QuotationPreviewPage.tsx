import { ApiError } from '@angebotpilot/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { FileText, Pencil } from 'lucide-react';
import { useParams } from 'react-router';
import { useCompany, useCompanyDetails, useCompanySettings } from '@/app/company';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { api } from '@/lib/api';
import { useObjectUrl } from '@/lib/hooks';
import { qk } from '@/lib/queryKeys';
import { QuotationDocument } from './QuotationDocument';

/** Authenticated company logo as an object URL (null when there is none). */
export function useCompanyLogoUrl(hasLogo: boolean | undefined) {
  const { companyId } = useCompany();
  const logo = useQuery({
    queryKey: qk.logo(companyId),
    queryFn: async () => {
      try {
        return await api.companies.getLogo(companyId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(hasLogo),
    staleTime: 10 * 60_000,
  });
  return useObjectUrl(hasLogo ? logo.data : null);
}

export default function QuotationPreviewPage() {
  const { id = '' } = useParams();
  const { companyId } = useCompany();
  const quotation = useQuery({ queryKey: qk.quotation(companyId, id), queryFn: () => api.quotations.get(companyId, id) });
  const company = useCompanyDetails();
  const settings = useCompanySettings();
  const logoUrl = useCompanyLogoUrl(company.data?.hasLogo);

  if (quotation.isPending || company.isPending) return <PageSkeleton />;
  if (quotation.isError) return <ErrorState error={quotation.error} onRetry={() => void quotation.refetch()} />;
  if (company.isError) return <ErrorState error={company.error} onRetry={() => void company.refetch()} />;
  const q = quotation.data;
  const c = company.data;
  const s = settings.data;
  const address = [c.addressLine1, c.addressLine2, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join('\n');
  const contact = [c.phone && `Tel. ${c.phone}`, c.email, c.website].filter(Boolean).join('\n');
  const footer = [
    [c.name, c.vatId && `USt-IdNr. ${c.vatId}`, c.taxNumber && `St.-Nr. ${c.taxNumber}`].filter(Boolean).join(' · '),
    s?.showBankDetails && s.iban ? [s.bankAccountHolder, s.bankName, `IBAN ${s.iban}`, s.bic && `BIC ${s.bic}`].filter(Boolean).join(' · ') : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <PageHeader
        title={`Vorschau ${q.number}`}
        back={{ to: `/angebote/${q.id}`, label: q.number }}
        meta={<QuotationStatusBadge status={q.status} />}
        description="So sieht Ihr Kunde das Angebot. Maßgeblich ist das PDF."
        actions={
          <>
            {q.status === 'Draft' && (
              <ButtonLink to={`/angebote/${q.id}/bearbeiten`} icon={Pencil}>
                Bearbeiten
              </ButtonLink>
            )}
            <ButtonLink to={`/angebote/${q.id}/pdf`} variant="primary" icon={FileText}>
              PDF anzeigen
            </ButtonLink>
          </>
        }
      />
      <div className="rounded-xl bg-neutral-100 px-2 py-6 sm:px-8 sm:py-10">
        <QuotationDocument
          data={{
            number: q.number,
            title: q.title,
            issueDate: q.issueDate,
            validUntil: q.validUntil,
            taxMode: q.taxMode,
            companyName: c.name,
            companyAddress: address || null,
            companyContact: contact || null,
            brandColor: c.brandColor,
            logoUrl,
            recipientName: q.recipientName,
            recipientAddress: [q.recipientContact, q.recipientAddress].filter(Boolean).join('\n') || null,
            introText: q.introText,
            closingText: q.closingText,
            terms: q.terms,
            paymentTerms: q.paymentTerms,
            lines: [...q.lineItems].sort((a, b) => a.position - b.position),
            totals: q.totals,
            isDraft: q.status === 'Draft',
            footer: footer || null,
          }}
        />
      </div>
    </>
  );
}
