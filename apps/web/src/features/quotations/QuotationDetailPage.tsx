import { followUpKindLabel, quotationEventLabel, type QuotationDto, type QuotationEventType } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellOff,
  CircleCheck,
  CircleX,
  Copy,
  Eye,
  FilePen,
  FileStack,
  FileText,
  GitBranch,
  Hammer,
  History,
  Link2,
  Link2Off,
  Mail,
  MailX,
  MoreHorizontal,
  Pencil,
  Ban,
  ReceiptText,
  Send,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useCompany } from '@/app/company';
import { DeliveryTable, EventTimeline } from '@/components/domain/History';
import { FollowUpStatusBadge, QuotationStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DetailList } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, PageSkeleton, Spinner } from '@/components/ui/Feedback';
import { HelpPopover, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { InvoiceLinkList, useCreateInvoiceFrom } from '@/features/invoices/shared';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatEur, formatRelative, plural } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { CancelDialog, ConvertToJobDialog, DecisionDialog, PublicLinkDialog, SaveTemplateDialog, SendDialog } from './QuotationDialogs';
import { DocumentLineItems } from './QuotationDocument';
import { TotalsList } from './Totals';

const eventIcons: Partial<Record<QuotationEventType, LucideIcon>> = {
  Created: FilePen,
  Updated: Pencil,
  Sent: Send,
  MarkedAsSent: Send,
  ReminderQueued: Mail,
  Accepted: CircleCheck,
  Rejected: CircleX,
  Expired: History,
  Cancelled: Ban,
  RevisionCreated: GitBranch,
  SupersededByRevision: GitBranch,
  ConvertedToJob: Hammer,
  PdfGenerated: FileText,
  PublicLinkCreated: Link2,
  PublicLinkRevoked: Link2Off,
  PublicLinkOpened: Eye,
  EmailHandedOff: Mail,
  EmailFailed: MailX,
  FollowUpsCancelled: BellOff,
  Duplicated: Copy,
  CustomerOptedOut: BellOff,
};

const eventTone: Partial<Record<QuotationEventType, string>> = {
  Accepted: 'bg-success-bg text-success-text',
  Rejected: 'bg-danger-bg text-danger-text',
  EmailFailed: 'bg-danger-bg text-danger-text',
  Sent: 'bg-info-bg text-info-text',
  ConvertedToJob: 'bg-success-bg text-success-text',
};

function Timeline({ companyId, id }: { companyId: string; id: string }) {
  const events = useQuery({ queryKey: qk.quotationEvents(companyId, id), queryFn: () => api.quotations.events(companyId, id) });
  return <EventTimeline query={events} labels={quotationEventLabel} icons={eventIcons} tones={eventTone} />;
}

function Deliveries({ companyId, id }: { companyId: string; id: string }) {
  const deliveries = useQuery({ queryKey: qk.quotationDeliveries(companyId, id), queryFn: () => api.quotations.deliveries(companyId, id) });
  return <DeliveryTable query={deliveries} emptyDescription={tr('Hier erscheinen Angebots- und Erinnerungs-E-Mails mit ihrem Versandstatus.', 'Quotation and reminder emails appear here with their delivery status.')} />;
}

function FollowUps({ companyId, id }: { companyId: string; id: string }) {
  const queryClient = useQueryClient();
  const followUps = useQuery({ queryKey: qk.quotationFollowUps(companyId, id), queryFn: () => api.quotations.followUps(companyId, id) });
  const [confirm, setConfirm] = useState(false);
  const scheduled = followUps.data?.filter((f) => f.status === 'Scheduled').length ?? 0;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-25 px-5 py-3">
        <p className="text-[13px] text-neutral-600">
          {tr(
            'Erinnerungen stoppen automatisch, sobald der Kunde entscheidet, das Angebot abläuft oder er sich abmeldet.',
            'Reminders stop automatically as soon as the customer decides, the quotation expires or the customer unsubscribes.',
          )}
        </p>
        <Button size="sm" variant="secondary" icon={BellOff} disabled={scheduled === 0} onClick={() => setConfirm(true)}>
          {tr('Alle Erinnerungen stoppen', 'Stop all reminders')}
        </Button>
      </div>
      {followUps.isPending ? (
        <Spinner className="p-5" />
      ) : followUps.isError ? (
        <ErrorState error={followUps.error} onRetry={() => void followUps.refetch()} />
      ) : followUps.data.length === 0 ? (
        <EmptyState
          compact
          icon={BellOff}
          title={tr('Keine Erinnerungen geplant', 'No reminders scheduled')}
          description={tr(
            'Erinnerungen werden beim Versand per E-Mail geplant, wenn „Automatisch nachfassen“ aktiv ist.',
            'Reminders are scheduled when you send by email with “Automatic follow-up” switched on.',
          )}
        />
      ) : (
        <ul className="divide-y divide-neutral-100" data-testid="follow-ups">
          {[...followUps.data]
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
            .map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">{followUpKindLabel[f.kind]}</p>
                  <p className="text-[13px] text-neutral-500">
                    {f.status === 'Scheduled'
                      ? tr(`geplant für ${formatDateTime(f.dueAt)}`, `scheduled for ${formatDateTime(f.dueAt)}`)
                      : f.processedAt
                        ? tr(`am ${formatDateTime(f.processedAt)}`, `on ${formatDateTime(f.processedAt)}`)
                        : tr(`fällig ${formatDateTime(f.dueAt)}`, `due ${formatDateTime(f.dueAt)}`)}
                    {f.statusReason ? ` · ${f.statusReason}` : ''}
                  </p>
                </div>
                <FollowUpStatusBadge status={f.status} />
              </li>
            ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={tr('Alle geplanten Erinnerungen stoppen?', 'Stop all scheduled reminders?')}
        description={tr(
          'Ihr Kunde erhält zu diesem Angebot keine automatischen Erinnerungen mehr. Das Angebot selbst bleibt unverändert.',
          'Your customer will no longer receive automatic reminders for this quotation. The quotation itself stays unchanged.',
        )}
        confirmLabel={tr('Erinnerungen stoppen', 'Stop reminders')}
        variant="danger"
        onConfirm={async () => {
          await api.quotations.cancelFollowUps(companyId, id);
          await queryClient.invalidateQueries({ queryKey: qk.quotation(companyId, id) });
          toast.success(tr('Erinnerungen gestoppt', 'Reminders stopped'));
        }}
      />
    </div>
  );
}

function Revisions({ quotation }: { quotation: QuotationDto }) {
  if (quotation.revisions.length <= 1 && !quotation.previousRevisionId) {
    return (
      <EmptyState
        compact
        icon={GitBranch}
        title={tr('Keine Revisionen', 'No revisions')}
        description={tr('Revisionen entstehen, wenn Sie ein versendetes Angebot überarbeiten.', 'Revisions are created when you revise a quotation that has been sent.')}
      />
    );
  }
  return (
    <ul className="divide-y divide-neutral-100">
      {[...quotation.revisions]
        .sort((a, b) => b.revisionNumber - a.revisionNumber)
        .map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-2">
              {r.id === quotation.id ? (
                <span className="font-medium text-neutral-900">{r.number}</span>
              ) : (
                <Link to={`/angebote/${r.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.number}
                </Link>
              )}
              <span className="text-[13px] text-neutral-500">Revision {r.revisionNumber}</span>
              {r.id === quotation.id && <span className="text-[13px] text-neutral-500">{tr('(diese)', '(this one)')}</span>}
            </div>
            <QuotationStatusBadge status={r.status} />
          </li>
        ))}
    </ul>
  );
}

export default function QuotationDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const quotation = useQuery({ queryKey: qk.quotation(companyId, id), queryFn: () => api.quotations.get(companyId, id) });
  const [dialog, setDialog] = useState<null | 'send' | 'accept' | 'reject' | 'cancel' | 'job' | 'link' | 'template' | 'revoke' | 'delete' | 'revise'>(null);

  // ?senden=1 (from the editor's "Speichern & versenden") opens the send dialog.
  const sendRequested = params.get('senden') === '1';
  const closeSend = () => {
    setDialog(null);
    if (sendRequested)
      setParams(
        (p) => {
          p.delete('senden');
          return p;
        },
        { replace: true },
      );
  };

  const duplicate = useMutation({
    mutationFn: () => api.quotations.duplicate(companyId, id),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
      toast.success(tr('Angebot dupliziert', 'Quotation duplicated'), tr(`${copy.number} wurde als Entwurf angelegt.`, `${copy.number} was created as a draft.`));
      void navigate(`/angebote/${copy.id}/bearbeiten`);
    },
    onError: (error) => toast.error(tr('Duplizieren fehlgeschlagen', 'Duplicating failed'), errorMessage(error)),
  });
  const createInvoice = useCreateInvoiceFrom({ type: 'quotation', id });

  if (quotation.isPending) return <PageSkeleton rows={10} />;
  if (quotation.isError) return <ErrorState error={quotation.error} onRetry={() => void quotation.refetch()} />;
  const q = quotation.data;
  const can = (status: QuotationDto['status']) => q.allowedTransitions.includes(status);
  const canAccept = can('Accepted') || q.status === 'Expired';
  const canReject = can('Rejected');
  const canRevise = q.status === 'Sent' || q.status === 'Rejected' || q.status === 'Expired';
  const canLink = q.status !== 'Draft' && q.status !== 'Cancelled';

  const primary = (() => {
    if (q.status === 'Draft')
      return (
        <>
          <ButtonLink to={`/angebote/${q.id}/bearbeiten`} icon={Pencil}>
            {tr('Bearbeiten', 'Edit')}
          </ButtonLink>
          <Button variant="primary" icon={Send} onClick={() => setDialog('send')}>
            {tr('Senden', 'Send')}
          </Button>
        </>
      );
    if (q.status === 'Sent')
      return (
        <>
          <Button icon={CircleX} onClick={() => setDialog('reject')} disabled={!canReject}>
            {tr('Ablehnung erfassen', 'Record rejection')}
          </Button>
          <Button variant="primary" icon={CircleCheck} onClick={() => setDialog('accept')} disabled={!canAccept}>
            {tr('Annahme erfassen', 'Record acceptance')}
          </Button>
        </>
      );
    if (q.status === 'Accepted')
      return (
        <>
          <Button icon={ReceiptText} loading={createInvoice.isPending} onClick={() => createInvoice.mutate()}>
            {tr('Rechnung erstellen', 'Create invoice')}
          </Button>
          {q.jobId ? (
            <ButtonLink to={`/auftraege/${q.jobId}`} variant="primary" icon={Hammer}>
              {tr('Zum Auftrag', 'Go to job')}
            </ButtonLink>
          ) : (
            <Button variant="primary" icon={Hammer} onClick={() => setDialog('job')}>
              {tr('In Auftrag umwandeln', 'Convert to job')}
            </Button>
          )}
        </>
      );
    if (canRevise)
      return (
        <Button variant="primary" icon={GitBranch} onClick={() => setDialog('revise')}>
          {tr('Revision erstellen', 'Create revision')}
        </Button>
      );
    return null;
  })();

  return (
    <>
      <PageHeader
        title={q.number}
        documentTitle={tr(`Angebot ${q.number}`, `Quotation ${q.number}`)}
        back={{ to: '/angebote', label: tr('Angebote', 'Quotations') }}
        meta={
          <div className="flex items-center gap-2">
            <QuotationStatusBadge status={q.status} size="md" />
            {q.revisionNumber > 1 && <span className="text-[13px] text-neutral-500">Revision {q.revisionNumber}</span>}
          </div>
        }
        description={
          <>
            {q.title} ·{' '}
            <Link to={`/kunden/${q.customerId}`} className="font-medium text-neutral-700 hover:text-brand-700 dark:hover:text-brand-800 hover:underline">
              {q.customerName}
            </Link>
          </>
        }
        actions={
          <>
            <ButtonLink to={`/angebote/${q.id}/pdf`} icon={FileText}>
              PDF
            </ButtonLink>
            {primary}
            <Menu>
              <MenuTrigger asChild>
                <IconButton icon={MoreHorizontal} label={tr('Weitere Aktionen', 'More actions')} variant="secondary" />
              </MenuTrigger>
              <MenuContent className="w-[260px]">
                <MenuItem icon={Eye} onSelect={() => void navigate(`/angebote/${q.id}/vorschau`)}>
                  {tr('Vorschau', 'Preview')}
                </MenuItem>
                {q.status === 'Sent' && (
                  <MenuItem icon={Send} onSelect={() => setDialog('send')} description={tr('Erneut per E-Mail oder als übermittelt markieren', 'Send again by email or mark as delivered')}>
                    {tr('Erneut senden', 'Send again')}
                  </MenuItem>
                )}
                {q.status === 'Expired' && (
                  <MenuItem icon={CircleCheck} onSelect={() => setDialog('accept')} description={tr('Nachträgliche Zusage des Kunden', 'Customer accepted after expiry')}>
                    {tr('Späte Annahme erfassen', 'Record late acceptance')}
                  </MenuItem>
                )}
                {canRevise && q.status !== 'Rejected' && q.status !== 'Expired' && (
                  <MenuItem icon={GitBranch} onSelect={() => setDialog('revise')}>
                    {tr('Revision erstellen', 'Create revision')}
                  </MenuItem>
                )}
                <MenuItem icon={Copy} onSelect={() => duplicate.mutate()} disabled={duplicate.isPending}>
                  {tr('Duplizieren', 'Duplicate')}
                </MenuItem>
                <MenuItem icon={FileStack} onSelect={() => setDialog('template')}>
                  {tr('Als Vorlage speichern', 'Save as template')}
                </MenuItem>
                {canLink && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Link2} onSelect={() => setDialog('link')} description={q.hasActivePublicLink ? tr('Ersetzt den bisherigen Link', 'Replaces the previous link') : undefined}>
                      {q.hasActivePublicLink ? tr('Kundenlink neu erzeugen', 'Regenerate customer link') : tr('Kundenlink erzeugen', 'Create customer link')}
                    </MenuItem>
                    {q.hasActivePublicLink && (
                      <MenuItem icon={Link2Off} onSelect={() => setDialog('revoke')}>
                        {tr('Kundenlink widerrufen', 'Revoke customer link')}
                      </MenuItem>
                    )}
                  </>
                )}
                {(can('Cancelled') || q.status === 'Draft') && <MenuSeparator />}
                {can('Cancelled') && (
                  <MenuItem icon={Ban} danger onSelect={() => setDialog('cancel')}>
                    {tr('Stornieren …', 'Cancel quotation …')}
                  </MenuItem>
                )}
                {q.status === 'Draft' && (
                  <MenuItem icon={Trash2} danger onSelect={() => setDialog('delete')}>
                    {tr('Entwurf löschen …', 'Delete draft …')}
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </>
        }
      />

      {q.status === 'Accepted' && (
        <Alert tone="success" className="mb-6" title={tr(`Angenommen am ${formatDateTime(q.decidedAt)}`, `Accepted on ${formatDateTime(q.decidedAt)}`)}>
          {q.decidedByActor === 'Customer'
            ? tr(`Online angenommen von ${q.decisionName ?? 'dem Kunden'}.`, `Accepted online by ${q.decisionName ?? 'the customer'}.`)
            : tr('Annahme manuell erfasst.', 'Acceptance recorded manually.')}
          {q.decisionNote && tr(` Notiz: „${q.decisionNote}“`, ` Note: “${q.decisionNote}”`)}
        </Alert>
      )}
      {q.status === 'Rejected' && (
        <Alert tone="danger" className="mb-6" title={tr(`Abgelehnt am ${formatDateTime(q.decidedAt)}`, `Declined on ${formatDateTime(q.decidedAt)}`)}>
          {q.decidedByActor === 'Customer'
            ? tr(`Online abgelehnt${q.decisionName ? ` von ${q.decisionName}` : ''}.`, `Declined online${q.decisionName ? ` by ${q.decisionName}` : ''}.`)
            : tr('Ablehnung manuell erfasst.', 'Rejection recorded manually.')}
          {q.decisionNote && tr(` Grund: „${q.decisionNote}“`, ` Reason: “${q.decisionNote}”`)}
        </Alert>
      )}
      {q.status === 'Cancelled' && (
        <Alert tone="neutral" className="mb-6" title={tr(`Storniert am ${formatDateTime(q.cancelledAt)}`, `Cancelled on ${formatDateTime(q.cancelledAt)}`)}>
          {q.cancellationReason ?? tr('Kein Grund angegeben.', 'No reason given.')}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardBody className="grid gap-6 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <p className="text-xs font-medium text-neutral-500">{tr('Empfänger', 'Recipient')}</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{q.recipientName}</p>
                {q.recipientContact && !q.recipientName.includes(q.recipientContact) && <p className="text-sm text-neutral-700">{q.recipientContact}</p>}
                {q.recipientAddress && <p className="text-sm whitespace-pre-line text-neutral-700">{q.recipientAddress}</p>}
                {q.recipientEmail && <p className="mt-1 text-[13px] text-neutral-500">{q.recipientEmail}</p>}
              </div>
              <DetailList
                className="sm:col-span-2"
                columns={2}
                items={[
                  { label: tr('Angebotsdatum', 'Quotation date'), value: formatDate(q.issueDate) },
                  { label: tr('Gültig bis', 'Valid until'), value: formatDate(q.validUntil) },
                  { label: tr('Netto', 'Net'), value: <span className="tabular">{formatEur(q.totals.netTotal)}</span> },
                  {
                    label: q.taxMode === 'Standard' ? tr('Brutto', 'Gross') : tr('Gesamt', 'Total'),
                    value: <span className="font-semibold tabular">{formatEur(q.totals.grossTotal)}</span> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={tr('Positionen', 'Line items')}
              description={plural(q.lineItems.length, tr('Position', 'line item'), tr('Positionen', 'line items'))}
            />
            <CardBody>
              {q.introText && <p className="mb-4 text-sm whitespace-pre-line text-neutral-700">{q.introText}</p>}
              <DocumentLineItems
                taxMode={q.taxMode}
                brandColor="var(--ap-neutral-200)"
                lines={[...q.lineItems].sort((a, b) => a.position - b.position).map((l) => ({ ...l, description: l.description }))}
              />
              <div className="mt-4 flex justify-end">
                <TotalsList totals={q.totals} taxMode={q.taxMode} className="w-full sm:w-[340px]" />
              </div>
              {q.closingText && <p className="mt-6 text-sm whitespace-pre-line text-neutral-700">{q.closingText}</p>}
            </CardBody>
          </Card>

          <Card>
            <Tabs defaultValue="events">
              <TabsList label={tr('Angebotsdetails', 'Quotation details')} className="px-3">
                <TabsTrigger value="events">{tr('Verlauf', 'History')}</TabsTrigger>
                <TabsTrigger value="deliveries">{tr('E-Mail-Versand', 'Email delivery')}</TabsTrigger>
                <TabsTrigger value="followups">{tr('Erinnerungen', 'Reminders')}</TabsTrigger>
                <TabsTrigger value="revisions" count={q.revisions.length > 1 ? q.revisions.length : undefined}>
                  {tr('Revisionen', 'Revisions')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="events">
                <Timeline companyId={companyId} id={q.id} />
              </TabsContent>
              <TabsContent value="deliveries">
                <Deliveries companyId={companyId} id={q.id} />
              </TabsContent>
              <TabsContent value="followups">
                <FollowUps companyId={companyId} id={q.id} />
              </TabsContent>
              <TabsContent value="revisions">
                <Revisions quotation={q} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Status" as="h2" />
            <CardBody>
              <DetailList
                items={[
                  { label: tr('Erstellt', 'Created'), value: formatDateTime(q.createdAt) },
                  { label: tr('Zuletzt geändert', 'Last modified'), value: formatDateTime(q.updatedAt) },
                  { label: tr('Versendet', 'Sent'), value: q.sentAt ? formatDateTime(q.sentAt) : null },
                  ...(q.decidedAt ? [{ label: tr('Entschieden', 'Decided'), value: formatDateTime(q.decidedAt) }] : []),
                  ...(q.expiredAt ? [{ label: tr('Abgelaufen', 'Expired'), value: formatDateTime(q.expiredAt) }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={tr('Kundenlink', 'Customer link')}
              actions={
                <HelpPopover label={tr('Was ist der Kundenlink?', 'What is the customer link?')}>
                  {tr(
                    'Über den Kundenlink sieht Ihr Kunde das Angebot ohne Anmeldung, lädt das PDF und kann online annehmen oder ablehnen. Der Link wird aus Sicherheitsgründen nur beim Erzeugen angezeigt.',
                    'With the customer link your customer can view the quotation without signing in, download the PDF and accept or decline online. For security reasons the link is only shown when it is created.',
                  )}
                </HelpPopover>
              }
            />
            <CardBody className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                {q.hasActivePublicLink ? <Link2 aria-hidden size={16} className="text-success-text" /> : <Link2Off aria-hidden size={16} className="text-neutral-400" />}
                <span className="font-medium">{q.hasActivePublicLink ? tr('Aktiv', 'Active') : tr('Kein aktiver Link', 'No active link')}</span>
              </p>
              <p className="text-neutral-600" data-testid="public-link-last-opened">
                {tr('Zuletzt geöffnet:', 'Last opened:')}{' '}
                {q.publicLinkLastOpenedAt ? (
                  <span title={formatDateTime(q.publicLinkLastOpenedAt)}>{formatRelative(q.publicLinkLastOpenedAt)}</span>
                ) : (
                  tr('noch nie', 'never')
                )}
              </p>
              {canLink && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" icon={Link2} onClick={() => setDialog('link')}>
                    {q.hasActivePublicLink ? tr('Neu erzeugen', 'Regenerate') : tr('Erzeugen', 'Create')}
                  </Button>
                  {q.hasActivePublicLink && (
                    <Button size="sm" variant="dangerGhost" icon={Link2Off} onClick={() => setDialog('revoke')}>
                      {tr('Widerrufen', 'Revoke')}
                    </Button>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {q.jobId && (
            <Card>
              <CardHeader title={tr('Auftrag', 'Job')} />
              <CardBody>
                <Link to={`/auftraege/${q.jobId}`} className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                  <Hammer aria-hidden size={15} /> {tr('Zum Auftrag', 'Go to job')}
                </Link>
              </CardBody>
            </Card>
          )}

          {(q.status === 'Accepted' || q.invoices.length > 0) && (
            <Card>
              <CardHeader title={tr('Rechnungen', 'Invoices')} />
              <CardBody>
                <InvoiceLinkList invoices={q.invoices} empty={tr('Noch keine Rechnung zu diesem Angebot.', 'No invoice for this quotation yet.')} />
              </CardBody>
            </Card>
          )}

          {q.internalNotes && (
            <Card className="border-dashed bg-neutral-25">
              <CardHeader title={tr('Interne Notizen', 'Internal notes')} description={tr('Nur intern sichtbar', 'Only visible internally')} />
              <CardBody>
                <p className="text-sm whitespace-pre-line text-neutral-700">{q.internalNotes}</p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      <SendDialog
        quotation={q}
        open={dialog === 'send' || (sendRequested && (q.status === 'Draft' || q.status === 'Sent'))}
        onOpenChange={(o) => (o ? setDialog('send') : closeSend())}
      />
      <DecisionDialog quotation={q} decision="accept" open={dialog === 'accept'} onOpenChange={(o) => setDialog(o ? 'accept' : null)} />
      <DecisionDialog quotation={q} decision="reject" open={dialog === 'reject'} onOpenChange={(o) => setDialog(o ? 'reject' : null)} />
      <CancelDialog quotation={q} open={dialog === 'cancel'} onOpenChange={(o) => setDialog(o ? 'cancel' : null)} />
      {dialog === 'job' && <ConvertToJobDialog quotation={q} open onOpenChange={(o) => setDialog(o ? 'job' : null)} />}
      <PublicLinkDialog quotation={q} open={dialog === 'link'} onOpenChange={(o) => setDialog(o ? 'link' : null)} />
      <SaveTemplateDialog quotation={q} open={dialog === 'template'} onOpenChange={(o) => setDialog(o ? 'template' : null)} />
      <ConfirmDialog
        open={dialog === 'revoke'}
        onOpenChange={(o) => setDialog(o ? 'revoke' : null)}
        title={tr('Kundenlink widerrufen?', 'Revoke customer link?')}
        description={tr(
          'Der Link funktioniert danach nicht mehr. Ihr Kunde sieht einen Hinweis, dass das Angebot nicht mehr verfügbar ist. Sie können jederzeit einen neuen Link erzeugen.',
          'The link will stop working. Your customer will see a notice that the quotation is no longer available. You can create a new link at any time.',
        )}
        confirmLabel={tr('Widerrufen', 'Revoke')}
        variant="danger"
        onConfirm={async () => {
          await api.quotations.revokePublicLink(companyId, q.id);
          await queryClient.invalidateQueries({ queryKey: qk.quotation(companyId, q.id) });
          toast.success(tr('Kundenlink widerrufen', 'Customer link revoked'));
        }}
      />
      <ConfirmDialog
        open={dialog === 'revise'}
        onOpenChange={(o) => setDialog(o ? 'revise' : null)}
        title={tr('Revision erstellen?', 'Create revision?')}
        description={tr(
          `Es wird ein neuer Entwurf als Revision ${q.revisionNumber + 1} angelegt. ${q.number} bleibt unverändert im Verlauf erhalten.`,
          `A new draft is created as revision ${q.revisionNumber + 1}. ${q.number} is kept unchanged in the history.`,
        )}
        confirmLabel={tr('Revision erstellen', 'Create revision')}
        onConfirm={async () => {
          const revision = await api.quotations.revise(companyId, q.id);
          void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
          toast.success(tr('Revision erstellt', 'Revision created'), revision.number);
          void navigate(`/angebote/${revision.id}/bearbeiten`);
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        title={tr(`Entwurf ${q.number} löschen?`, `Delete draft ${q.number}?`)}
        description={tr(
          'Der Entwurf wird endgültig gelöscht. Die Angebotsnummer wird nicht erneut vergeben.',
          'The draft will be deleted permanently. The quotation number will not be reused.',
        )}
        confirmLabel={tr('Löschen', 'Delete')}
        variant="danger"
        onConfirm={async () => {
          await api.quotations.delete(companyId, q.id);
          queryClient.removeQueries({ queryKey: qk.quotation(companyId, q.id) });
          void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
          toast.success(tr('Entwurf gelöscht', 'Draft deleted'));
          void navigate('/angebote', { replace: true });
        }}
      />
    </>
  );
}
