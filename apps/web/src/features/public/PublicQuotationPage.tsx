import { ApiError, type PublicDecisionResponse, type PublicQuotationDto } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CircleCheck, CircleX, Download, FileX2, Hourglass, Info, Link2Off, Mail, Phone, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { QuotationDocument } from '@/features/quotations/QuotationDocument';
import { api } from '@/lib/api';
import { readableBrandColor, readableBrandTextColor } from '@/lib/color';
import { applyServerErrors, errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatEur } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { PublicLayout, PublicMessage } from './PublicLayout';

export const publicQueryKey = (token: string) => ['public', token] as const;

function BrandedButton({ color, children, onClick, loading }: { color: string; children: React.ReactNode; onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="primary" size="lg" onClick={onClick} loading={loading} className="w-full" style={{ background: readableBrandColor(color) }}>
      {children}
    </Button>
  );
}

function AcceptDialog({ token, quotation, open, onOpenChange }: { token: string; quotation: PublicQuotationDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; confirmBinding?: string }>({});
  const accept = useMutation({
    mutationFn: () => api.publicQuotation.accept(token, { fullName: fullName.trim(), confirmBinding: confirm, note: note.trim() || null }),
    onSuccess: (response: PublicDecisionResponse) => void navigate(`/q/${encodeURIComponent(token)}/bestaetigt`, { state: response, replace: true }),
    onError: (error) => {
      const next: { fullName?: string; confirmBinding?: string } = {};
      applyServerErrors<{ fullName: string; confirmBinding: string }>(error, (path, e) => (next[path as 'fullName' | 'confirmBinding'] = e.message), ['fullName', 'confirmBinding']);
      setErrors(next);
    },
  });
  const submit = () => {
    const next: typeof errors = {};
    if (fullName.trim().length < 2) next.fullName = tr('Bitte geben Sie Ihren vollständigen Namen an.', 'Please enter your full name.');
    if (!confirm) next.confirmBinding = tr('Bitte bestätigen Sie die verbindliche Annahme.', 'Please confirm the binding acceptance.');
    setErrors(next);
    if (Object.keys(next).length === 0) accept.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !accept.isPending && onOpenChange(o)}
      title={tr('Angebot verbindlich annehmen', 'Accept quotation (binding)')}
      description={`${quotation.number} · ${quotation.title} · ${formatEur(quotation.totals.grossTotal)}`}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={accept.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" loading={accept.isPending} onClick={submit} style={{ background: readableBrandColor(quotation.brandColor) }}>
            {tr('Jetzt verbindlich annehmen', 'Accept now (binding)')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {accept.isError && !(accept.error instanceof ApiError && Object.keys(accept.error.fieldErrors).length > 0) && (
          <Alert tone="danger" live>
            {errorMessage(accept.error)}
          </Alert>
        )}
        <Field label={tr('Ihr vollständiger Name', 'Your full name')} error={errors.fullName} required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={200} />
        </Field>
        <Checkbox
          label={<strong className="font-medium">{tr('Ich nehme dieses Angebot verbindlich an.', 'I accept this quotation as binding.')}</strong>}
          description={tr(
            `Damit beauftragen Sie ${quotation.companyName} zu den Bedingungen dieses Angebots.`,
            `This places an order with ${quotation.companyName} on the terms of this quotation.`,
          )}
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          error={errors.confirmBinding}
        />
        <Field label={tr('Nachricht an den Anbieter', 'Message to the provider')} optional>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder={tr('z. B. Wunschtermin', 'e.g. preferred date')} />
        </Field>
        <p className="text-xs text-neutral-500">
          {tr(
            `Ihre Annahme per Klick ist eine Willenserklärung. Sie ist keine qualifizierte elektronische Signatur. Name, Zeitpunkt und Notiz werden für ${quotation.companyName} gespeichert.`,
            `Accepting by click is a legally binding declaration of intent. It is not a qualified electronic signature. Your name, the time and your note are stored for ${quotation.companyName}.`,
          )}
        </p>
      </div>
    </Dialog>
  );
}

function RejectDialog({ token, quotation, open, onOpenChange }: { token: string; quotation: PublicQuotationDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [reason, setReason] = useState('');
  const reject = useMutation({
    mutationFn: () => api.publicQuotation.reject(token, { fullName: fullName.trim() || null, reason: reason.trim() || null }),
    onSuccess: (response) => void navigate(`/q/${encodeURIComponent(token)}/bestaetigt`, { state: response, replace: true }),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !reject.isPending && onOpenChange(o)}
      title={tr('Angebot ablehnen', 'Decline quotation')}
      description={`${quotation.number} · ${quotation.title}`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={reject.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>
            {tr('Angebot ablehnen', 'Decline quotation')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {reject.isError && (
          <Alert tone="danger" live>
            {errorMessage(reject.error)}
          </Alert>
        )}
        <Field label={tr('Ihr Name', 'Your name')} optional>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={200} />
        </Field>
        <Field
          label={tr('Grund', 'Reason')}
          optional
          hint={tr(`Hilft ${quotation.companyName}, künftige Angebote besser zu machen.`, `Helps ${quotation.companyName} make better quotations in future.`)}
        >
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Dialog>
  );
}

function OptOutCard({ token, quotation, onDone }: { token: string; quotation: PublicQuotationDto; onDone: () => void }) {
  const queryClient = useQueryClient();
  const optOut = useMutation({
    mutationFn: () => api.publicQuotation.optOut(token),
    onSuccess: () => {
      queryClient.setQueryData<PublicQuotationDto>(publicQueryKey(token), (old) => (old ? { ...old, followUpOptOut: true } : old));
    },
  });
  const done = optOut.isSuccess || quotation.followUpOptOut;
  return (
    <Card className="mb-6 border-brand-200">
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:text-brand-700">
          <BellOff aria-hidden size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {done ? (
            <>
              <h2 className="text-[15px] font-semibold text-neutral-900">
                {tr('Sie erhalten keine Erinnerungen mehr zu diesem Angebot', 'You will no longer receive reminders about this quotation')}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                {tr('Das Angebot selbst bleibt unverändert und kann weiterhin angesehen werden.', 'The quotation itself is unchanged and can still be viewed.')}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold text-neutral-900">
                {tr('Keine weiteren Erinnerungen zu diesem Angebot erhalten?', 'Stop receiving reminders about this quotation?')}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                {tr(
                  `${quotation.companyName} sendet Ihnen dann keine automatischen Erinnerungs-E-Mails zu Angebot ${quotation.number} mehr.`,
                  `${quotation.companyName} will then stop sending you automatic reminder emails about quotation ${quotation.number}.`,
                )}
              </p>
              {optOut.isError && (
                <p role="alert" className="mt-2 text-sm text-danger-text">
                  {errorMessage(optOut.error)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" loading={optOut.isPending} onClick={() => optOut.mutate()}>
                  {tr('Ja, keine Erinnerungen mehr', 'Yes, stop reminders')}
                </Button>
                <Button variant="ghost" onClick={onDone}>
                  {tr('Abbrechen', 'Cancel')}
                </Button>
              </div>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function DecisionPanel({ token, quotation }: { token: string; quotation: PublicQuotationDto }) {
  const [dialog, setDialog] = useState<null | 'accept' | 'reject'>(null);
  const [, setParams] = useSearchParams();
  let blocked: { icon: React.ReactNode; title: string; text: string } | null = null;
  if (!quotation.canDecide) {
    if (quotation.status === 'Accepted')
      blocked = {
        icon: <CircleCheck aria-hidden size={18} className="text-success-text" />,
        title: tr('Angebot angenommen', 'Quotation accepted'),
        text: tr(
          `Angenommen am ${formatDateTime(quotation.decidedAt)}${quotation.decisionName ? ` von ${quotation.decisionName}` : ''}. Vielen Dank!`,
          `Accepted on ${formatDateTime(quotation.decidedAt)}${quotation.decisionName ? ` by ${quotation.decisionName}` : ''}. Thank you!`,
        ),
      };
    else if (quotation.status === 'Rejected')
      blocked = {
        icon: <CircleX aria-hidden size={18} className="text-danger-text" />,
        title: tr('Angebot abgelehnt', 'Quotation declined'),
        text: tr(`Abgelehnt am ${formatDateTime(quotation.decidedAt)}.`, `Declined on ${formatDateTime(quotation.decidedAt)}.`),
      };
    else if (quotation.status === 'Expired' || quotation.isPastValidity)
      blocked = {
        icon: <Hourglass aria-hidden size={18} className="text-warning-text" />,
        title: tr('Angebot abgelaufen', 'Quotation expired'),
        text: tr(
          `Die Gültigkeit endete am ${formatDate(quotation.validUntil)}. Bitte wenden Sie sich an ${quotation.companyName}, wenn Sie weiterhin Interesse haben.`,
          `The quotation was valid until ${formatDate(quotation.validUntil)}. Please contact ${quotation.companyName} if you are still interested.`,
        ),
      };
    else if (quotation.status === 'Cancelled')
      blocked = {
        icon: <FileX2 aria-hidden size={18} className="text-neutral-500" />,
        title: tr('Angebot storniert', 'Quotation cancelled'),
        text: tr(`${quotation.companyName} hat dieses Angebot zurückgezogen.`, `${quotation.companyName} has withdrawn this quotation.`),
      };
    else
      blocked = {
        icon: <Info aria-hidden size={18} className="text-neutral-500" />,
        title: tr('Keine Entscheidung möglich', 'No decision possible'),
        text: tr('Über dieses Angebot kann derzeit nicht online entschieden werden.', 'A decision on this quotation cannot be made online at the moment.'),
      };
  }
  return (
    <Card className="lg:sticky lg:top-6">
      <CardBody className="space-y-4">
        <div>
          <p className="text-[13px] text-neutral-500">{quotation.taxMode === 'Standard' ? tr('Gesamtbetrag (brutto)', 'Total (gross)') : tr('Gesamtbetrag', 'Total')}</p>
          <p className="text-2xl font-semibold text-neutral-900 tabular">{formatEur(quotation.totals.grossTotal)}</p>
          <p className="text-[13px] text-neutral-500">{tr(`gültig bis ${formatDate(quotation.validUntil)}`, `valid until ${formatDate(quotation.validUntil)}`)}</p>
        </div>
        {blocked ? (
          <div className="flex gap-3 rounded-lg border border-neutral-200 bg-neutral-25 p-3">
            {blocked.icon}
            <div className="min-w-0 text-sm">
              <p className="font-medium text-neutral-900">{blocked.title}</p>
              <p className="mt-0.5 text-neutral-600">{blocked.text}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <BrandedButton color={quotation.brandColor} onClick={() => setDialog('accept')}>
              <CircleCheck aria-hidden size={18} /> {tr('Angebot annehmen', 'Accept quotation')}
            </BrandedButton>
            <Button size="lg" className="w-full" onClick={() => setDialog('reject')}>
              {tr('Ablehnen', 'Decline')}
            </Button>
          </div>
        )}
        <a
          href={api.publicQuotation.pdfUrl(token)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          <Download aria-hidden size={16} /> {tr('PDF herunterladen', 'Download PDF')}
        </a>
        <div className="space-y-1.5 border-t border-neutral-100 pt-3 text-[13px] text-neutral-600">
          <p className="font-medium text-neutral-800">{tr('Fragen zum Angebot?', 'Questions about the quotation?')}</p>
          <p>{quotation.companyName}</p>
          {quotation.companyPhone && (
            <a href={`tel:${quotation.companyPhone}`} className="flex items-center gap-1.5 text-brand-700 hover:underline">
              <Phone aria-hidden size={13} /> {quotation.companyPhone}
            </a>
          )}
          {quotation.companyEmail && (
            <a href={`mailto:${quotation.companyEmail}`} className="flex items-center gap-1.5 text-brand-700 hover:underline">
              <Mail aria-hidden size={13} /> {quotation.companyEmail}
            </a>
          )}
        </div>
        {!quotation.followUpOptOut && quotation.status === 'Sent' && (
          <button
            type="button"
            onClick={() => setParams({ abmelden: '1' })}
            className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
          >
            {tr('Keine Erinnerungen mehr erhalten', 'Stop receiving reminders')}
          </button>
        )}
      </CardBody>
      {dialog === 'accept' && <AcceptDialog token={token} quotation={quotation} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === 'reject' && <RejectDialog token={token} quotation={quotation} open onOpenChange={(o) => !o && setDialog(null)} />}
    </Card>
  );
}

export function usePublicQuotation(token: string, enabled = true) {
  return useQuery({
    enabled: enabled && token.length > 0,
    queryKey: publicQueryKey(token),
    queryFn: () => api.publicQuotation.get(token),
    retry: (count, error) => !(error instanceof ApiError) && count < 2,
    // Every GET is recorded as "opened" for the provider – avoid needless refetches.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}

export function PublicLinkError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
    return (
      <PublicMessage icon={<Link2Off aria-hidden size={22} />} title={error.status === 410 ? tr('Dieses Angebot ist nicht mehr verfügbar', 'This quotation is no longer available') : tr('Link ungültig', 'Invalid link')}
      >
        {error.status === 410
          ? tr(
              'Der Link wurde widerrufen, ist abgelaufen oder das Angebot wurde zurückgezogen. Bitte wenden Sie sich an das Unternehmen, von dem Sie das Angebot erhalten haben.',
              'The link has been revoked or has expired, or the quotation was withdrawn. Please contact the company that sent you the quotation.',
            )
          : tr(
              'Dieser Link ist ungültig oder unvollständig. Bitte prüfen Sie, ob Sie ihn vollständig aus der E-Mail übernommen haben.',
              'This link is invalid or incomplete. Please check that you copied the complete link from the email.',
            )}
      </PublicMessage>
    );
  }
  return (
    <PublicMessage
      icon={<FileX2 aria-hidden size={22} />}
      title={tr('Angebot konnte nicht geladen werden', 'Could not load the quotation')}
      actions={
        <Button icon={RefreshCw} onClick={onRetry}>
          {tr('Erneut versuchen', 'Try again')}
        </Button>
      }
    >
      {errorMessage(error)}
    </PublicMessage>
  );
}

export default function PublicQuotationPage() {
  const { token = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const quotation = usePublicQuotation(token);
  const { resolved: scheme } = useTheme();
  useDocumentTitle(
    quotation.data
      ? tr(`Angebot ${quotation.data.number} – ${quotation.data.companyName}`, `Quotation ${quotation.data.number} – ${quotation.data.companyName}`)
      : tr('Angebot', 'Quotation'),
  );

  if (quotation.isPending) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-24">
          <Spinner label={tr('Angebot wird geladen …', 'Loading quotation …')} />
        </div>
      </PublicLayout>
    );
  }
  if (quotation.isError) return <PublicLinkError error={quotation.error} onRetry={() => void quotation.refetch()} />;
  const q = quotation.data;
  const showOptOut = params.get('abmelden') === '1';

  return (
    <PublicLayout
      header={
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {q.hasLogo ? (
            <img src={api.publicQuotation.logoUrl(token)} alt={q.companyName} className="max-h-10 max-w-[200px] object-contain" />
          ) : (
            <span className="text-base font-semibold" style={{ color: readableBrandTextColor(q.brandColor, scheme) }}>
              {q.companyName}
            </span>
          )}
          <QuotationStatusBadge status={q.status} />
        </div>
      }
    >
      <div className="h-1" style={{ background: q.brandColor }} />
      <div className="mx-auto max-w-[1100px] px-3 py-6 sm:px-6 sm:py-10">
        {showOptOut && (
          <OptOutCard
            token={token}
            quotation={q}
            onDone={() =>
              setParams((p) => {
                p.delete('abmelden');
                return p;
              })
            }
          />
        )}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">{tr(`Ihr Angebot von ${q.companyName}`, `Your quotation from ${q.companyName}`)}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {q.number} · {tr(`gültig bis ${formatDate(q.validUntil)}`, `valid until ${formatDate(q.validUntil)}`)}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <QuotationDocument
              className="sm:ap-a4 rounded-lg"
              data={{
                number: q.number,
                title: q.title,
                issueDate: q.issueDate,
                validUntil: q.validUntil,
                taxMode: q.taxMode,
                companyName: q.companyName,
                companyAddress: q.companyAddress,
                companyContact: [q.companyPhone && `Tel. ${q.companyPhone}`, q.companyEmail].filter(Boolean).join('\n') || null,
                brandColor: q.brandColor,
                logoUrl: q.hasLogo ? api.publicQuotation.logoUrl(token) : null,
                recipientName: q.recipientName,
                recipientAddress: q.recipientAddress,
                introText: q.introText,
                closingText: q.closingText,
                terms: q.terms,
                paymentTerms: q.paymentTerms,
                lines: q.lineItems,
                totals: q.totals,
              }}
            />
          </div>
          <aside className="space-y-4">
            <DecisionPanel token={token} quotation={q} />
            <p className="flex gap-2 px-1 text-xs text-neutral-600">
              <Info aria-hidden size={14} className="mt-px shrink-0" />
              <span>
                {tr(
                  `Hinweis: Das Öffnen dieser Seite wird mit Zeitpunkt für ${q.companyName} erfasst, damit das Unternehmen weiß, dass Sie das Angebot gesehen haben.`,
                  `Note: opening this page is recorded with the time for ${q.companyName}, so the company knows that you have seen the quotation.`,
                )}
              </span>
            </p>
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
