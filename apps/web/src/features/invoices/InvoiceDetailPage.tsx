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
import { tr } from '@/lib/i18n';
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
        title={tr('Zahlungen', 'Payments')}
        description={
          invoice.status === 'Paid' && invoice.paidOn
            ? tr(`Vollständig bezahlt am ${formatDate(invoice.paidOn)}`, `Paid in full on ${formatDate(invoice.paidOn)}`)
            : undefined
        }
        actions={
          can('recordPayment') && (
            <Button size="sm" icon={Plus} onClick={onRecord}>
              {tr('Zahlung', 'Payment')}
            </Button>
          )
        }
      />
      {invoice.payments.length === 0 ? (
        <EmptyState
          compact
          icon={Wallet}
          title={tr('Noch keine Zahlungen erfasst', 'No payments recorded yet')}
          description={tr(
            'Erfassen Sie Zahlungseingänge, sobald das Geld auf Ihrem Konto ist – auch Teilzahlungen.',
            'Record incoming payments as soon as the money is in your account – partial payments too.',
          )}
        />
      ) : (
        <div className={table.wrapper}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>{tr('Datum', 'Date')}</th>
                <th scope="col" className={cx(table.th, 'text-right')}>{tr('Betrag', 'Amount')}</th>
                <th scope="col" className={cx(table.th, 'hidden sm:table-cell')}>{tr('Zahlungsart & Notiz', 'Payment method & note')}</th>
                <th scope="col" className={cx(table.th, 'hidden sm:table-cell')}>{tr('Erfasst von', 'Recorded by')}</th>
                {can('removePayment') && (
                  <th scope="col" className={table.th}>
                    <span className="sr-only">{tr('Aktionen', 'Actions')}</span>
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
                        label={tr(
                          `Zahlung vom ${formatDate(p.paidOn)} über ${formatEur(p.amount)} entfernen`,
                          `Remove payment of ${formatEur(p.amount)} from ${formatDate(p.paidOn)}`,
                        )}
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
          <dt className="text-xs text-neutral-500">{tr('Rechnungsbetrag', 'Invoice amount')}</dt>
          <dd className="font-medium tabular">{formatEur(invoice.totals.grossTotal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{tr('Bezahlt', 'Paid')}</dt>
          <dd className="font-medium text-success-text tabular" data-testid="paid-amount">
            {formatEur(invoice.paidAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{tr('Offen', 'Open')}</dt>
          <dd className={cx('font-semibold tabular', invoice.isOverdue ? 'text-danger-text' : 'text-neutral-900')} data-testid="open-amount">
            {formatEur(invoice.openAmount)}
          </dd>
        </div>
      </dl>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={tr('Zahlung entfernen?', 'Remove payment?')}
        description={
          removing
            ? tr(
                `Die Zahlung vom ${formatDate(removing.paidOn)} über ${formatEur(removing.amount)} wird entfernt. Der offene Betrag erhöht sich entsprechend.`,
                `The payment of ${formatEur(removing.amount)} from ${formatDate(removing.paidOn)} will be removed. The open amount increases accordingly.`,
              )
            : undefined
        }
        confirmLabel={tr('Zahlung entfernen', 'Remove payment')}
        variant="danger"
        onConfirm={async () => {
          if (!removing) return;
          const updated = await api.invoices.removePayment(companyId, invoice.id, removing.id);
          invalidate(updated);
          toast.success(
            tr('Zahlung entfernt', 'Payment removed'),
            tr(`${formatEur(removing.amount)} vom ${formatDate(removing.paidOn)}`, `${formatEur(removing.amount)} from ${formatDate(removing.paidOn)}`),
          );
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
      toast.success(tr('Rechnung kopiert', 'Invoice copied'), tr('Die Kopie wurde als neuer Entwurf angelegt.', 'The copy was created as a new draft.'));
      void navigate(`/rechnungen/${copy.id}/bearbeiten`);
    },
    onError: (error) => toast.error(tr('Kopieren fehlgeschlagen', 'Copy failed'), errorMessage(error)),
  });

  if (invoice.isPending) return <PageSkeleton rows={10} />;
  if (invoice.isError) {
    return (
      <>
        <PageHeader title={tr('Rechnung', 'Invoice')} back={{ to: '/rechnungen', label: tr('Rechnungen', 'Invoices') }} />
        <ErrorState
          error={invoice.error}
          onRetry={() => void invoice.refetch()}
          title={tr('Rechnung konnte nicht geladen werden', 'Invoice could not be loaded')}
        />
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
      toast.success(tr('E-Rechnung heruntergeladen', 'E-invoice downloaded'), invoiceXmlFileName(i));
    } catch (error) {
      toast.error(tr('Download fehlgeschlagen', 'Download failed'), errorMessage(error));
    } finally {
      setDownloadingXml(false);
    }
  };

  const menuItems = [
    !draft && i.hasEInvoice && (
      <MenuItem
        key="xml"
        icon={FileCode2}
        onSelect={() => void downloadXml()}
        disabled={downloadingXml}
        description={tr('UN/CEFACT CII nach EN 16931', 'UN/CEFACT CII according to EN 16931')}
      >
        {tr('E-Rechnung (XML) herunterladen', 'Download e-invoice (XML)')}
      </MenuItem>
    ),
    !draft && can('remind') && (
      <MenuItem key="remind" icon={BellRing} onSelect={() => setDialog('remind')}>
        {tr('Zahlungserinnerung senden …', 'Send payment reminder …')}
      </MenuItem>
    ),
    !draft && can('send') && i.sentAt && (
      <MenuItem
        key="resend"
        icon={Send}
        onSelect={() => setDialog('send')}
        description={tr('Erneut per E-Mail oder als übermittelt markieren', 'Email again or mark as delivered')}
      >
        {tr('Erneut senden …', 'Send again …')}
      </MenuItem>
    ),
    can('duplicate') && (
      <MenuItem key="copy" icon={Copy} onSelect={() => duplicate.mutate()} disabled={duplicate.isPending} description={tr('Als neuen Entwurf', 'As a new draft')}>
        {tr('Kopieren', 'Copy')}
      </MenuItem>
    ),
  ].filter(Boolean);
  const dangerItems = [
    can('cancel') && (
      <MenuItem key="cancel" icon={Ban} danger onSelect={() => setDialog('cancel')}>
        {tr('Stornieren …', 'Cancel invoice …')}
      </MenuItem>
    ),
    draft && can('delete') && (
      <MenuItem key="delete" icon={Trash2} danger onSelect={() => setDialog('delete')}>
        {tr('Entwurf löschen …', 'Delete draft …')}
      </MenuItem>
    ),
  ].filter(Boolean);

  const actions = draft ? (
    <>
      {can('edit') && (
        <ButtonLink to={`/rechnungen/${i.id}/bearbeiten`} icon={Pencil}>
          {tr('Bearbeiten', 'Edit')}
        </ButtonLink>
      )}
      <ButtonLink to={`/rechnungen/${i.id}/pdf`} icon={Eye}>
        {tr('PDF-Vorschau', 'PDF preview')}
      </ButtonLink>
      {can('issue') && (
        <Button variant="primary" icon={FileCheck2} onClick={() => setDialog('issue')}>
          {tr('Rechnung stellen', 'Issue invoice')}
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
          {tr('Senden …', 'Send …')}
        </Button>
      )}
      {can('recordPayment') && (
        <Button variant={i.sentAt ? 'primary' : 'secondary'} icon={CircleDollarSign} onClick={() => setDialog('payment')}>
          {tr('Zahlung erfassen …', 'Record payment …')}
        </Button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={invoiceTitle(i)}
        documentTitle={invoiceName(i)}
        back={{ to: '/rechnungen', label: tr('Rechnungen', 'Invoices') }}
        meta={<InvoiceStatusBadge status={i.status} kind={i.kind} isOverdue={i.isOverdue} size="md" />}
        description={
          <>
            {i.title} ·{' '}
            <Link to={`/kunden/${i.customerId}`} className="font-medium text-neutral-700 hover:text-brand-700 dark:hover:text-brand-800 hover:underline">
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
                  <IconButton icon={MoreHorizontal} label={tr('Weitere Aktionen', 'More actions')} variant="secondary" />
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
          <Alert tone="warning" title={tr('Vor dem Stellen noch zu erledigen', 'To do before issuing')}>
            <IssueProblemList invoice={i} problems={i.issueProblems} />
          </Alert>
        )}
        {draft && i.issueProblems.length === 0 && (
          <Alert tone="info" title={tr('Entwurf – noch keine Rechnungsnummer', 'Draft – no invoice number yet')}>
            {tr('Alle Pflichtangaben sind vorhanden.', 'All mandatory details are present.')}{' '}
            {can('issue')
              ? tr(
                  'Stellen Sie die Rechnung, um die Rechnungsnummer zu vergeben und sie zu versenden.',
                  'Issue the invoice to assign the invoice number and send it.',
                )
              : tr('Eine Inhaberin bzw. ein Administrator kann die Rechnung jetzt stellen.', 'An owner or administrator can issue the invoice now.')}
          </Alert>
        )}
        {i.isOverdue && (
          <Alert
            tone="danger"
            icon={AlarmClock}
            title={tr(
              `Seit ${sinceDaysText(i.daysOverdue)} überfällig – offen: ${formatEur(i.openAmount)}`,
              `Overdue for ${sinceDaysText(i.daysOverdue)} – open: ${formatEur(i.openAmount)}`,
            )}
            actions={
              can('remind') && (
                <Button size="sm" icon={BellRing} onClick={() => setDialog('remind')}>
                  {tr('Zahlungserinnerung senden …', 'Send payment reminder …')}
                </Button>
              )
            }
          >
            {tr(`Fällig war der ${formatDate(i.dueDate)}.`, `It was due on ${formatDate(i.dueDate)}.`)}
            {i.reminderCount > 0 &&
              tr(
                ` Bisher ${i.reminderCount === 1 ? 'eine Zahlungserinnerung' : `${i.reminderCount} Zahlungserinnerungen`}, zuletzt am ${formatDateTime(i.lastReminderAt)}.`,
                ` ${i.reminderCount === 1 ? 'One payment reminder' : `${i.reminderCount} payment reminders`} so far, most recently on ${formatDateTime(i.lastReminderAt)}.`,
              )}
          </Alert>
        )}
        {i.status === 'Paid' && (
          <Alert tone="success" title={tr(`Bezahlt am ${formatDate(i.paidOn)}`, `Paid on ${formatDate(i.paidOn)}`)}>
            {tr(
              `Der Rechnungsbetrag von ${formatEur(i.totals.grossTotal)} ist vollständig eingegangen.`,
              `The invoice amount of ${formatEur(i.totals.grossTotal)} has been received in full.`,
            )}
          </Alert>
        )}
        {i.status === 'Cancelled' && (
          <Alert tone="neutral" title={tr(`Storniert am ${formatDateTime(i.cancelledAt)}`, `Cancelled on ${formatDateTime(i.cancelledAt)}`)}>
            {i.cancellationInvoiceId ? (
              <>
                {tr('Aufgehoben durch die Stornorechnung', 'Reversed by cancellation invoice')}{' '}
                <Link to={`/rechnungen/${i.cancellationInvoiceId}`}>{i.cancellationInvoiceNumber ?? tr('Stornorechnung', 'Cancellation invoice')}</Link>.
              </>
            ) : (
              tr('Diese Rechnung wurde storniert.', 'This invoice has been cancelled.')
            )}
            {i.cancellationReason && tr(` Grund: „${i.cancellationReason}“`, ` Reason: “${i.cancellationReason}”`)}
          </Alert>
        )}
        {cancellation && (
          <Alert tone="info" title={tr('Stornorechnung', 'Cancellation invoice')}>
            {tr('Hebt die Rechnung', 'Reverses invoice')}{' '}
            {i.cancelledInvoiceId ? (
              <Link to={`/rechnungen/${i.cancelledInvoiceId}`}>{i.cancelledInvoiceNumber ?? tr('Originalrechnung', 'Original invoice')}</Link>
            ) : (
              i.cancelledInvoiceNumber
            )}{' '}
            {tr('in voller Höhe auf. Beträge werden negativ dargestellt.', 'in full. Amounts are shown as negative.')}
          </Alert>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardBody className="grid gap-6 sm:grid-cols-3">
              <div className="min-w-0 sm:col-span-1">
                <p className="text-xs font-medium text-neutral-500">{tr('Empfänger', 'Recipient')}</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{i.recipientName}</p>
                {i.recipientContact && !i.recipientName.includes(i.recipientContact) && <p className="text-sm text-neutral-700">{i.recipientContact}</p>}
                {i.recipientAddress ? (
                  <p className="text-sm whitespace-pre-line text-neutral-700">{i.recipientAddress}</p>
                ) : (
                  <p className="text-sm text-warning-text">{tr('Keine Rechnungsanschrift hinterlegt', 'No billing address on file')}</p>
                )}
                {i.recipientEmail && <p className="mt-1 text-[13px] break-words text-neutral-500">{i.recipientEmail}</p>}
              </div>
              <DetailList
                className="sm:col-span-2"
                columns={2}
                items={[
                  { label: tr('Rechnungsdatum', 'Invoice date'), value: formatDate(i.issueDate) },
                  {
                    label: i.serviceDateTo ? tr('Leistungszeitraum', 'Service period') : tr('Leistungsdatum', 'Service date'),
                    value: service ?? <span className="text-warning-text">{tr('fehlt', 'missing')}</span>,
                  },
                  ...(!cancellation
                    ? [
                        {
                          label: tr('Fällig am', 'Due date'),
                          value: (
                            <span className={cx(i.isOverdue && 'font-medium text-danger-text')}>
                              {formatDate(i.dueDate)}
                              {i.isOverdue && tr(` · ${daysText(i.daysOverdue)} überfällig`, ` · ${daysText(i.daysOverdue)} overdue`)}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  { label: tr('Ihre Referenz', 'Your reference'), value: i.buyerReference },
                  ...(i.recipientVatId || i.taxMode === 'ReverseCharge'
                    ? [{ label: tr('USt-IdNr. Kunde', 'Customer VAT ID (USt-IdNr.)'), value: i.recipientVatId }]
                    : []),
                  {
                    label: i.taxMode === 'Standard' ? tr('Brutto', 'Gross') : tr('Gesamt', 'Total'),
                    value: <span className="font-semibold tabular">{invoiceAmount(i.totals.grossTotal, i.kind)}</span>,
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={tr('Positionen', 'Line items')}
              description={
                i.lineItems.length === 1
                  ? tr('1 Position', '1 line item')
                  : tr(`${i.lineItems.length} Positionen`, `${i.lineItems.length} line items`)
              }
            />
            <CardBody>
              {i.introText && <p className="mb-4 text-sm whitespace-pre-line text-neutral-700">{i.introText}</p>}
              {i.lineItems.length === 0 ? (
                <p className="text-sm text-neutral-500">{tr('Noch keine Positionen.', 'No line items yet.')}</p>
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
                  <p className="font-medium text-neutral-800">{tr('Zahlungshinweis', 'Payment note')}</p>
                  <p className="whitespace-pre-line">{i.paymentTerms}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {!draft && !cancellation && <Payments invoice={i} onRecord={() => setDialog('payment')} />}

          <Card>
            <Tabs defaultValue="events">
              <TabsList label={tr('Rechnungsdetails', 'Invoice details')} className="px-3">
                <TabsTrigger value="events">{tr('Verlauf', 'History')}</TabsTrigger>
                <TabsTrigger value="deliveries" count={deliveries.data && deliveries.data.length > 0 ? deliveries.data.length : undefined}>
                  {tr('E-Mail-Versand', 'Email delivery')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="events">
                <EventTimeline query={events} labels={invoiceEventLabel} icons={eventIcons} tones={eventTone} />
              </TabsContent>
              <TabsContent value="deliveries">
                <DeliveryTable
                  query={deliveries}
                  emptyDescription={tr(
                    'Hier erscheinen Rechnungs-E-Mails und Zahlungserinnerungen mit ihrem Versandstatus.',
                    'Invoice emails and payment reminders appear here with their delivery status.',
                  )}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card>
            <CardHeader title={tr('Status', 'Status')} as="h2" />
            <CardBody>
              <DetailList
                items={[
                  { label: tr('Erstellt', 'Created'), value: formatDateTime(i.createdAt) },
                  { label: tr('Gestellt', 'Issued'), value: i.issuedAt ? formatDateTime(i.issuedAt) : null },
                  { label: tr('Versendet', 'Sent'), value: i.sentAt ? formatDateTime(i.sentAt) : null },
                  ...(!cancellation ? [{ label: tr('Bezahlt am', 'Paid on'), value: i.paidOn ? formatDate(i.paidOn) : null }] : []),
                  ...(!cancellation && !draft
                    ? [
                        {
                          label: tr('Erinnerungen', 'Reminders'),
                          value:
                            i.reminderCount > 0
                              ? tr(
                                  `${i.reminderCount} · zuletzt ${formatDateTime(i.lastReminderAt)}`,
                                  `${i.reminderCount} · last ${formatDateTime(i.lastReminderAt)}`,
                                )
                              : tr('keine', 'none'),
                        },
                      ]
                    : []),
                  ...(i.cancelledAt ? [{ label: tr('Storniert', 'Cancelled'), value: formatDateTime(i.cancelledAt) }] : []),
                  { label: tr('Zuletzt geändert', 'Last modified'), value: formatDateTime(i.updatedAt) },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={tr('Kunde & Quelle', 'Customer & source')} as="h2" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: tr('Kunde', 'Customer'),
                    value: (
                      <Link to={`/kunden/${i.customerId}`} className="font-medium text-brand-700 hover:underline">
                        {i.customerName}
                      </Link>
                    ),
                  },
                  ...(i.quotationId
                    ? [
                        {
                          label: tr('Angebot', 'Quotation'),
                          value: (
                            <Link to={`/angebote/${i.quotationId}`} className="font-medium text-brand-700 hover:underline">
                              {i.quotationNumber ?? tr('Angebot öffnen', 'Open quotation')}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  ...(i.jobId
                    ? [
                        {
                          label: tr('Auftrag', 'Job'),
                          value: (
                            <Link to={`/auftraege/${i.jobId}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                              <Hammer aria-hidden size={14} />
                              {i.jobNumber ?? tr('Auftrag öffnen', 'Open job')}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  ...(!i.quotationId && !i.jobId && !cancellation ? [{ label: tr('Quelle', 'Source'), value: tr('Manuell erstellt', 'Created manually') }] : []),
                ]}
              />
            </CardBody>
          </Card>

          {!draft && i.hasEInvoice && (
            <Card>
              <CardHeader title={tr('E-Rechnung', 'E-invoice')} as="h2" />
              <CardBody className="space-y-3 text-sm text-neutral-600">
                <p className="flex gap-2">
                  <ReceiptText aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />
                  {tr(
                    'Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931). Für Behörden oder Portale können Sie die XML-Datei auch einzeln laden.',
                    'The PDF contains the e-invoice in ZUGFeRD format (EN 16931). For authorities or portals you can also download the XML file separately.',
                  )}
                </p>
                <Button size="sm" icon={FileCode2} loading={downloadingXml} onClick={() => void downloadXml()}>
                  {tr('XML herunterladen', 'Download XML')}
                </Button>
              </CardBody>
            </Card>
          )}

          {i.internalNotes && (
            <Card className="border-dashed bg-neutral-25">
              <CardHeader title={tr('Interne Notizen', 'Internal notes')} description={tr('Nur intern sichtbar', 'Only visible internally')} />
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
        title={tr('Rechnungsentwurf löschen?', 'Delete invoice draft?')}
        description={tr(
          'Der Entwurf wird endgültig gelöscht. Da Entwürfe noch keine Rechnungsnummer haben, entsteht keine Lücke im Nummernkreis.',
          'The draft will be deleted permanently. Drafts have no invoice number yet, so no gap is left in the number sequence.',
        )}
        confirmLabel={tr('Löschen', 'Delete')}
        variant="danger"
        onConfirm={async () => {
          await api.invoices.delete(companyId, i.id);
          queryClient.removeQueries({ queryKey: qk.invoice(companyId, i.id) });
          invalidate({ id: i.id, customerId: i.customerId, jobId: i.jobId, quotationId: i.quotationId });
          toast.success(tr('Entwurf gelöscht', 'Draft deleted'));
          void navigate('/rechnungen', { replace: true });
        }}
      />
    </>
  );
}
