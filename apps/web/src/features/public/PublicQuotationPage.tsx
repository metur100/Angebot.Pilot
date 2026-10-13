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
import { readableBrandColor } from '@/lib/color';
import { applyServerErrors, errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatEur } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
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
    if (fullName.trim().length < 2) next.fullName = 'Bitte geben Sie Ihren vollständigen Namen an.';
    if (!confirm) next.confirmBinding = 'Bitte bestätigen Sie die verbindliche Annahme.';
    setErrors(next);
    if (Object.keys(next).length === 0) accept.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !accept.isPending && onOpenChange(o)}
      title="Angebot verbindlich annehmen"
      description={`${quotation.number} · ${quotation.title} · ${formatEur(quotation.totals.grossTotal)}`}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={accept.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={accept.isPending} onClick={submit} style={{ background: readableBrandColor(quotation.brandColor) }}>
            Jetzt verbindlich annehmen
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
        <Field label="Ihr vollständiger Name" error={errors.fullName} required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={200} />
        </Field>
        <Checkbox
          label={<strong className="font-medium">Ich nehme dieses Angebot verbindlich an.</strong>}
          description={`Damit beauftragen Sie ${quotation.companyName} zu den Bedingungen dieses Angebots.`}
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          error={errors.confirmBinding}
        />
        <Field label="Nachricht an den Anbieter" optional>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="z. B. Wunschtermin" />
        </Field>
        <p className="text-xs text-neutral-500">
          Ihre Annahme per Klick ist eine Willenserklärung. Sie ist keine qualifizierte elektronische Signatur. Name, Zeitpunkt und Notiz werden für{' '}
          {quotation.companyName} gespeichert.
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
      title="Angebot ablehnen"
      description={`${quotation.number} · ${quotation.title}`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={reject.isPending}>
            Abbrechen
          </Button>
          <Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>
            Angebot ablehnen
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
        <Field label="Ihr Name" optional>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={200} />
        </Field>
        <Field label="Grund" optional hint={`Hilft ${quotation.companyName}, künftige Angebote besser zu machen.`}>
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
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <BellOff aria-hidden size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {done ? (
            <>
              <h2 className="text-[15px] font-semibold text-neutral-900">Sie erhalten keine Erinnerungen mehr zu diesem Angebot</h2>
              <p className="mt-1 text-sm text-neutral-600">Das Angebot selbst bleibt unverändert und kann weiterhin angesehen werden.</p>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold text-neutral-900">Keine weiteren Erinnerungen zu diesem Angebot erhalten?</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {quotation.companyName} sendet Ihnen dann keine automatischen Erinnerungs-E-Mails zu Angebot {quotation.number} mehr.
              </p>
              {optOut.isError && (
                <p role="alert" className="mt-2 text-sm text-danger-text">
                  {errorMessage(optOut.error)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" loading={optOut.isPending} onClick={() => optOut.mutate()}>
                  Ja, keine Erinnerungen mehr
                </Button>
                <Button variant="ghost" onClick={onDone}>
                  Abbrechen
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
      blocked = { icon: <CircleCheck aria-hidden size={18} className="text-success-text" />, title: 'Angebot angenommen', text: `Angenommen am ${formatDateTime(quotation.decidedAt)}${quotation.decisionName ? ` von ${quotation.decisionName}` : ''}. Vielen Dank!` };
    else if (quotation.status === 'Rejected')
      blocked = { icon: <CircleX aria-hidden size={18} className="text-danger-text" />, title: 'Angebot abgelehnt', text: `Abgelehnt am ${formatDateTime(quotation.decidedAt)}.` };
    else if (quotation.status === 'Expired' || quotation.isPastValidity)
      blocked = { icon: <Hourglass aria-hidden size={18} className="text-warning-text" />, title: 'Angebot abgelaufen', text: `Die Gültigkeit endete am ${formatDate(quotation.validUntil)}. Bitte wenden Sie sich an ${quotation.companyName}, wenn Sie weiterhin Interesse haben.` };
    else if (quotation.status === 'Cancelled')
      blocked = { icon: <FileX2 aria-hidden size={18} className="text-neutral-500" />, title: 'Angebot storniert', text: `${quotation.companyName} hat dieses Angebot zurückgezogen.` };
    else blocked = { icon: <Info aria-hidden size={18} className="text-neutral-500" />, title: 'Keine Entscheidung möglich', text: 'Über dieses Angebot kann derzeit nicht online entschieden werden.' };
  }
  return (
    <Card className="lg:sticky lg:top-6">
      <CardBody className="space-y-4">
        <div>
          <p className="text-[13px] text-neutral-500">{quotation.taxMode === 'Standard' ? 'Gesamtbetrag (brutto)' : 'Gesamtbetrag'}</p>
          <p className="text-2xl font-semibold text-neutral-900 tabular">{formatEur(quotation.totals.grossTotal)}</p>
          <p className="text-[13px] text-neutral-500">gültig bis {formatDate(quotation.validUntil)}</p>
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
              <CircleCheck aria-hidden size={18} /> Angebot annehmen
            </BrandedButton>
            <Button size="lg" className="w-full" onClick={() => setDialog('reject')}>
              Ablehnen
            </Button>
          </div>
        )}
        <a
          href={api.publicQuotation.pdfUrl(token)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          <Download aria-hidden size={16} /> PDF herunterladen
        </a>
        <div className="space-y-1.5 border-t border-neutral-100 pt-3 text-[13px] text-neutral-600">
          <p className="font-medium text-neutral-800">Fragen zum Angebot?</p>
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
            Keine Erinnerungen mehr erhalten
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
      <PublicMessage icon={<Link2Off aria-hidden size={22} />} title={error.status === 410 ? 'Dieses Angebot ist nicht mehr verfügbar' : 'Link ungültig'}>
        {error.status === 410
          ? 'Der Link wurde widerrufen, ist abgelaufen oder das Angebot wurde zurückgezogen. Bitte wenden Sie sich an das Unternehmen, von dem Sie das Angebot erhalten haben.'
          : 'Dieser Link ist ungültig oder unvollständig. Bitte prüfen Sie, ob Sie ihn vollständig aus der E-Mail übernommen haben.'}
      </PublicMessage>
    );
  }
  return (
    <PublicMessage
      icon={<FileX2 aria-hidden size={22} />}
      title="Angebot konnte nicht geladen werden"
      actions={
        <Button icon={RefreshCw} onClick={onRetry}>
          Erneut versuchen
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
  useDocumentTitle(quotation.data ? `Angebot ${quotation.data.number} – ${quotation.data.companyName}` : 'Angebot');

  if (quotation.isPending) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-24">
          <Spinner label="Angebot wird geladen …" />
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
            <span className="text-base font-semibold" style={{ color: readableBrandColor(q.brandColor) }}>
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
          <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">Ihr Angebot von {q.companyName}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {q.number} · gültig bis {formatDate(q.validUntil)}
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
              <span>Hinweis: Das Öffnen dieser Seite wird mit Zeitpunkt für {q.companyName} erfasst, damit das Unternehmen weiß, dass Sie das Angebot gesehen haben.</span>
            </p>
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
