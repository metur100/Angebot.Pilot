import {
  errorMessage, formatDate, formatDateTime, formatEur, formatPercent, formatQuantity, invoiceEventLabel, taxModeLabel, tr,
  type InvoiceDto, type InvoicePaymentDto,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button, IconButton, type IconName } from '@/components/Button';
import { Card, Divider, KeyValue, SectionHeader } from '@/components/Card';
import { ContentScroll, Screen } from '@/components/Layout';
import { OptionSheet } from '@/components/Sheet';
import { InvoiceStatusBadge } from '@/components/StatusBadge';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useLocale } from '@/lib/i18n';
import { formatInvoiceAmount, invoiceFileName, invoiceHeaderTitle, invoiceLabel } from '@/lib/invoices';
import { shareInvoicePdf, shareInvoiceXml } from '@/lib/pdf';
import { invalidateInvoiceData, keys, useInvoice, useInvoiceEvents } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { makeStyles, radius, space, touch, useTheme } from '@/theme';

import { InvoiceCancelSheet, InvoiceSendSheet, IssueSheet, PaymentSheet, RemindSheet } from './ActionSheets';
import { availableInvoiceActions, type InvoiceUiAction } from './actions';

type OpenSheet = null | 'issue' | 'send' | 'recordPayment' | 'remind' | 'cancel' | 'more';
type AlertTone = 'danger' | 'success' | 'muted' | 'info' | 'warning';

const alertIcon: Record<AlertTone, IconName> = {
  danger: 'alert-circle-outline',
  success: 'checkmark-circle-outline',
  muted: 'ban-outline',
  info: 'information-circle-outline',
  warning: 'warning-outline',
};

function InfoAlert({ tone, title, children, testID }: { tone: AlertTone; title: string; children?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const c = colors.palette[tone];
  return (
    <View style={[styles.alert, { backgroundColor: c.bg, borderColor: c.border }]} accessibilityRole="alert" testID={testID}>
      <Ionicons name={alertIcon[tone]} size={22} color={c.text} />
      <View style={styles.alertBody}>
        <Text variant="bodyStrong" style={{ color: c.text }}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

function LinkText({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.link} testID={testID}>
      <Text variant="bodyStrong" tone="brand">
        {label}
      </Text>
    </Pressable>
  );
}

function serviceLabel(i: InvoiceDto): { label: string; value: string } {
  if (i.serviceDateFrom && i.serviceDateTo && i.serviceDateTo !== i.serviceDateFrom) {
    return { label: tr('Leistungszeitraum', 'Service period'), value: `${formatDate(i.serviceDateFrom)} – ${formatDate(i.serviceDateTo)}` };
  }
  return { label: tr('Leistungsdatum', 'Service date'), value: i.serviceDateFrom ? formatDate(i.serviceDateFrom) : '–' };
}

function Totals({ i }: { i: InvoiceDto }) {
  const styles = useStyles();
  const t = i.totals;
  const m = (v: number) => formatInvoiceAmount(v, i.kind);
  return (
    <Card testID="invoice-totals">
      {t.discountTotal > 0 ? (
        <>
          <Row label={tr('Zwischensumme', 'Subtotal')} value={m(t.subtotalBeforeDiscount)} />
          <Row label={tr('Rabatte', 'Discounts')} value={i.kind === 'Cancellation' ? formatEur(t.discountTotal) : `−${formatEur(t.discountTotal)}`} />
        </>
      ) : null}
      <Row label={tr('Summe netto', 'Net total')} value={m(t.netTotal)} />
      {i.taxMode === 'Standard'
        ? t.taxGroups.map((g) => <Row key={g.ratePercent} label={tr(`USt. ${formatPercent(g.ratePercent)} auf ${m(g.netAmount)}`, `VAT ${formatPercent(g.ratePercent)} on ${m(g.netAmount)}`)} value={m(g.taxAmount)} />)
        : (
          <Text variant="caption" tone="muted" style={styles.taxNote}>
            {i.taxMode === 'SmallBusiness'
              ? tr('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', 'No VAT is charged under § 19 UStG (small business).')
              : tr('Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).', 'Reverse charge: the recipient owes the tax (§ 13b UStG).')}
          </Text>
        )}
      <Divider spaced />
      <Row label={tr('Gesamt brutto', 'Total gross')} value={m(t.grossTotal)} strong testID="invoice-totals-gross" />
      {i.kind === 'Invoice' && i.status !== 'Draft' && i.status !== 'Cancelled' ? (
        <>
          {i.paidAmount > 0 ? <Row label={tr('Bereits bezahlt', 'Already paid')} value={`−${formatEur(i.paidAmount)}`} /> : null}
          <Row label={tr('Offener Betrag', 'Amount due')} value={formatEur(i.openAmount)} strong testID="invoice-open-amount" />
        </>
      ) : null}
    </Card>
  );
}

function Row({ label, value, strong, testID }: { label: string; value: string; strong?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.totalRow}>
      <Text variant={strong ? 'bodyStrong' : 'caption'} tone={strong ? 'default' : 'secondary'} style={styles.flex}>
        {label}
      </Text>
      <Text variant={strong ? 'heading' : 'body'} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function PaymentRow({ p, canRemove, onRemove, busy }: { p: InvoicePaymentDto; canRemove: boolean; onRemove: () => void; busy: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.payment} testID={`payment-${p.id}`}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{formatEur(p.amount)}</Text>
        <Text variant="caption" tone="secondary">
          {formatDate(p.paidOn)}
          {p.method ? ` · ${p.method}` : ''}
        </Text>
        {p.note ? <Text variant="small" tone="secondary">{p.note}</Text> : null}
        <Text variant="small" tone="muted">
          {tr(`erfasst ${formatDateTime(p.createdAt)}`, `recorded ${formatDateTime(p.createdAt)}`)}
          {p.createdByName ? tr(` von ${p.createdByName}`, ` by ${p.createdByName}`) : ''}
        </Text>
      </View>
      {canRemove ? (
        <IconButton
          icon="trash-outline"
          color={colors.danger}
          accessibilityLabel={tr(`Zahlung über ${formatEur(p.amount)} vom ${formatDate(p.paidOn)} entfernen`, `Remove payment of ${formatEur(p.amount)} from ${formatDate(p.paidOn)}`)}
          onPress={onRemove}
          disabled={busy}
          testID={`remove-payment-${p.id}`}
        />
      ) : null}
    </View>
  );
}

function History({ id }: { id: string }) {
  const styles = useStyles();
  const events = useInvoiceEvents(id);
  return (
    <>
      <SectionHeader title={tr('Verlauf', 'History')} />
      <Card testID="invoice-events">
        {events.isPending ? <Text variant="caption" tone="muted">{tr('Wird geladen …', 'Loading …')}</Text> : null}
        {events.isError ? <ErrorState error={events.error} onRetry={() => void events.refetch()} compact /> : null}
        {events.data?.length === 0 ? <Text variant="caption" tone="muted">{tr('Noch keine Einträge.', 'No entries yet.')}</Text> : null}
        {events.data?.map((e) => (
          <View key={e.id} style={styles.event}>
            <View style={styles.eventDot} />
            <View style={styles.flex}>
              <Text variant="body">{invoiceEventLabel[e.type] ?? e.type}</Text>
              <Text variant="small" tone="muted">
                {formatDateTime(e.occurredAt)}
                {e.actorName ? ` · ${e.actorName}` : e.actorType === 'Customer' ? tr(' · Kunde', ' · Customer') : e.actorType === 'System' ? ' · System' : ''}
              </Text>
              {e.details ? <Text variant="small" tone="secondary">{e.details}</Text> : null}
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useCompanyId();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useInvoice(id);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const i = query.data;

  const refresh = (updated?: InvoiceDto) => {
    invalidateInvoiceData(queryClient, companyId, updated ?? i);
    void queryClient.invalidateQueries({ queryKey: keys.invoice(companyId, id) });
  };

  const run = async (action: string, fn: () => Promise<void>) => {
    setBusy(action);
    try {
      await fn();
    } catch (error) {
      Alert.alert(tr('Aktion fehlgeschlagen', 'Action failed'), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handle = (action: InvoiceUiAction) => {
    if (!i) return;
    switch (action) {
      case 'edit':
        router.push({ pathname: '/invoice-editor', params: { id: i.id } });
        return;
      case 'issue':
      case 'send':
      case 'recordPayment':
      case 'remind':
      case 'cancel':
        setSheet(action);
        return;
      case 'pdf':
        void run('pdf', () => shareInvoicePdf(companyId, i.id, invoiceFileName(i)));
        return;
      case 'xml':
        void run('xml', () => shareInvoiceXml(companyId, i.id, invoiceFileName(i)));
        return;
      case 'duplicate':
        void run('duplicate', async () => {
          const copy = await api.invoices.duplicate(companyId, i.id);
          invalidateInvoiceData(queryClient, companyId, copy);
          toast(tr('Kopie als Entwurf angelegt', 'Copy created as draft'));
          router.push(`/invoice/${copy.id}`);
        });
        return;
      case 'delete':
        Alert.alert(tr('Entwurf löschen?', 'Delete draft?'), tr('Der Rechnungsentwurf wird endgültig gelöscht.', 'The draft invoice will be deleted permanently.'), [
          { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
          {
            text: tr('Löschen', 'Delete'),
            style: 'destructive',
            onPress: () =>
              void run('delete', async () => {
                await api.invoices.delete(companyId, i.id);
                queryClient.removeQueries({ queryKey: keys.invoice(companyId, i.id) });
                invalidateInvoiceData(queryClient, companyId, { id: i.id, customerId: i.customerId, jobId: i.jobId, quotationId: i.quotationId });
                toast(tr('Entwurf gelöscht', 'Draft deleted'));
                router.back();
              }),
          },
        ]);
        return;
    }
  };

  const removePayment = (paymentId: string, amount: number) => {
    if (!i) return;
    Alert.alert(
      tr('Zahlung entfernen?', 'Remove payment?'),
      tr(
        `Die Zahlung über ${formatEur(amount)} wird entfernt und der offene Betrag neu berechnet.`,
        `The payment of ${formatEur(amount)} will be removed and the amount due recalculated.`,
      ),
      [
      { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
      {
        text: tr('Entfernen', 'Remove'),
        style: 'destructive',
        onPress: () =>
          void run(`payment-${paymentId}`, async () => {
            refresh(await api.invoices.removePayment(companyId, i.id, paymentId));
            toast(tr('Zahlung entfernt', 'Payment removed'));
          }),
      },
      ],
    );
  };

  if (query.isPending) return <Screen><ListSkeleton rows={3} /></Screen>;
  if (query.isError || !i) {
    return (
      <Screen>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const { primary, more } = availableInvoiceActions(i);
  const isDraft = i.status === 'Draft';
  const isCancellation = i.kind === 'Cancellation';
  const service = serviceLabel(i);
  const canRemovePayment = i.allowedActions.includes('removePayment');
  const sign = (v: number) => formatInvoiceAmount(v, i.kind);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: invoiceHeaderTitle(i),
          headerRight: () => (
            <IconButton icon="ellipsis-horizontal-circle-outline" accessibilityLabel={tr('Weitere Aktionen', 'More actions')} onPress={() => setSheet('more')} testID="invoice-more" />
          ),
        }}
      />
      <ContentScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="invoice-detail">
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {isDraft ? tr('Rechnungsentwurf', 'Draft invoice') : invoiceLabel(i)}
            </Text>
            <InvoiceStatusBadge invoice={i} />
          </View>
          <Text variant="title" accessibilityRole="header">
            {i.title || tr('Ohne Betreff', 'No subject')}
          </Text>
          <LinkText label={i.customerName} onPress={() => router.push(`/customer/${i.customerId}`)} />
          <Text variant="heading" testID="invoice-gross">
            {sign(i.totals.grossTotal)}
          </Text>
          {i.status === 'PartiallyPaid' ? (
            <Text variant="caption" tone="secondary">
              {tr(`offen ${formatEur(i.openAmount)} · bezahlt ${formatEur(i.paidAmount)}`, `${formatEur(i.openAmount)} due · ${formatEur(i.paidAmount)} paid`)}
            </Text>
          ) : null}
          <View style={styles.rowWrap}>
            <KeyValue label={tr('Rechnungsdatum', 'Invoice date')} value={formatDate(i.issueDate)} />
            <KeyValue label={service.label} value={service.value} />
            {!isCancellation ? <KeyValue label={tr('Fällig am', 'Due on')} value={formatDate(i.dueDate)} testID="invoice-due" /> : null}
            {i.buyerReference ? <KeyValue label={tr('Referenz', 'Reference')} value={i.buyerReference} /> : null}
            {i.sentAt ? <KeyValue label={tr('Versendet', 'Sent')} value={formatDateTime(i.sentAt)} /> : null}
          </View>
        </Card>

        {isDraft && i.issueProblems.length > 0 ? (
          <InfoAlert tone="warning" title={tr('Vor dem Stellen noch erforderlich', 'Still required before issuing')} testID="issue-problems">
            {i.issueProblems.map((p) => (
              <Text key={p} variant="caption" style={{ color: colors.palette.warning.text }}>
                • {p}
              </Text>
            ))}
          </InfoAlert>
        ) : null}
        {isDraft && i.issueProblems.length === 0 ? (
          <InfoAlert tone="info" title={tr('Entwurf', 'Draft')}>
            <Text variant="caption" tone="secondary">
              {tr(
                'Die Rechnungsnummer wird erst beim Stellen vergeben. Die PDF-Vorschau trägt den Vermerk „Entwurf“.',
                'The invoice number is assigned only when issued. The PDF preview is marked “Entwurf” (draft).',
              )}
            </Text>
          </InfoAlert>
        ) : null}
        {i.isOverdue ? (
          <InfoAlert tone="danger" title={tr(`Seit ${i.daysOverdue} ${i.daysOverdue === 1 ? 'Tag' : 'Tagen'} überfällig`, `${i.daysOverdue} ${i.daysOverdue === 1 ? 'day' : 'days'} overdue`)} testID="overdue-alert">
            <Text variant="caption" style={{ color: colors.palette.danger.text }}>
              {tr(
                `Fällig war die Zahlung am ${formatDate(i.dueDate)}. Offen: ${formatEur(i.openAmount)}.`,
                `Payment was due on ${formatDate(i.dueDate)}. Amount due: ${formatEur(i.openAmount)}.`,
              )}
              {i.reminderCount > 0
                ? tr(
                  ` ${i.reminderCount} ${i.reminderCount === 1 ? 'Erinnerung' : 'Erinnerungen'} gesendet${i.lastReminderAt ? `, zuletzt ${formatDateTime(i.lastReminderAt)}` : ''}.`,
                  ` ${i.reminderCount} ${i.reminderCount === 1 ? 'reminder' : 'reminders'} sent${i.lastReminderAt ? `, last ${formatDateTime(i.lastReminderAt)}` : ''}.`,
                )
                : ''}
            </Text>
          </InfoAlert>
        ) : null}
        {i.status === 'Paid' ? (
          <InfoAlert tone="success" title={tr(`Vollständig bezahlt${i.paidOn ? ` am ${formatDate(i.paidOn)}` : ''}`, `Paid in full${i.paidOn ? ` on ${formatDate(i.paidOn)}` : ''}`)} testID="paid-alert" />
        ) : null}
        {i.status === 'Cancelled' ? (
          <InfoAlert tone="muted" title={tr(`Storniert${i.cancelledAt ? ` am ${formatDateTime(i.cancelledAt)}` : ''}`, `Cancelled${i.cancelledAt ? ` on ${formatDateTime(i.cancelledAt)}` : ''}`)} testID="cancelled-alert">
            {i.cancellationReason ? <Text variant="caption" tone="secondary">{tr('Grund', 'Reason')}: {i.cancellationReason}</Text> : null}
            {i.cancellationInvoiceId ? (
              <LinkText
                label={tr(`Stornorechnung ${i.cancellationInvoiceNumber ?? ''} öffnen`, `Open cancellation invoice ${i.cancellationInvoiceNumber ?? ''}`).replace(/\s+/g, ' ').trim()}
                onPress={() => router.push(`/invoice/${i.cancellationInvoiceId}`)}
                testID="open-cancellation-invoice"
              />
            ) : null}
          </InfoAlert>
        ) : null}
        {isCancellation ? (
          <InfoAlert tone="info" title={tr('Stornorechnung', 'Cancellation invoice')} testID="cancellation-alert">
            <Text variant="caption" tone="secondary">
              {tr(
                `Diese Rechnung storniert ${i.cancelledInvoiceNumber ? `Rechnung ${i.cancelledInvoiceNumber}` : 'die ursprüngliche Rechnung'} in voller Höhe.`,
                `This invoice cancels ${i.cancelledInvoiceNumber ? `invoice ${i.cancelledInvoiceNumber}` : 'the original invoice'} in full.`,
              )}
            </Text>
            {i.cancelledInvoiceId ? (
              <LinkText label={tr('Ursprüngliche Rechnung öffnen', 'Open original invoice')} onPress={() => router.push(`/invoice/${i.cancelledInvoiceId}`)} testID="open-original-invoice" />
            ) : null}
          </InfoAlert>
        ) : null}

        {primary.length > 0 ? (
          <View style={styles.actions} testID="invoice-primary-actions">
            {primary.map((a, index) => (
              <Button
                key={a.action}
                label={a.label}
                icon={a.icon}
                variant={index === 0 ? 'primary' : 'outline'}
                onPress={() => handle(a.action)}
                loading={busy === a.action}
                testID={`invoice-action-${a.action}`}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.quickRow}>
          <Button
            label={isDraft ? tr('PDF-Vorschau', 'PDF preview') : 'PDF'}
            icon="document-attach-outline"
            variant="secondary"
            onPress={() => handle('pdf')}
            loading={busy === 'pdf'}
            style={styles.flex}
            accessibilityLabel={isDraft ? tr('PDF-Vorschau teilen', 'Share PDF preview') : tr('PDF teilen', 'Share PDF')}
            testID="invoice-action-pdf"
          />
          {i.hasEInvoice ? (
            <Button
              label={tr('E-Rechnung (XML)', 'E-invoice (XML)')}
              icon="code-download-outline"
              variant="secondary"
              onPress={() => handle('xml')}
              loading={busy === 'xml'}
              style={styles.flex}
              accessibilityLabel={tr('E-Rechnung (XML) teilen', 'Share e-invoice (XML)')}
              testID="invoice-action-xml"
            />
          ) : null}
        </View>

        {i.quotationId || i.jobId ? (
          <>
            <SectionHeader title={tr('Herkunft', 'Source')} />
            <Card>
              {i.quotationId ? (
                <LinkText label={`${tr('Angebot', 'Quotation')} ${i.quotationNumber ?? ''}`.trim()} onPress={() => router.push(`/quotation/${i.quotationId}`)} testID="invoice-source-quotation" />
              ) : null}
              {i.jobId ? <LinkText label={`${tr('Auftrag', 'Job')} ${i.jobNumber ?? ''}`.trim()} onPress={() => router.push(`/job/${i.jobId}`)} testID="invoice-source-job" /> : null}
            </Card>
          </>
        ) : null}

        <SectionHeader title={`${tr('Positionen', 'Line items')} (${i.lineItems.length})`} />
        {i.lineItems.length === 0 ? (
          <Text variant="caption" tone="muted">
            {tr('Noch keine Positionen.', 'No line items yet.')}
          </Text>
        ) : null}
        {i.lineItems
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((li) => (
            <Card key={li.id} style={styles.gapSm} testID={`invoice-line-${li.position}`}>
              <View style={styles.rowBetween}>
                <Text variant="small" tone="muted">
                  {tr('Pos.', 'Item')} {li.position}
                </Text>
                <Text variant="bodyStrong">{sign(li.lineNet)}</Text>
              </View>
              <Text variant="bodyStrong">{li.title}</Text>
              {li.description ? <Text variant="caption" tone="secondary">{li.description}</Text> : null}
              <Text variant="caption" tone="secondary">
                {formatQuantity(li.quantity)} {li.unit} × {formatEur(li.unitPriceNet)}
                {li.discountPercent ? ` · −${formatPercent(li.discountPercent)}` : ''}
                {i.taxMode === 'Standard' ? ` · ${formatPercent(li.taxRatePercent)} ${tr('USt.', 'VAT')}` : ''}
              </Text>
            </Card>
          ))}

        <SectionHeader title={tr('Summen', 'Totals')} />
        <Totals i={i} />

        {!isDraft && !isCancellation ? (
          <>
            <SectionHeader title={`${tr('Zahlungen', 'Payments')} (${i.payments.length})`} />
            <Card testID="invoice-payments">
              {i.payments.length === 0 ? (
                <Text variant="caption" tone="muted">
                  {tr('Noch keine Zahlungen erfasst.', 'No payments recorded yet.')}
                </Text>
              ) : null}
              {i.payments.map((p, index) => (
                <View key={p.id}>
                  {index > 0 ? <Divider spaced /> : null}
                  <PaymentRow p={p} canRemove={canRemovePayment} busy={busy === `payment-${p.id}`} onRemove={() => removePayment(p.id, p.amount)} />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionHeader title={tr('Details', 'Details')} />
        <Card>
          <KeyValue label={tr('Empfänger', 'Recipient')} value={[i.recipientName, i.recipientContact, i.recipientAddress].filter(Boolean).join('\n')} />
          {i.recipientEmail ? <KeyValue label={tr('E-Mail', 'Email')} value={i.recipientEmail} /> : null}
          {i.recipientVatId ? <KeyValue label={tr('USt-IdNr. des Kunden', 'Customer VAT ID')} value={i.recipientVatId} /> : null}
          <KeyValue label={tr('Besteuerung', 'Tax treatment')} value={taxModeLabel[i.taxMode]} />
          {i.introText ? <KeyValue label={tr('Einleitung', 'Introduction')} value={i.introText} /> : null}
          {i.closingText ? <KeyValue label={tr('Schlusstext', 'Closing text')} value={i.closingText} /> : null}
          {i.paymentTerms ? <KeyValue label={tr('Zahlungshinweis', 'Payment note')} value={i.paymentTerms} /> : null}
          {i.internalNotes ? <KeyValue label={tr('Interne Notiz', 'Internal note')} value={i.internalNotes} /> : null}
          {i.issuedAt ? <KeyValue label={tr('Gestellt', 'Issued')} value={formatDateTime(i.issuedAt)} /> : null}
          <KeyValue label={tr('Angelegt', 'Created')} value={formatDateTime(i.createdAt)} />
        </Card>

        <History id={i.id} />
      </ContentScroll>

      <OptionSheet
        visible={sheet === 'more'}
        onClose={() => setSheet(null)}
        title={tr('Weitere Aktionen', 'More actions')}
        options={[...primary, ...more].map((a) => ({ value: a.action, label: a.label, icon: a.icon, destructive: a.destructive }))}
        onSelect={(a) => setTimeout(() => handle(a), 250)}
      />
      <IssueSheet
        visible={sheet === 'issue'}
        onClose={() => setSheet(null)}
        invoice={i}
        onEdit={() => {
          setSheet(null);
          handle('edit');
        }}
        onSubmit={async () => {
          try {
            const issued = await api.invoices.issue(companyId, i.id);
            refresh(issued);
            setSheet(null);
            toast(tr(`Rechnung ${issued.number ?? ''} gestellt`, `Invoice ${issued.number ?? ''} issued`));
          } catch (error) {
            // The server lists what is missing (409 invoice_incomplete); reload so the problem list is current.
            void query.refetch();
            throw error;
          }
        }}
      />
      <InvoiceSendSheet
        visible={sheet === 'send'}
        onClose={() => setSheet(null)}
        invoice={i}
        onSubmit={async (body) => {
          const res = await api.invoices.send(companyId, i.id, body);
          refresh(res.invoice);
          setSheet(null);
          toast(body.mode === 'Email' ? tr('E-Mail wird versendet – Status im Verlauf', 'Email is being sent – see status in the history') : tr('Als versendet markiert', 'Marked as sent'));
        }}
      />
      <PaymentSheet
        visible={sheet === 'recordPayment'}
        onClose={() => setSheet(null)}
        invoice={i}
        onSubmit={async (body) => {
          const updated = await api.invoices.recordPayment(companyId, i.id, body);
          refresh(updated);
          setSheet(null);
          toast(updated.status === 'Paid' ? tr('Zahlung erfasst – Rechnung bezahlt', 'Payment recorded – invoice paid') : tr('Zahlung erfasst', 'Payment recorded'));
        }}
      />
      <RemindSheet
        visible={sheet === 'remind'}
        onClose={() => setSheet(null)}
        invoice={i}
        onSubmit={async (body) => {
          const res = await api.invoices.remind(companyId, i.id, body);
          refresh(res.invoice);
          setSheet(null);
          toast(tr('Zahlungserinnerung wird versendet', 'Payment reminder is being sent'));
        }}
      />
      <InvoiceCancelSheet
        visible={sheet === 'cancel'}
        onClose={() => setSheet(null)}
        invoice={i}
        onSubmit={async (reason) => {
          const updated = await api.invoices.cancel(companyId, i.id, { reason });
          refresh(updated);
          setSheet(null);
          toast(
            updated.cancellationInvoiceNumber
              ? tr(`Stornorechnung ${updated.cancellationInvoiceNumber} erstellt`, `Cancellation invoice ${updated.cancellationInvoiceNumber} created`)
              : tr('Rechnung storniert', 'Invoice cancelled'),
          );
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: space[2] },
  gapSm: { gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[6] },
  link: { minHeight: touch, justifyContent: 'center', alignSelf: 'flex-start' },
  actions: { gap: space[2] },
  quickRow: { flexDirection: 'row', gap: space[3] },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 4 },
  taxNote: { marginTop: space[1] },
  alert: { flexDirection: 'row', gap: space[3], padding: space[3], borderRadius: radius.lg, borderWidth: 1 },
  alertBody: { flex: 1, gap: space[1] },
  payment: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  event: { flexDirection: 'row', gap: space[3], paddingVertical: space[2] },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandBorder, marginTop: 8 },
}));
