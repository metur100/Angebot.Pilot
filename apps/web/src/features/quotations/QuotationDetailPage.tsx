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
import { formatDate, formatDateTime, formatEur, formatRelative } from '@/lib/format';
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
  return <DeliveryTable query={deliveries} emptyDescription="Hier erscheinen Angebots- und Erinnerungs-E-Mails mit ihrem Versandstatus." />;
}

function FollowUps({ companyId, id }: { companyId: string; id: string }) {
  const queryClient = useQueryClient();
  const followUps = useQuery({ queryKey: qk.quotationFollowUps(companyId, id), queryFn: () => api.quotations.followUps(companyId, id) });
  const [confirm, setConfirm] = useState(false);
  const scheduled = followUps.data?.filter((f) => f.status === 'Scheduled').length ?? 0;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-25 px-5 py-3">
        <p className="text-[13px] text-neutral-600">Erinnerungen stoppen automatisch, sobald der Kunde entscheidet, das Angebot abläuft oder er sich abmeldet.</p>
        <Button size="sm" variant="secondary" icon={BellOff} disabled={scheduled === 0} onClick={() => setConfirm(true)}>
          Alle Erinnerungen stoppen
        </Button>
      </div>
      {followUps.isPending ? (
        <Spinner className="p-5" />
      ) : followUps.isError ? (
        <ErrorState error={followUps.error} onRetry={() => void followUps.refetch()} />
      ) : followUps.data.length === 0 ? (
        <EmptyState compact icon={BellOff} title="Keine Erinnerungen geplant" description="Erinnerungen werden beim Versand per E-Mail geplant, wenn „Automatisch nachfassen“ aktiv ist." />
      ) : (
        <ul className="divide-y divide-neutral-100" data-testid="follow-ups">
          {[...followUps.data]
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
            .map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">{followUpKindLabel[f.kind]}</p>
                  <p className="text-[13px] text-neutral-500">
                    {f.status === 'Scheduled' ? `geplant für ${formatDateTime(f.dueAt)}` : f.processedAt ? `am ${formatDateTime(f.processedAt)}` : `fällig ${formatDateTime(f.dueAt)}`}
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
        title="Alle geplanten Erinnerungen stoppen?"
        description="Ihr Kunde erhält zu diesem Angebot keine automatischen Erinnerungen mehr. Das Angebot selbst bleibt unverändert."
        confirmLabel="Erinnerungen stoppen"
        variant="danger"
        onConfirm={async () => {
          await api.quotations.cancelFollowUps(companyId, id);
          await queryClient.invalidateQueries({ queryKey: qk.quotation(companyId, id) });
          toast.success('Erinnerungen gestoppt');
        }}
      />
    </div>
  );
}

function Revisions({ quotation }: { quotation: QuotationDto }) {
  if (quotation.revisions.length <= 1 && !quotation.previousRevisionId) {
    return <EmptyState compact icon={GitBranch} title="Keine Revisionen" description="Revisionen entstehen, wenn Sie ein versendetes Angebot überarbeiten." />;
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
              {r.id === quotation.id && <span className="text-[13px] text-neutral-500">(diese)</span>}
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
      toast.success('Angebot dupliziert', `${copy.number} wurde als Entwurf angelegt.`);
      void navigate(`/angebote/${copy.id}/bearbeiten`);
    },
    onError: (error) => toast.error('Duplizieren fehlgeschlagen', errorMessage(error)),
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
            Bearbeiten
          </ButtonLink>
          <Button variant="primary" icon={Send} onClick={() => setDialog('send')}>
            Senden
          </Button>
        </>
      );
    if (q.status === 'Sent')
      return (
        <>
          <Button icon={CircleX} onClick={() => setDialog('reject')} disabled={!canReject}>
            Ablehnung erfassen
          </Button>
          <Button variant="primary" icon={CircleCheck} onClick={() => setDialog('accept')} disabled={!canAccept}>
            Annahme erfassen
          </Button>
        </>
      );
    if (q.status === 'Accepted')
      return (
        <>
          <Button icon={ReceiptText} loading={createInvoice.isPending} onClick={() => createInvoice.mutate()}>
            Rechnung erstellen
          </Button>
          {q.jobId ? (
            <ButtonLink to={`/auftraege/${q.jobId}`} variant="primary" icon={Hammer}>
              Zum Auftrag
            </ButtonLink>
          ) : (
            <Button variant="primary" icon={Hammer} onClick={() => setDialog('job')}>
              In Auftrag umwandeln
            </Button>
          )}
        </>
      );
    if (canRevise)
      return (
        <Button variant="primary" icon={GitBranch} onClick={() => setDialog('revise')}>
          Revision erstellen
        </Button>
      );
    return null;
  })();

  return (
    <>
      <PageHeader
        title={q.number}
        documentTitle={`Angebot ${q.number}`}
        back={{ to: '/angebote', label: 'Angebote' }}
        meta={
          <div className="flex items-center gap-2">
            <QuotationStatusBadge status={q.status} size="md" />
            {q.revisionNumber > 1 && <span className="text-[13px] text-neutral-500">Revision {q.revisionNumber}</span>}
          </div>
        }
        description={
          <>
            {q.title} ·{' '}
            <Link to={`/kunden/${q.customerId}`} className="font-medium text-neutral-700 hover:text-brand-700 hover:underline">
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
                <IconButton icon={MoreHorizontal} label="Weitere Aktionen" variant="secondary" />
              </MenuTrigger>
              <MenuContent className="w-[260px]">
                <MenuItem icon={Eye} onSelect={() => void navigate(`/angebote/${q.id}/vorschau`)}>
                  Vorschau
                </MenuItem>
                {q.status === 'Sent' && (
                  <MenuItem icon={Send} onSelect={() => setDialog('send')} description="Erneut per E-Mail oder als übermittelt markieren">
                    Erneut senden
                  </MenuItem>
                )}
                {q.status === 'Expired' && (
                  <MenuItem icon={CircleCheck} onSelect={() => setDialog('accept')} description="Nachträgliche Zusage des Kunden">
                    Späte Annahme erfassen
                  </MenuItem>
                )}
                {canRevise && q.status !== 'Rejected' && q.status !== 'Expired' && (
                  <MenuItem icon={GitBranch} onSelect={() => setDialog('revise')}>
                    Revision erstellen
                  </MenuItem>
                )}
                <MenuItem icon={Copy} onSelect={() => duplicate.mutate()} disabled={duplicate.isPending}>
                  Duplizieren
                </MenuItem>
                <MenuItem icon={FileStack} onSelect={() => setDialog('template')}>
                  Als Vorlage speichern
                </MenuItem>
                {canLink && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Link2} onSelect={() => setDialog('link')} description={q.hasActivePublicLink ? 'Ersetzt den bisherigen Link' : undefined}>
                      {q.hasActivePublicLink ? 'Kundenlink neu erzeugen' : 'Kundenlink erzeugen'}
                    </MenuItem>
                    {q.hasActivePublicLink && (
                      <MenuItem icon={Link2Off} onSelect={() => setDialog('revoke')}>
                        Kundenlink widerrufen
                      </MenuItem>
                    )}
                  </>
                )}
                {(can('Cancelled') || q.status === 'Draft') && <MenuSeparator />}
                {can('Cancelled') && (
                  <MenuItem icon={Ban} danger onSelect={() => setDialog('cancel')}>
                    Stornieren …
                  </MenuItem>
                )}
                {q.status === 'Draft' && (
                  <MenuItem icon={Trash2} danger onSelect={() => setDialog('delete')}>
                    Entwurf löschen …
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </>
        }
      />

      {q.status === 'Accepted' && (
        <Alert tone="success" className="mb-6" title={`Angenommen am ${formatDateTime(q.decidedAt)}`}>
          {q.decidedByActor === 'Customer' ? `Online angenommen von ${q.decisionName ?? 'dem Kunden'}.` : 'Annahme manuell erfasst.'}
          {q.decisionNote && ` Notiz: „${q.decisionNote}“`}
        </Alert>
      )}
      {q.status === 'Rejected' && (
        <Alert tone="danger" className="mb-6" title={`Abgelehnt am ${formatDateTime(q.decidedAt)}`}>
          {q.decidedByActor === 'Customer' ? `Online abgelehnt${q.decisionName ? ` von ${q.decisionName}` : ''}.` : 'Ablehnung manuell erfasst.'}
          {q.decisionNote && ` Grund: „${q.decisionNote}“`}
        </Alert>
      )}
      {q.status === 'Cancelled' && (
        <Alert tone="neutral" className="mb-6" title={`Storniert am ${formatDateTime(q.cancelledAt)}`}>
          {q.cancellationReason ?? 'Kein Grund angegeben.'}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardBody className="grid gap-6 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <p className="text-xs font-medium text-neutral-500">Empfänger</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{q.recipientName}</p>
                {q.recipientContact && !q.recipientName.includes(q.recipientContact) && <p className="text-sm text-neutral-700">{q.recipientContact}</p>}
                {q.recipientAddress && <p className="text-sm whitespace-pre-line text-neutral-700">{q.recipientAddress}</p>}
                {q.recipientEmail && <p className="mt-1 text-[13px] text-neutral-500">{q.recipientEmail}</p>}
              </div>
              <DetailList
                className="sm:col-span-2"
                columns={2}
                items={[
                  { label: 'Angebotsdatum', value: formatDate(q.issueDate) },
                  { label: 'Gültig bis', value: formatDate(q.validUntil) },
                  { label: 'Netto', value: <span className="tabular">{formatEur(q.totals.netTotal)}</span> },
                  { label: q.taxMode === 'Standard' ? 'Brutto' : 'Gesamt', value: <span className="font-semibold tabular">{formatEur(q.totals.grossTotal)}</span> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Positionen" description={`${q.lineItems.length} ${q.lineItems.length === 1 ? 'Position' : 'Positionen'}`} />
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
              <TabsList label="Angebotsdetails" className="px-3">
                <TabsTrigger value="events">Verlauf</TabsTrigger>
                <TabsTrigger value="deliveries">E-Mail-Versand</TabsTrigger>
                <TabsTrigger value="followups">Erinnerungen</TabsTrigger>
                <TabsTrigger value="revisions" count={q.revisions.length > 1 ? q.revisions.length : undefined}>
                  Revisionen
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
                  { label: 'Erstellt', value: formatDateTime(q.createdAt) },
                  { label: 'Zuletzt geändert', value: formatDateTime(q.updatedAt) },
                  { label: 'Versendet', value: q.sentAt ? formatDateTime(q.sentAt) : null },
                  ...(q.decidedAt ? [{ label: 'Entschieden', value: formatDateTime(q.decidedAt) }] : []),
                  ...(q.expiredAt ? [{ label: 'Abgelaufen', value: formatDateTime(q.expiredAt) }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Kundenlink"
              actions={
                <HelpPopover label="Was ist der Kundenlink?">
                  Über den Kundenlink sieht Ihr Kunde das Angebot ohne Anmeldung, lädt das PDF und kann online annehmen oder ablehnen. Der Link wird
                  aus Sicherheitsgründen nur beim Erzeugen angezeigt.
                </HelpPopover>
              }
            />
            <CardBody className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                {q.hasActivePublicLink ? <Link2 aria-hidden size={16} className="text-success-text" /> : <Link2Off aria-hidden size={16} className="text-neutral-400" />}
                <span className="font-medium">{q.hasActivePublicLink ? 'Aktiv' : 'Kein aktiver Link'}</span>
              </p>
              <p className="text-neutral-600" data-testid="public-link-last-opened">
                Zuletzt geöffnet:{' '}
                {q.publicLinkLastOpenedAt ? (
                  <span title={formatDateTime(q.publicLinkLastOpenedAt)}>{formatRelative(q.publicLinkLastOpenedAt)}</span>
                ) : (
                  'noch nie'
                )}
              </p>
              {canLink && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" icon={Link2} onClick={() => setDialog('link')}>
                    {q.hasActivePublicLink ? 'Neu erzeugen' : 'Erzeugen'}
                  </Button>
                  {q.hasActivePublicLink && (
                    <Button size="sm" variant="dangerGhost" icon={Link2Off} onClick={() => setDialog('revoke')}>
                      Widerrufen
                    </Button>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {q.jobId && (
            <Card>
              <CardHeader title="Auftrag" />
              <CardBody>
                <Link to={`/auftraege/${q.jobId}`} className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                  <Hammer aria-hidden size={15} /> Zum Auftrag
                </Link>
              </CardBody>
            </Card>
          )}

          {(q.status === 'Accepted' || q.invoices.length > 0) && (
            <Card>
              <CardHeader title="Rechnungen" />
              <CardBody>
                <InvoiceLinkList invoices={q.invoices} empty="Noch keine Rechnung zu diesem Angebot." />
              </CardBody>
            </Card>
          )}

          {q.internalNotes && (
            <Card className="border-dashed bg-neutral-25">
              <CardHeader title="Interne Notizen" description="Nur intern sichtbar" />
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
        title="Kundenlink widerrufen?"
        description="Der Link funktioniert danach nicht mehr. Ihr Kunde sieht einen Hinweis, dass das Angebot nicht mehr verfügbar ist. Sie können jederzeit einen neuen Link erzeugen."
        confirmLabel="Widerrufen"
        variant="danger"
        onConfirm={async () => {
          await api.quotations.revokePublicLink(companyId, q.id);
          await queryClient.invalidateQueries({ queryKey: qk.quotation(companyId, q.id) });
          toast.success('Kundenlink widerrufen');
        }}
      />
      <ConfirmDialog
        open={dialog === 'revise'}
        onOpenChange={(o) => setDialog(o ? 'revise' : null)}
        title="Revision erstellen?"
        description={`Es wird ein neuer Entwurf als Revision ${q.revisionNumber + 1} angelegt. ${q.number} bleibt unverändert im Verlauf erhalten.`}
        confirmLabel="Revision erstellen"
        onConfirm={async () => {
          const revision = await api.quotations.revise(companyId, q.id);
          void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
          toast.success('Revision erstellt', revision.number);
          void navigate(`/angebote/${revision.id}/bearbeiten`);
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        title={`Entwurf ${q.number} löschen?`}
        description="Der Entwurf wird endgültig gelöscht. Die Angebotsnummer wird nicht erneut vergeben."
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={async () => {
          await api.quotations.delete(companyId, q.id);
          queryClient.removeQueries({ queryKey: qk.quotation(companyId, q.id) });
          void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
          toast.success('Entwurf gelöscht');
          void navigate('/angebote', { replace: true });
        }}
      />
    </>
  );
}
