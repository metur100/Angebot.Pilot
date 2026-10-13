import type { PublicDecisionResponse } from '@angebotpilot/api-contracts';
import { ArrowLeft, CircleCheck, CircleX, Download } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { Spinner } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { PublicLayout, PublicMessage } from './PublicLayout';
import { PublicLinkError, usePublicQuotation } from './PublicQuotationPage';

function isDecision(value: unknown): value is PublicDecisionResponse {
  return typeof value === 'object' && value !== null && 'status' in value && 'number' in value;
}

export default function PublicConfirmationPage() {
  const { token = '' } = useParams();
  const location = useLocation();
  const fromState = isDecision(location.state) ? location.state : null;
  // After a reload the navigation state is gone: show the current status from the server instead.
  const quotation = usePublicQuotation(token, !fromState);
  const decision = fromState ?? (quotation.data ? { status: quotation.data.status, decidedAt: quotation.data.decidedAt ?? '', number: quotation.data.number, companyName: quotation.data.companyName } : null);
  useDocumentTitle(decision?.status === 'Accepted' ? 'Angebot angenommen' : decision?.status === 'Rejected' ? 'Angebot abgelehnt' : 'Angebot');

  if (!fromState && quotation.isPending) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      </PublicLayout>
    );
  }
  if (!fromState && quotation.isError) return <PublicLinkError error={quotation.error} onRetry={() => void quotation.refetch()} />;
  if (!decision) return null;

  const accepted = decision.status === 'Accepted';
  const rejected = decision.status === 'Rejected';
  const back = (
    <Link to={`/q/${encodeURIComponent(token)}`} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50">
      <ArrowLeft aria-hidden size={16} /> Zum Angebot
    </Link>
  );
  if (!accepted && !rejected) {
    return (
      <PublicMessage icon={<CircleCheck aria-hidden size={22} />} title={`Angebot ${decision.number}`} actions={back}>
        Für dieses Angebot liegt noch keine Entscheidung vor.
      </PublicMessage>
    );
  }
  return (
    <PublicMessage
      icon={accepted ? <CircleCheck aria-hidden size={22} className="text-success-text" /> : <CircleX aria-hidden size={22} className="text-danger-text" />}
      title={accepted ? 'Vielen Dank – Ihre Annahme ist eingegangen' : 'Ihre Ablehnung wurde übermittelt'}
      actions={
        <>
          {back}
          {accepted && (
            <a
              href={api.publicQuotation.pdfUrl(token)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Download aria-hidden size={16} /> PDF für Ihre Unterlagen
            </a>
          )}
        </>
      }
    >
      <p>
        {accepted
          ? `Sie haben das Angebot ${decision.number} von ${decision.companyName} am ${formatDateTime(decision.decidedAt)} angenommen. ${decision.companyName} wurde über Ihre Annahme informiert.`
          : `Sie haben das Angebot ${decision.number} am ${formatDateTime(decision.decidedAt)} abgelehnt. ${decision.companyName} wurde informiert. Sie erhalten keine weiteren Erinnerungen zu diesem Angebot.`}
      </p>
    </PublicMessage>
  );
}
