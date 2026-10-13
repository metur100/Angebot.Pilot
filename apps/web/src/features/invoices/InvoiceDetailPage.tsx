import { invoiceEventLabel, type InvoiceDto, type InvoiceEventType, type InvoicePaymentDto } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  Ban,
  BellRing,
  CircleCheck,
  CircleDollarSign,
  Copy,
  Eye,
  FileCheck2,
  FileCode2,
  FileMinus,
  FilePen,
  FileText,
  Hammer,
  Mail,
  MailX,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useCompany } from '@/app/company';
import { DeliveryTable, EventTimeline } from '@/components/domain/History';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DetailList } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Menu';
import { PageHeader, table } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { DocumentLineItems } from '@/features/quotations/QuotationDocument';
import { TotalsList } from '@/features/quotations/Totals';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { downloadDocument } from '@/lib/download';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatEur } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { CancelInvoiceDialog, IssueDialog, IssueProblemList, PaymentDialog, ReminderDialog, SendInvoiceDialog } from './InvoiceDialogs';
import { daysText, invoiceAmount, invoiceName, invoiceTitle, invoiceXmlFileName, servicePeriodText, sinceDaysText, useInvalidateInvoice } from './shared';

const eventIcons: Partial<Record<InvoiceEventType, LucideIcon>> = {
  Created: FilePen,
  Updated: Pencil,
  Issued: FileCheck2,
  Sent: Send,
  MarkedAsSent: Send,
  PaymentRecorded: CircleDollarSign,
  PaymentRemoved: Trash2,
  Paid: CircleCheck,
  Cancelled: Ban,
  CancellationCreated: FileMinus,
  ReminderQueued: BellRing,
  EmailHandedOff: Mail,
  EmailFailed: MailX,
  Duplicated: Copy,
};

const eventTone: Partial<Record<InvoiceEventType, string>> = {
  Issued: 'bg-info-bg text-info-text',
  Paid: 'bg-success-bg text-success-text',
  PaymentRecorded: 'bg-success-bg text-success-text',
  EmailFailed: 'bg-danger-bg text-danger-text',
  Cancelled: 'bg-muted-bg text-muted-text',
};

type DialogKind = 'issue' | 'send' | 'payment' | 'remind' | 'cancel' | 'delete';

function Payments({ invoice, onRecord }: { invoice: InvoiceDto; onRecord: () => void }) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateInvoice();
  const [removing, setRemoving] = useState<InvoicePaymentDto | null>(null);
  const can = (action: InvoiceDto['allowedActions'][number]) => invoice.allowedActions.includes(action);
  return (
    <Card>
      <CardHeader
        title="Zahlungen"
        description={invoice.status === 'Paid' && invoice.paidOn ? `Vollständig bezahlt am ${formatDate(invoice.paidOn)}` : undefined}
        actions={
          can('recordPayment') && (
            <Button size="sm" icon={Plus} onClick={onRecord}>
              Zahlung
            </Button>
          )
        }
      />
      {invoice.payments.length === 0 ? (
        <EmptyState
          compact
          icon={Wallet}
          title="Noch keine Zahlungen erfasst"
          description="Erfassen Sie Zahlungseingänge, sobald das Geld auf Ihrem Konto ist – auch Teilzahlungen."
        />
      ) : (
        <div className={table.wrapper}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Datum</th>
                <th scope="col" className={cx(table.th, 'text-right')}>Betrag</th>
                <th scope="col" className={cx(table.th, 'hidden sm:table-cell')}>Zahlungsart & Notiz</th>
                <th scope="col" className={cx(table.th, 'hidden sm:table-cell')}>Erfasst von</th>
                {can('removePayment') && (
                  <th scope="col" className={table.th}>
                    <span className="sr-only">Aktionen</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id} className={table.row}>
                  <td className={cx(table.td, 'tabular')}>
                    <span className="whitespace-nowrap">{formatDate(p.paidOn)}</span>
                    {/* On phones the method and note move under the date so the table fits the card. */}
                    {(p.method ?? p.note) && (
                      <span className="block text-[13px] text-neutral-500 sm:hidden">{[p.method, p.note].filter(Boolean).join(' · ')}</span>
                    )}
                  </td>
                  <td className={cx(table.td, table.num, 'font-medium')}>{formatEur(p.amount)}</td>
                  <td className={cx(table.td, 'hidden max-w-[260px] sm:table-cell')}>
                    <p className="truncate">{p.method ?? '–'}</p>
                    {p.note && <p className="text-[13px] break-words text-neutral-500">{p.note}</p>}
                  </td>
                  <td className={cx(table.td, 'hidden text-[13px] text-neutral-600 sm:table-cell')}>
                    {p.createdByName ?? '–'}
                    <span className="block text-xs text-neutral-500">{formatDateTime(p.createdAt)}</span>
                  </td>
                  {can('removePayment') && (
                    <td className={cx(table.td, 'w-12 text-right')}>
                      <IconButton
                        size="sm"
                        icon={Trash2}
                        label={`Zahlung vom ${formatDate(p.paidOn)} über ${formatEur(p.amount)} entfernen`}
                        onClick={() => setRemoving(p)}
                        className="hover:bg-danger-bg! hover:text-danger-text!"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="grid grid-cols-3 gap-4 border-t border-neutral-100 px-5 py-3 text-sm">
        <div>
          <dt className="text-xs text-neutral-500">Rechnungsbetrag</dt>
          <dd className="font-medium tabular">{formatEur(invoice.totals.grossTotal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Bezahlt</dt>
          <dd className="font-medium text-success-text tabular" data-testid="paid-amount">
            {formatEur(invoice.paidAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Offen</dt>
          <dd className={cx('font-semibold tabular', invoice.isOverdue ? 'text-danger-text' : 'text-neutral-900')} data-testid="open-amount">
            {formatEur(invoice.openAmount)}
          </dd>
        </div>
      </dl>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Zahlung entfernen?"
        description={removing ? `Die Zahlung vom ${formatDate(removing.paidOn)} über ${formatEur(removing.amount)} wird entfernt. Der offene Betrag erhöht sich entsprechend.` : undefined}
        confirmLabel="Zahlung entfernen"
        variant="danger"
        onConfirm={async () => {
          if (!removing) return;
          const updated = await api.invoices.removePayment(companyId, invoice.id, removing.id);
          invalidate(updated);
          toast.success('Zahlung entfernt', `${formatEur(removing.amount)} vom ${formatDate(removing.paidOn)}`);
        }}
      />
    </Card>
  );
}

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invalidate = useInvalidateInvoice();
  const invoice = useQuery({ queryKey: qk.invoice(companyId, id), queryFn: () => api.invoices.get(companyId, id) });
  const events = useQuery({ queryKey: qk.invoiceEvents(companyId, id), queryFn: () => api.invoices.events(companyId, id) });
  const deliveries = useQuery({ queryKey: qk.invoiceDeliveries(companyId, id), queryFn: () => api.invoices.deliveries(companyId, id) });
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [downloadingXml, setDownloadingXml] = useState(false);

  // ?stellen=1 (from the editor's "Speichern & Rechnung stellen") opens the issue dialog.
  const issueRequested = params.get('stellen') === '1';
  const closeIssue = () => {
    setDialog(null);
    if (issueRequested)
      setParams(
        (p) => {
          p.delete('stellen');
          return p;
        },
        { replace: true },
      );
  };

  const duplicate = useMutation({
    mutationFn: () => api.invoices.duplicate(companyId, id),
    onSuccess: (copy) => {
      invalidate(copy);
      toast.success('Rechnung kopiert', 'Die Kopie wurde als neuer Entwurf angelegt.');
      void navigate(`/rechnungen/${copy.id}/bearbeiten`);
    },
    onError: (error) => toast.error('Kopieren fehlgeschlagen', errorMessage(error)),
  });

  if (invoice.isPending) return <PageSkeleton rows={10} />;
  if (invoice.isError) {
    return (
      <>
        <PageHeader title="Rechnung" back={{ to: '/rechnungen', label: 'Rechnungen' }} />
        <ErrorState error={invoice.error} onRetry={() => void invoice.refetch()} title="Rechnung konnte nicht geladen werden" />
      </>
    );
  }
  const i = invoice.data;
  const can = (action: InvoiceDto['allowedActions'][number]) => i.allowedActions.includes(action);
  const draft = i.status === 'Draft';
  const cancellation = i.kind === 'Cancellation';
  const negate = cancellation;
  const service = servicePeriodText(i.serviceDateFrom, i.serviceDateTo);

  const downloadXml = async () => {
    setDownloadingXml(true);
    try {
      await downloadDocument(() => api.invoices.xml(companyId, i.id), invoiceXmlFileName(i), 'application/xml');
      toast.success('E-Rechnung heruntergeladen', invoiceXmlFileName(i));
    } catch (error) {
      toast.error('Download fehlgeschlagen', errorMessage(error));
    } finally {
      setDownloadingXml(false);
    }
  };

  const menuItems = [
    !draft && i.hasEInvoice && (
      <MenuItem key="xml" icon={FileCode2} onSelect={() => void downloadXml()} disabled={downloadingXml} description="UN/CEFACT CII nach EN 16931">
        E-Rechnung (XML) herunterladen
      </MenuItem>
    ),
    !draft && can('remind') && (
      <MenuItem key="remind" icon={BellRing} onSelect={() => setDialog('remind')}>
        Zahlungserinnerung senden …
      </MenuItem>
    ),
    !draft && can('send') && i.sentAt && (
      <MenuItem key="resend" icon={Send} onSelect={() => setDialog('send')} description="Erneut per E-Mail oder als übermittelt markieren">
        Erneut senden …
      </MenuItem>
    ),
    can('duplicate') && (
      <MenuItem key="copy" icon={Copy} onSelect={() => duplicate.mutate()} disabled={duplicate.isPending} description="Als neuen Entwurf">
        Kopieren
      </MenuItem>
    ),
  ].filter(Boolean);
  const dangerItems = [
    can('cancel') && (
      <MenuItem key="cancel" icon={Ban} danger onSelect={() => setDialog('cancel')}>
        Stornieren …
      </MenuItem>
    ),
    draft && can('delete') && (
      <MenuItem key="delete" icon={Trash2} danger onSelect={() => setDialog('delete')}>
        Entwurf löschen …
      </MenuItem>
    ),
  ].filter(Boolean);

  const actions = draft ? (
    <>
      {can('edit') && (
        <ButtonLink to={`/rechnungen/${i.id}/bearbeiten`} icon={Pencil}>
          Bearbeiten
        </ButtonLink>
      )}
      <ButtonLink to={`/rechnungen/${i.id}/pdf`} icon={Eye}>
        PDF-Vorschau
      </ButtonLink>
      {can('issue') && (
        <Button variant="primary" icon={FileCheck2} onClick={() => setDialog('issue')}>
          Rechnung stellen
        </Button>
      )}
    </>
  ) : (
    <>
      <ButtonLink to={`/rechnungen/${i.id}/pdf`} icon={FileText}>
        PDF
      </ButtonLink>
      {can('send') && !i.sentAt && (
        <Button variant="primary" icon={Send} onClick={() => setDialog('send')}>
          Senden …
        </Button>
      )}
      {can('recordPayment') && (
        <Button variant={i.sentAt ? 'primary' : 'secondary'} icon={CircleDollarSign} onClick={() => setDialog('payment')}>
          Zahlung erfassen …
        </Button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={invoiceTitle(i)}
        documentTitle={invoiceName(i)}
        back={{ to: '/rechnungen', label: 'Rechnungen' }}
        meta={<InvoiceStatusBadge status={i.status} kind={i.kind} isOverdue={i.isOverdue} size="md" />}
        description={
          <>
            {i.title} ·{' '}
            <Link to={`/kunden/${i.customerId}`} className="font-medium text-neutral-700 hover:text-brand-700 hover:underline">
              {i.customerName}
            </Link>
          </>
        }
        actions={
          <>
            {actions}
            {(menuItems.length > 0 || dangerItems.length > 0) && (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label="Weitere Aktionen" variant="secondary" />
                </MenuTrigger>
                <MenuContent className="w-[280px]">
                  {menuItems}
                  {menuItems.length > 0 && dangerItems.length > 0 && <MenuSeparator />}
                  {dangerItems}
                </MenuContent>
              </Menu>
            )}
          </>
        }
      />

      <div className="mb-6 space-y-3 empty:hidden">
        {draft && i.issueProblems.length > 0 && (
          <Alert tone="warning" title="Vor dem Stellen noch zu erledigen">
            <IssueProblemList invoice={i} problems={i.issueProblems} />
          </Alert>
        )}
        {draft && i.issueProblems.length === 0 && (
          <Alert tone="info" title="Entwurf – noch keine Rechnungsnummer">
            Alle Pflichtangaben sind vorhanden. {can('issue') ? 'Stellen Sie die Rechnung, um die Rechnungsnummer zu vergeben und sie zu versenden.' : 'Eine Inhaberin bzw. ein Administrator kann die Rechnung jetzt stellen.'}
          </Alert>
        )}
        {i.isOverdue && (
          <Alert
            tone="danger"
            icon={AlarmClock}
            title={`Seit ${sinceDaysText(i.daysOverdue)} überfällig – offen: ${formatEur(i.openAmount)}`}
            actions={
              can('remind') && (
                <Button size="sm" icon={BellRing} onClick={() => setDialog('remind')}>
                  Zahlungserinnerung senden …
                </Button>
              )
            }
          >
            Fällig war der {formatDate(i.dueDate)}.
            {i.reminderCount > 0 && ` Bisher ${i.reminderCount === 1 ? 'eine Zahlungserinnerung' : `${i.reminderCount} Zahlungserinnerungen`}, zuletzt am ${formatDateTime(i.lastReminderAt)}.`}
          </Alert>
        )}
        {i.status === 'Paid' && (
          <Alert tone="success" title={`Bezahlt am ${formatDate(i.paidOn)}`}>
            Der Rechnungsbetrag von {formatEur(i.totals.grossTotal)} ist vollständig eingegangen.
          </Alert>
        )}
        {i.status === 'Cancelled' && (
          <Alert tone="neutral" title={`Storniert am ${formatDateTime(i.cancelledAt)}`}>
            {i.cancellationInvoiceId ? (
              <>
                Aufgehoben durch die Stornorechnung{' '}
                <Link to={`/rechnungen/${i.cancellationInvoiceId}`}>{i.cancellationInvoiceNumber ?? 'Stornorechnung'}</Link>.
              </>
            ) : (
              'Diese Rechnung wurde storniert.'
            )}
            {i.cancellationReason && ` Grund: „${i.cancellationReason}“`}
          </Alert>
        )}
        {cancellation && (
          <Alert tone="info" title="Stornorechnung">
            Hebt die Rechnung{' '}
            {i.cancelledInvoiceId ? <Link to={`/rechnungen/${i.cancelledInvoiceId}`}>{i.cancelledInvoiceNumber ?? 'Originalrechnung'}</Link> : i.cancelledInvoiceNumber}{' '}
            in voller Höhe auf. Beträge werden negativ dargestellt.
          </Alert>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardBody className="grid gap-6 sm:grid-cols-3">
              <div className="min-w-0 sm:col-span-1">
                <p className="text-xs font-medium text-neutral-500">Empfänger</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{i.recipientName}</p>
                {i.recipientContact && !i.recipientName.includes(i.recipientContact) && <p className="text-sm text-neutral-700">{i.recipientContact}</p>}
                {i.recipientAddress ? (
                  <p className="text-sm whitespace-pre-line text-neutral-700">{i.recipientAddress}</p>
                ) : (
                  <p className="text-sm text-warning-text">Keine Rechnungsanschrift hinterlegt</p>
                )}
                {i.recipientEmail && <p className="mt-1 text-[13px] break-words text-neutral-500">{i.recipientEmail}</p>}
              </div>
              <DetailList
                className="sm:col-span-2"
                columns={2}
                items={[
                  { label: 'Rechnungsdatum', value: formatDate(i.issueDate) },
                  { label: i.serviceDateTo ? 'Leistungszeitraum' : 'Leistungsdatum', value: service ?? <span className="text-warning-text">fehlt</span> },
                  ...(!cancellation
                    ? [
                        {
                          label: 'Fällig am',
                          value: (
                            <span className={cx(i.isOverdue && 'font-medium text-danger-text')}>
                              {formatDate(i.dueDate)}
                              {i.isOverdue && ` · ${daysText(i.daysOverdue)} überfällig`}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  { label: 'Ihre Referenz', value: i.buyerReference },
                  ...(i.recipientVatId || i.taxMode === 'ReverseCharge' ? [{ label: 'USt-IdNr. Kunde', value: i.recipientVatId }] : []),
                  { label: i.taxMode === 'Standard' ? 'Brutto' : 'Gesamt', value: <span className="font-semibold tabular">{invoiceAmount(i.totals.grossTotal, i.kind)}</span> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Positionen" description={`${i.lineItems.length} ${i.lineItems.length === 1 ? 'Position' : 'Positionen'}`} />
            <CardBody>
              {i.introText && <p className="mb-4 text-sm whitespace-pre-line text-neutral-700">{i.introText}</p>}
              {i.lineItems.length === 0 ? (
                <p className="text-sm text-neutral-500">Noch keine Positionen.</p>
              ) : (
                <DocumentLineItems
                  taxMode={i.taxMode}
                  brandColor="var(--ap-neutral-200)"
                  negate={negate}
                  lines={[...i.lineItems].sort((a, b) => a.position - b.position)}
                />
              )}
              <div className="mt-4 flex justify-end">
                <TotalsList totals={i.totals} taxMode={i.taxMode} negate={negate} className="w-full sm:w-[340px]" />
              </div>
              {i.closingText && <p className="mt-6 text-sm whitespace-pre-line text-neutral-700">{i.closingText}</p>}
              {i.paymentTerms && (
                <div className="mt-4 text-[13px] text-neutral-600">
                  <p className="font-medium text-neutral-800">Zahlungshinweis</p>
                  <p className="whitespace-pre-line">{i.paymentTerms}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {!draft && !cancellation && <Payments invoice={i} onRecord={() => setDialog('payment')} />}

          <Card>
            <Tabs defaultValue="events">
              <TabsList label="Rechnungsdetails" className="px-3">
                <TabsTrigger value="events">Verlauf</TabsTrigger>
                <TabsTrigger value="deliveries" count={deliveries.data && deliveries.data.length > 0 ? deliveries.data.length : undefined}>
                  E-Mail-Versand
                </TabsTrigger>
              </TabsList>
              <TabsContent value="events">
                <EventTimeline query={events} labels={invoiceEventLabel} icons={eventIcons} tones={eventTone} />
              </TabsContent>
              <TabsContent value="deliveries">
                <DeliveryTable query={deliveries} emptyDescription="Hier erscheinen Rechnungs-E-Mails und Zahlungserinnerungen mit ihrem Versandstatus." />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Status" as="h2" />
            <CardBody>
              <DetailList
                items={[
                  { label: 'Erstellt', value: formatDateTime(i.createdAt) },
                  { label: 'Gestellt', value: i.issuedAt ? formatDateTime(i.issuedAt) : null },
                  { label: 'Versendet', value: i.sentAt ? formatDateTime(i.sentAt) : null },
                  ...(!cancellation ? [{ label: 'Bezahlt am', value: i.paidOn ? formatDate(i.paidOn) : null }] : []),
                  ...(!cancellation && !draft
                    ? [{ label: 'Erinnerungen', value: i.reminderCount > 0 ? `${i.reminderCount} · zuletzt ${formatDateTime(i.lastReminderAt)}` : 'keine' }]
                    : []),
                  ...(i.cancelledAt ? [{ label: 'Storniert', value: formatDateTime(i.cancelledAt) }] : []),
                  { label: 'Zuletzt geändert', value: formatDateTime(i.updatedAt) },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Kunde & Quelle" as="h2" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: 'Kunde',
                    value: (
                      <Link to={`/kunden/${i.customerId}`} className="font-medium text-brand-700 hover:underline">
                        {i.customerName}
                      </Link>
                    ),
                  },
                  ...(i.quotationId
                    ? [
                        {
                          label: 'Angebot',
                          value: (
                            <Link to={`/angebote/${i.quotationId}`} className="font-medium text-brand-700 hover:underline">
                              {i.quotationNumber ?? 'Angebot öffnen'}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  ...(i.jobId
                    ? [
                        {
                          label: 'Auftrag',
                          value: (
                            <Link to={`/auftraege/${i.jobId}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                              <Hammer aria-hidden size={14} />
                              {i.jobNumber ?? 'Auftrag öffnen'}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  ...(!i.quotationId && !i.jobId && !cancellation ? [{ label: 'Quelle', value: 'Manuell erstellt' }] : []),
                ]}
              />
            </CardBody>
          </Card>

          {!draft && i.hasEInvoice && (
            <Card>
              <CardHeader title="E-Rechnung" as="h2" />
              <CardBody className="space-y-3 text-sm text-neutral-600">
                <p className="flex gap-2">
                  <ReceiptText aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />
                  Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931). Für Behörden oder Portale können Sie die XML-Datei auch einzeln laden.
                </p>
                <Button size="sm" icon={FileCode2} loading={downloadingXml} onClick={() => void downloadXml()}>
                  XML herunterladen
                </Button>
              </CardBody>
            </Card>
          )}

          {i.internalNotes && (
            <Card className="border-dashed bg-neutral-25">
              <CardHeader title="Interne Notizen" description="Nur intern sichtbar" />
              <CardBody>
                <p className="text-sm whitespace-pre-line text-neutral-700">{i.internalNotes}</p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {draft && (
        <IssueDialog
          invoice={i}
          open={dialog === 'issue' || (issueRequested && can('issue'))}
          onOpenChange={(o) => (o ? setDialog('issue') : closeIssue())}
        />
      )}
      {dialog === 'send' && <SendInvoiceDialog invoice={i} open onOpenChange={(o) => setDialog(o ? 'send' : null)} />}
      {dialog === 'payment' && <PaymentDialog invoice={i} open onOpenChange={(o) => setDialog(o ? 'payment' : null)} />}
      {dialog === 'remind' && <ReminderDialog invoice={i} open onOpenChange={(o) => setDialog(o ? 'remind' : null)} />}
      {dialog === 'cancel' && <CancelInvoiceDialog invoice={i} open onOpenChange={(o) => setDialog(o ? 'cancel' : null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        title="Rechnungsentwurf löschen?"
        description="Der Entwurf wird endgültig gelöscht. Da Entwürfe noch keine Rechnungsnummer haben, entsteht keine Lücke im Nummernkreis."
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={async () => {
          await api.invoices.delete(companyId, i.id);
          queryClient.removeQueries({ queryKey: qk.invoice(companyId, i.id) });
          invalidate({ id: i.id, customerId: i.customerId, jobId: i.jobId, quotationId: i.quotationId });
          toast.success('Entwurf gelöscht');
          void navigate('/rechnungen', { replace: true });
        }}
      />
    </>
  );
}
