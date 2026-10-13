import type { PublicDecisionResponse } from '@angebotpilot/api-contracts';
import { ArrowLeft, CircleCheck, CircleX, Download } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { Spinner } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
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
  useDocumentTitle(
    decision?.status === 'Accepted'
      ? tr('Angebot angenommen', 'Quotation accepted')
      : decision?.status === 'Rejected'
        ? tr('Angebot abgelehnt', 'Quotation declined')
        : tr('Angebot', 'Quotation'),
  );

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
      <ArrowLeft aria-hidden size={16} /> {tr('Zum Angebot', 'Back to quotation')}
    </Link>
  );
  if (!accepted && !rejected) {
    return (
      <PublicMessage icon={<CircleCheck aria-hidden size={22} />} title={tr(`Angebot ${decision.number}`, `Quotation ${decision.number}`)} actions={back}>
        {tr('Für dieses Angebot liegt noch keine Entscheidung vor.', 'No decision has been made on this quotation yet.')}
      </PublicMessage>
    );
  }
  return (
    <PublicMessage
      icon={accepted ? <CircleCheck aria-hidden size={22} className="text-success-text" /> : <CircleX aria-hidden size={22} className="text-danger-text" />}
      title={
        accepted
          ? tr('Vielen Dank – Ihre Annahme ist eingegangen', 'Thank you – your acceptance has been received')
          : tr('Ihre Ablehnung wurde übermittelt', 'Your decision to decline has been sent')
      }
      actions={
        <>
          {back}
          {accepted && (
            <a
              href={api.publicQuotation.pdfUrl(token)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-on-brand shadow-sm hover:bg-brand-solid-hover"
            >
              <Download aria-hidden size={16} /> {tr('PDF für Ihre Unterlagen', 'PDF for your records')}
            </a>
          )}
        </>
      }
    >
      <p>
        {accepted
          ? tr(
              `Sie haben das Angebot ${decision.number} von ${decision.companyName} am ${formatDateTime(decision.decidedAt)} angenommen. ${decision.companyName} wurde über Ihre Annahme informiert.`,
              `You accepted quotation ${decision.number} from ${decision.companyName} on ${formatDateTime(decision.decidedAt)}. ${decision.companyName} has been notified of your acceptance.`,
            )
          : tr(
              `Sie haben das Angebot ${decision.number} am ${formatDateTime(decision.decidedAt)} abgelehnt. ${decision.companyName} wurde informiert. Sie erhalten keine weiteren Erinnerungen zu diesem Angebot.`,
              `You declined quotation ${decision.number} on ${formatDateTime(decision.decidedAt)}. ${decision.companyName} has been notified. You will not receive any further reminders about this quotation.`,
            )}
      </p>
    </PublicMessage>
  );
}
