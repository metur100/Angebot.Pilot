import {
  errorMessage, followUpKindLabel, followUpStatusLabel, formatDate, formatDateTime, formatEur, formatPercent,
  formatQuantity, emailKindLabel, quotationEventLabel, taxModeLabel, tr,
  type QuotationDto,
} from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, Divider, KeyValue, SectionHeader } from '@/components/Card';
import { InvoiceLinkCard } from '@/components/EntityCards';
import { ContentScroll, Screen } from '@/components/Layout';
import { OptionSheet } from '@/components/Sheet';
import { EmailStatusBadge, QuotationStatusBadge } from '@/components/StatusBadge';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useLocale } from '@/lib/i18n';
import { shareQuotationPdf } from '@/lib/pdf';
import { invalidateInvoiceData, keys, useQuotation, useQuotationDeliveries, useQuotationEvents, useQuotationFollowUps } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { makeStyles, space, touch } from '@/theme';

import { CancelSheet, ConvertSheet, DecisionSheet, SendSheet } from './ActionSheets';
import { availableActions, type QuotationAction } from './actions';

type OpenSheet = null | 'send' | 'accept' | 'reject' | 'cancel' | 'convert' | 'more';

function Totals({ q }: { q: QuotationDto }) {
  const styles = useStyles();
  const t = q.totals;
  return (
    <Card testID="quotation-totals">
      {t.discountTotal > 0 ? (
        <>
          <Row label={tr('Zwischensumme', 'Subtotal')} value={formatEur(t.subtotalBeforeDiscount)} />
          <Row label={tr('Rabatte', 'Discounts')} value={`−${formatEur(t.discountTotal)}`} />
        </>
      ) : null}
      <Row label={tr('Summe netto', 'Net total')} value={formatEur(t.netTotal)} />
      {q.taxMode === 'Standard'
        ? t.taxGroups.map((g) => <Row key={g.ratePercent} label={tr(`USt. ${formatPercent(g.ratePercent)} auf ${formatEur(g.netAmount)}`, `VAT ${formatPercent(g.ratePercent)} on ${formatEur(g.netAmount)}`)} value={formatEur(g.taxAmount)} />)
        : (
          <Text variant="caption" tone="muted" style={styles.taxNote}>
            {q.taxMode === 'SmallBusiness'
              ? tr('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', 'No VAT is charged under § 19 UStG (small business).')
              : tr('Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).', 'Reverse charge: the recipient owes the tax (§ 13b UStG).')}
          </Text>
        )}
      <Divider spaced />
      <Row label={tr('Gesamt brutto', 'Total gross')} value={formatEur(t.grossTotal)} strong testID="quotation-gross" />
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

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <KeyValue label={label} value={value} />;
}

function History({ id }: { id: string }) {
  const { tr } = useLocale();
  const styles = useStyles();
  const followUps = useQuotationFollowUps(id);
  const deliveries = useQuotationDeliveries(id);
  const events = useQuotationEvents(id);
  return (
    <>
      <SectionHeader title={tr('Erinnerungen', 'Reminders')} />
      <Card>
        {followUps.isPending ? <Text variant="caption" tone="muted">{tr('Wird geladen …', 'Loading …')}</Text> : null}
        {followUps.isError ? <ErrorState error={followUps.error} onRetry={() => void followUps.refetch()} compact /> : null}
        {followUps.data?.length === 0 ? <Text variant="caption" tone="muted">{tr('Keine Erinnerungen geplant.', 'No reminders scheduled.')}</Text> : null}
        {followUps.data?.map((f, i) => (
          <View key={f.id}>
            {i > 0 ? <Divider spaced /> : null}
            <Text variant="bodyStrong">{followUpKindLabel[f.kind]}</Text>
            <Text variant="caption" tone="secondary">
              {followUpStatusLabel[f.status]} · {tr('fällig', 'due')} {formatDateTime(f.dueAt)}
              {f.processedAt ? tr(` · ausgeführt ${formatDateTime(f.processedAt)}`, ` · processed ${formatDateTime(f.processedAt)}`) : ''}
            </Text>
            {f.statusReason ? <Text variant="small" tone="muted">{f.statusReason}</Text> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title={tr('E-Mail-Versand', 'Email delivery')} />
      <Card testID="delivery-history">
        {deliveries.isPending ? <Text variant="caption" tone="muted">{tr('Wird geladen …', 'Loading …')}</Text> : null}
        {deliveries.isError ? <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} compact /> : null}
        {deliveries.data?.length === 0 ? <Text variant="caption" tone="muted">{tr('Noch keine E-Mails zu diesem Angebot.', 'No emails for this quotation yet.')}</Text> : null}
        {deliveries.data?.map((d, i) => (
          <View key={d.id} style={styles.gapSm}>
            {i > 0 ? <Divider spaced /> : null}
            <View style={styles.rowBetween}>
              <Text variant="bodyStrong" style={styles.flex}>
                {emailKindLabel[d.kind]}
              </Text>
              <EmailStatusBadge status={d.status} />
            </View>
            <Text variant="caption" tone="secondary">
              {tr('an', 'to')} {d.toAddress} · {formatDateTime(d.handedOffAt ?? d.createdAt)}
            </Text>
            {d.status === 'HandedOff' ? (
              <Text variant="small" tone="muted">
                {tr(
                  'Vom Mailserver angenommen – die Zustellung ins Postfach kann nicht garantiert werden.',
                  'Accepted by the mail server – delivery to the inbox cannot be guaranteed.',
                )}
              </Text>
            ) : null}
            {d.lastError ? <Text variant="small" tone="danger">{d.lastError}</Text> : null}
            {d.nextAttemptAt ? <Text variant="small" tone="muted">{tr('Nächster Versuch', 'Next attempt')}: {formatDateTime(d.nextAttemptAt)}</Text> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title={tr('Verlauf', 'History')} />
      <Card testID="event-timeline">
        {events.isPending ? <Text variant="caption" tone="muted">{tr('Wird geladen …', 'Loading …')}</Text> : null}
        {events.isError ? <ErrorState error={events.error} onRetry={() => void events.refetch()} compact /> : null}
        {events.data?.map((e) => (
          <View key={e.id} style={styles.event}>
            <View style={styles.eventDot} />
            <View style={styles.flex}>
              <Text variant="body">{quotationEventLabel[e.type] ?? e.type}</Text>
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

export default function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useCompanyId();
  const { tr } = useLocale();
  const styles = useStyles();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuotation(id);
  const followUps = useQuotationFollowUps(id);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [busy, setBusy] = useState<QuotationAction | null>(null);

  const q = query.data;

  const refreshAll = (updated?: QuotationDto) => {
    if (updated) queryClient.setQueryData(keys.quotation(companyId, updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: keys.quotation(companyId, id) });
    void queryClient.invalidateQueries({ queryKey: keys.quotations(companyId) });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard(companyId) });
  };

  const run = async (action: QuotationAction, fn: () => Promise<void>) => {
    setBusy(action);
    try {
      await fn();
    } catch (error) {
      Alert.alert(tr('Aktion fehlgeschlagen', 'Action failed'), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const sharePublicLink = async () => {
    const link = await api.quotations.createPublicLink(companyId, id);
    refreshAll();
    // Shared with the (German) customer: the message stays German.
    await Share.share({ message: `Ihr Angebot ${q?.number ?? ''}: ${link.url}`, url: link.url });
  };

  const handle = (action: QuotationAction) => {
    if (!q) return;
    switch (action) {
      case 'edit':
        router.push({ pathname: '/quotation-editor', params: { id: q.id } });
        return;
      case 'send':
      case 'resend':
        setSheet('send');
        return;
      case 'accept':
      case 'reject':
      case 'cancel':
      case 'convert':
        setSheet(action);
        return;
      case 'openJob':
        if (q.jobId) router.push(`/job/${q.jobId}`);
        return;
      case 'pdf':
        void run('pdf', () => shareQuotationPdf(companyId, q.id, q.number));
        return;
      case 'publicLink':
        Alert.alert(
          tr('Neuen Kundenlink erzeugen?', 'Create a new customer link?'),
          q.hasActivePublicLink
            ? tr('Der bisherige Link wird dabei ungültig. Der neue Link wird nur einmal angezeigt.', 'The previous link becomes invalid. The new link is shown only once.')
            : tr('Der Link wird nur einmal angezeigt – teilen Sie ihn direkt.', 'The link is shown only once – share it right away.'),
          [
            { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
            { text: tr('Erzeugen & teilen', 'Create & share'), onPress: () => void run('publicLink', sharePublicLink) },
          ],
        );
        return;
      case 'duplicate':
        void run('duplicate', async () => {
          const copy = await api.quotations.duplicate(companyId, q.id);
          refreshAll();
          toast(tr(`Kopie ${copy.number} angelegt`, `Copy ${copy.number} created`));
          router.push(`/quotation/${copy.id}`);
        });
        return;
      case 'revise':
        Alert.alert(
          tr('Revision erstellen?', 'Create revision?'),
          tr(
            `Es wird ein neuer Entwurf auf Basis von ${q.number} angelegt. Das bisherige Angebot wird nach dem Versand der Revision ersetzt.`,
            `A new draft based on ${q.number} will be created. The current quotation is replaced once the revision has been sent.`,
          ),
          [
          { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
          {
            text: tr('Revision erstellen', 'Create revision'),
            onPress: () =>
              void run('revise', async () => {
                const rev = await api.quotations.revise(companyId, q.id);
                refreshAll();
                toast(tr(`Revision ${rev.number} angelegt`, `Revision ${rev.number} created`));
                router.push(`/quotation/${rev.id}`);
              }),
          },
          ],
        );
        return;
      case 'createInvoice':
        void run('createInvoice', async () => {
          const draft = await api.quotations.createInvoice(companyId, q.id);
          invalidateInvoiceData(queryClient, companyId, draft);
          refreshAll();
          toast(tr('Rechnungsentwurf angelegt', 'Draft invoice created'));
          router.push({ pathname: '/invoice-editor', params: { id: draft.id, created: '1' } });
        });
        return;
      case 'cancelFollowUps':
        void run('cancelFollowUps', async () => {
          await api.quotations.cancelFollowUps(companyId, q.id);
          void followUps.refetch();
          refreshAll();
          toast(tr('Erinnerungen abgebrochen', 'Reminders cancelled'));
        });
        return;
      case 'delete':
        Alert.alert(tr('Entwurf löschen?', 'Delete draft?'), tr(`${q.number} wird endgültig gelöscht. Die Nummer wird nicht erneut vergeben.`, `${q.number} will be deleted permanently. The number will not be reused.`), [
          { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
          {
            text: tr('Löschen', 'Delete'),
            style: 'destructive',
            onPress: () =>
              void run('delete', async () => {
                await api.quotations.delete(companyId, q.id);
                queryClient.removeQueries({ queryKey: keys.quotation(companyId, q.id) });
                void queryClient.invalidateQueries({ queryKey: keys.quotations(companyId) });
                void queryClient.invalidateQueries({ queryKey: keys.dashboard(companyId) });
                toast(tr('Entwurf gelöscht', 'Draft deleted'));
                router.back();
              }),
          },
        ]);
        return;
    }
  };

  if (query.isPending) return <Screen><ListSkeleton rows={3} /></Screen>;
  if (query.isError || !q) {
    return (
      <Screen>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const hasScheduled = (followUps.data ?? []).some((f) => f.status === 'Scheduled');
  const { primary, more } = availableActions(q, hasScheduled);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: q.number,
          headerRight: () => (
            <IconButton icon="ellipsis-horizontal-circle-outline" accessibilityLabel={tr('Weitere Aktionen', 'More actions')} onPress={() => setSheet('more')} testID="quotation-more" />
          ),
        }}
      />
      <ContentScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="quotation-detail">
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="secondary">
              {q.number}
              {q.revisionNumber > 0 ? ` · ${tr('Revision', 'Revision')} ${q.revisionNumber}` : ''}
            </Text>
            <QuotationStatusBadge status={q.status} />
          </View>
          <Text variant="title" accessibilityRole="header">
            {q.title || tr('Ohne Betreff', 'No subject')}
          </Text>
          <Pressable accessibilityRole="link" accessibilityLabel={tr(`Kunde ${q.customerName} öffnen`, `Open customer ${q.customerName}`)} onPress={() => router.push(`/customer/${q.customerId}`)} style={styles.customerLink}>
            <Text variant="bodyStrong" tone="brand">
              {q.customerName}
            </Text>
          </Pressable>
          <Text variant="heading" testID="detail-gross">
            {formatEur(q.totals.grossTotal)}
          </Text>
          <View style={styles.rowWrap}>
            <KeyValue label={tr('Datum', 'Date')} value={formatDate(q.issueDate)} />
            <KeyValue label={tr('Gültig bis', 'Valid until')} value={formatDate(q.validUntil)} />
            {q.sentAt ? <KeyValue label={tr('Versendet', 'Sent')} value={formatDateTime(q.sentAt)} /> : null}
          </View>
          {q.decidedAt ? (
            <Text variant="caption" tone={q.status === 'Accepted' ? 'success' : 'danger'}>
              {q.status === 'Accepted'
                ? tr(`Angenommen am ${formatDateTime(q.decidedAt)}`, `Accepted on ${formatDateTime(q.decidedAt)}`)
                : tr(`Abgelehnt am ${formatDateTime(q.decidedAt)}`, `Rejected on ${formatDateTime(q.decidedAt)}`)}
              {q.decisionName
                ? tr(` von ${q.decisionName}`, ` by ${q.decisionName}`)
                : q.decidedByActor === 'User' ? tr(' (intern erfasst)', ' (recorded internally)') : ''}
              {q.decisionNote ? ` – „${q.decisionNote}“` : ''}
            </Text>
          ) : null}
          {q.cancelledAt ? (
            <Text variant="caption" tone="muted">
              {tr(`Storniert am ${formatDateTime(q.cancelledAt)}`, `Cancelled on ${formatDateTime(q.cancelledAt)}`)}
              {q.cancellationReason ? ` – ${q.cancellationReason}` : ''}
            </Text>
          ) : null}
          {q.hasActivePublicLink ? (
            <Text variant="small" tone="muted">
              {tr('Kundenlink aktiv', 'Customer link active')}
              {q.publicLinkLastOpenedAt
                ? tr(` · zuletzt geöffnet ${formatDateTime(q.publicLinkLastOpenedAt)}`, ` · last opened ${formatDateTime(q.publicLinkLastOpenedAt)}`)
                : tr(' · noch nicht geöffnet', ' · not opened yet')}
            </Text>
          ) : null}
        </Card>

        {primary.length > 0 ? (
          <View style={styles.actions} testID="primary-actions">
            {primary.map((a, i) => (
              <Button
                key={a.action}
                label={a.label}
                icon={a.icon}
                variant={i === 0 ? 'primary' : 'outline'}
                onPress={() => handle(a.action)}
                loading={busy === a.action}
                testID={`action-${a.action}`}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.quickRow}>
          <Button label="PDF" icon="document-attach-outline" variant="secondary" onPress={() => handle('pdf')} loading={busy === 'pdf'} style={styles.flex} testID="action-pdf" />
          {more.some((m) => m.action === 'publicLink') ? (
            <Button label={tr('Link teilen', 'Share link')} icon="share-social-outline" variant="secondary" onPress={() => handle('publicLink')} loading={busy === 'publicLink'} style={styles.flex} testID="action-publicLink" />
          ) : null}
        </View>

        {q.jobId ? (
          <Button label={tr('Zugehörigen Auftrag öffnen', 'Open related job')} icon="briefcase-outline" variant="ghost" onPress={() => router.push(`/job/${q.jobId}`)} />
        ) : null}

        {q.status === 'Accepted' || q.invoices.length > 0 ? (
          <>
            <SectionHeader title={`${tr('Rechnungen', 'Invoices')} (${q.invoices.length})`} />
            <View style={styles.actions} testID="quotation-invoices">
              {q.invoices.map((inv) => (
                <InvoiceLinkCard key={inv.id} item={inv} />
              ))}
              {q.status === 'Accepted' ? (
                <Button
                  label={tr('Rechnung erstellen', 'Create invoice')}
                  icon="receipt-outline"
                  variant="outline"
                  onPress={() => handle('createInvoice')}
                  loading={busy === 'createInvoice'}
                  accessibilityHint={tr('Legt einen Rechnungsentwurf mit den Positionen dieses Angebots an', 'Creates a draft invoice with the line items of this quotation')}
                  testID="action-createInvoice"
                />
              ) : null}
            </View>
          </>
        ) : null}

        <SectionHeader title={`${tr('Positionen', 'Line items')} (${q.lineItems.length})`} />
        {q.lineItems
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((li) => (
            <Card key={li.id} style={styles.gapSm} testID={`detail-line-${li.position}`}>
              <View style={styles.rowBetween}>
                <Text variant="small" tone="muted">
                  {tr('Pos.', 'Item')} {li.position}
                </Text>
                <Text variant="bodyStrong">{formatEur(li.lineNet)}</Text>
              </View>
              <Text variant="bodyStrong">{li.title}</Text>
              {li.description ? <Text variant="caption" tone="secondary">{li.description}</Text> : null}
              <Text variant="caption" tone="secondary">
                {formatQuantity(li.quantity)} {li.unit} × {formatEur(li.unitPriceNet)}
                {li.discountPercent ? ` · −${formatPercent(li.discountPercent)}` : ''}
                {q.taxMode === 'Standard' ? ` · ${formatPercent(li.taxRatePercent)} ${tr('USt.', 'VAT')}` : ''}
              </Text>
            </Card>
          ))}

        <SectionHeader title={tr('Summen', 'Totals')} />
        <Totals q={q} />

        <SectionHeader title={tr('Details', 'Details')} />
        <Card>
          <KeyValue label={tr('Empfänger', 'Recipient')} value={[q.recipientName, q.recipientContact, q.recipientAddress].filter(Boolean).join('\n')} />
          {q.recipientEmail ? <KeyValue label={tr('E-Mail', 'Email')} value={q.recipientEmail} /> : null}
          <KeyValue label={tr('Besteuerung', 'Tax treatment')} value={taxModeLabel[q.taxMode]} />
          <TextBlock label={tr('Einleitung', 'Introduction')} value={q.introText} />
          <TextBlock label={tr('Schlusstext', 'Closing text')} value={q.closingText} />
          <TextBlock label={tr('Zahlungsbedingungen', 'Payment terms')} value={q.paymentTerms} />
          <TextBlock label={tr('Bedingungen', 'Terms')} value={q.terms} />
          <TextBlock label={tr('Interne Notiz', 'Internal note')} value={q.internalNotes} />
        </Card>

        {q.revisions.length > 1 ? (
          <>
            <SectionHeader title={tr('Revisionen', 'Revisions')} />
            <Card>
              {q.revisions.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${r.number}, ${tr('Revision', 'revision')} ${r.revisionNumber}`}
                  disabled={r.id === q.id}
                  onPress={() => router.push(`/quotation/${r.id}`)}
                  style={styles.revision}
                >
                  <Text variant="body" tone={r.id === q.id ? 'default' : 'brand'} style={styles.flex}>
                    {r.number} · Rev. {r.revisionNumber}
                    {r.id === q.id ? tr(' (aktuell angezeigt)', ' (currently shown)') : ''}
                  </Text>
                  <QuotationStatusBadge status={r.status} />
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}

        <History id={q.id} />
      </ContentScroll>

      <OptionSheet
        visible={sheet === 'more'}
        onClose={() => setSheet(null)}
        title={tr('Weitere Aktionen', 'More actions')}
        options={[...primary, ...more].map((a) => ({ value: a.action, label: a.label, icon: a.icon, destructive: a.destructive }))}
        onSelect={(a) => setTimeout(() => handle(a), 250)}
      />
      <SendSheet
        visible={sheet === 'send'}
        onClose={() => setSheet(null)}
        quotation={q}
        onSubmit={async (body) => {
          const res = await api.quotations.send(companyId, q.id, body);
          refreshAll(res.quotation);
          setSheet(null);
          toast(
            body.mode === 'Email'
              ? tr('E-Mail wird versendet – Status im Versandverlauf', 'Email is being sent – see status in the delivery history')
              : tr('Als versendet markiert', 'Marked as sent'),
          );
          if (res.publicUrl && body.mode === 'Manual') {
            const url = res.publicUrl;
            setTimeout(() => {
              Alert.alert(tr('Kundenlink', 'Customer link'), tr('Möchten Sie den Kundenlink jetzt teilen? Er wird nur einmal angezeigt.', 'Do you want to share the customer link now? It is shown only once.'), [
                { text: tr('Später', 'Later'), style: 'cancel' },
                { text: tr('Teilen', 'Share'), onPress: () => void Share.share({ message: url, url }) },
              ]);
            }, 400);
          }
        }}
      />
      <DecisionSheet
        visible={sheet === 'accept' || sheet === 'reject'}
        kind={sheet === 'reject' ? 'reject' : 'accept'}
        onClose={() => setSheet(null)}
        quotation={q}
        onSubmit={async (note) => {
          const updated = sheet === 'reject' ? await api.quotations.reject(companyId, q.id, { note }) : await api.quotations.accept(companyId, q.id, { note });
          refreshAll(updated);
          setSheet(null);
          toast(updated.status === 'Accepted' ? tr('Annahme erfasst', 'Acceptance recorded') : tr('Ablehnung erfasst', 'Rejection recorded'));
        }}
      />
      <CancelSheet
        visible={sheet === 'cancel'}
        onClose={() => setSheet(null)}
        quotation={q}
        onSubmit={async (reason) => {
          const updated = await api.quotations.cancel(companyId, q.id, { reason });
          refreshAll(updated);
          setSheet(null);
          toast(tr('Angebot storniert', 'Quotation cancelled'));
        }}
      />
      <ConvertSheet
        visible={sheet === 'convert'}
        onClose={() => setSheet(null)}
        quotation={q}
        onSubmit={async (body) => {
          const job = await api.quotations.convertToJob(companyId, q.id, body);
          refreshAll();
          void queryClient.invalidateQueries({ queryKey: keys.jobs(companyId) });
          setSheet(null);
          toast(tr(`Auftrag ${job.number} angelegt`, `Job ${job.number} created`));
          router.push(`/job/${job.id}`);
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
  customerLink: { minHeight: touch, justifyContent: 'center', alignSelf: 'flex-start' },
  actions: { gap: space[2] },
  quickRow: { flexDirection: 'row', gap: space[3] },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 4 },
  taxNote: { marginTop: space[1] },
  revision: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touch },
  event: { flexDirection: 'row', gap: space[3], paddingVertical: space[2] },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandBorder, marginTop: 8 },
}));
