import {
  errorMessage, followUpKindLabel, followUpStatusLabel, formatDate, formatDateTime, formatEur, formatPercent,
  formatQuantity, emailKindLabel, quotationEventLabel, taxModeLabel,
  type QuotationDto,
} from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, Divider, KeyValue, SectionHeader } from '@/components/Card';
import { InvoiceLinkCard } from '@/components/EntityCards';
import { ContentScroll, Screen } from '@/components/Layout';
import { OptionSheet } from '@/components/Sheet';
import { EmailStatusBadge, QuotationStatusBadge } from '@/components/StatusBadge';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { shareQuotationPdf } from '@/lib/pdf';
import { invalidateInvoiceData, keys, useQuotation, useQuotationDeliveries, useQuotationEvents, useQuotationFollowUps } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { colors, space, touch } from '@/theme';

import { CancelSheet, ConvertSheet, DecisionSheet, SendSheet } from './ActionSheets';
import { availableActions, type QuotationAction } from './actions';

type OpenSheet = null | 'send' | 'accept' | 'reject' | 'cancel' | 'convert' | 'more';

function Totals({ q }: { q: QuotationDto }) {
  const t = q.totals;
  return (
    <Card testID="quotation-totals">
      {t.discountTotal > 0 ? (
        <>
          <Row label="Zwischensumme" value={formatEur(t.subtotalBeforeDiscount)} />
          <Row label="Rabatte" value={`−${formatEur(t.discountTotal)}`} />
        </>
      ) : null}
      <Row label="Summe netto" value={formatEur(t.netTotal)} />
      {q.taxMode === 'Standard'
        ? t.taxGroups.map((g) => <Row key={g.ratePercent} label={`USt. ${formatPercent(g.ratePercent)} auf ${formatEur(g.netAmount)}`} value={formatEur(g.taxAmount)} />)
        : (
          <Text variant="caption" tone="muted" style={styles.taxNote}>
            {q.taxMode === 'SmallBusiness' ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' : 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).'}
          </Text>
        )}
      <Divider spaced />
      <Row label="Gesamt brutto" value={formatEur(t.grossTotal)} strong testID="quotation-gross" />
    </Card>
  );
}

function Row({ label, value, strong, testID }: { label: string; value: string; strong?: boolean; testID?: string }) {
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
  const followUps = useQuotationFollowUps(id);
  const deliveries = useQuotationDeliveries(id);
  const events = useQuotationEvents(id);
  return (
    <>
      <SectionHeader title="Erinnerungen" />
      <Card>
        {followUps.isPending ? <Text variant="caption" tone="muted">Wird geladen …</Text> : null}
        {followUps.isError ? <ErrorState error={followUps.error} onRetry={() => void followUps.refetch()} compact /> : null}
        {followUps.data?.length === 0 ? <Text variant="caption" tone="muted">Keine Erinnerungen geplant.</Text> : null}
        {followUps.data?.map((f, i) => (
          <View key={f.id}>
            {i > 0 ? <Divider spaced /> : null}
            <Text variant="bodyStrong">{followUpKindLabel[f.kind]}</Text>
            <Text variant="caption" tone="secondary">
              {followUpStatusLabel[f.status]} · fällig {formatDateTime(f.dueAt)}
              {f.processedAt ? ` · ausgeführt ${formatDateTime(f.processedAt)}` : ''}
            </Text>
            {f.statusReason ? <Text variant="small" tone="muted">{f.statusReason}</Text> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="E-Mail-Versand" />
      <Card testID="delivery-history">
        {deliveries.isPending ? <Text variant="caption" tone="muted">Wird geladen …</Text> : null}
        {deliveries.isError ? <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} compact /> : null}
        {deliveries.data?.length === 0 ? <Text variant="caption" tone="muted">Noch keine E-Mails zu diesem Angebot.</Text> : null}
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
              an {d.toAddress} · {formatDateTime(d.handedOffAt ?? d.createdAt)}
            </Text>
            {d.status === 'HandedOff' ? (
              <Text variant="small" tone="muted">
                Vom Mailserver angenommen – die Zustellung ins Postfach kann nicht garantiert werden.
              </Text>
            ) : null}
            {d.lastError ? <Text variant="small" tone="danger">{d.lastError}</Text> : null}
            {d.nextAttemptAt ? <Text variant="small" tone="muted">Nächster Versuch: {formatDateTime(d.nextAttemptAt)}</Text> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="Verlauf" />
      <Card testID="event-timeline">
        {events.isPending ? <Text variant="caption" tone="muted">Wird geladen …</Text> : null}
        {events.isError ? <ErrorState error={events.error} onRetry={() => void events.refetch()} compact /> : null}
        {events.data?.map((e) => (
          <View key={e.id} style={styles.event}>
            <View style={styles.eventDot} />
            <View style={styles.flex}>
              <Text variant="body">{quotationEventLabel[e.type] ?? e.type}</Text>
              <Text variant="small" tone="muted">
                {formatDateTime(e.occurredAt)}
                {e.actorName ? ` · ${e.actorName}` : e.actorType === 'Customer' ? ' · Kunde' : e.actorType === 'System' ? ' · System' : ''}
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
      Alert.alert('Aktion fehlgeschlagen', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const sharePublicLink = async () => {
    const link = await api.quotations.createPublicLink(companyId, id);
    refreshAll();
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
          'Neuen Kundenlink erzeugen?',
          q.hasActivePublicLink ? 'Der bisherige Link wird dabei ungültig. Der neue Link wird nur einmal angezeigt.' : 'Der Link wird nur einmal angezeigt – teilen Sie ihn direkt.',
          [
            { text: 'Abbrechen', style: 'cancel' },
            { text: 'Erzeugen & teilen', onPress: () => void run('publicLink', sharePublicLink) },
          ],
        );
        return;
      case 'duplicate':
        void run('duplicate', async () => {
          const copy = await api.quotations.duplicate(companyId, q.id);
          refreshAll();
          toast(`Kopie ${copy.number} angelegt`);
          router.push(`/quotation/${copy.id}`);
        });
        return;
      case 'revise':
        Alert.alert('Revision erstellen?', `Es wird ein neuer Entwurf auf Basis von ${q.number} angelegt. Das bisherige Angebot wird nach dem Versand der Revision ersetzt.`, [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Revision erstellen',
            onPress: () =>
              void run('revise', async () => {
                const rev = await api.quotations.revise(companyId, q.id);
                refreshAll();
                toast(`Revision ${rev.number} angelegt`);
                router.push(`/quotation/${rev.id}`);
              }),
          },
        ]);
        return;
      case 'createInvoice':
        void run('createInvoice', async () => {
          const draft = await api.quotations.createInvoice(companyId, q.id);
          invalidateInvoiceData(queryClient, companyId, draft);
          refreshAll();
          toast('Rechnungsentwurf angelegt');
          router.push({ pathname: '/invoice-editor', params: { id: draft.id, created: '1' } });
        });
        return;
      case 'cancelFollowUps':
        void run('cancelFollowUps', async () => {
          await api.quotations.cancelFollowUps(companyId, q.id);
          void followUps.refetch();
          refreshAll();
          toast('Erinnerungen abgebrochen');
        });
        return;
      case 'delete':
        Alert.alert('Entwurf löschen?', `${q.number} wird endgültig gelöscht. Die Nummer wird nicht erneut vergeben.`, [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Löschen',
            style: 'destructive',
            onPress: () =>
              void run('delete', async () => {
                await api.quotations.delete(companyId, q.id);
                queryClient.removeQueries({ queryKey: keys.quotation(companyId, q.id) });
                void queryClient.invalidateQueries({ queryKey: keys.quotations(companyId) });
                void queryClient.invalidateQueries({ queryKey: keys.dashboard(companyId) });
                toast('Entwurf gelöscht');
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
            <IconButton icon="ellipsis-horizontal-circle-outline" accessibilityLabel="Weitere Aktionen" onPress={() => setSheet('more')} testID="quotation-more" />
          ),
        }}
      />
      <ContentScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="quotation-detail">
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="secondary">
              {q.number}
              {q.revisionNumber > 0 ? ` · Revision ${q.revisionNumber}` : ''}
            </Text>
            <QuotationStatusBadge status={q.status} />
          </View>
          <Text variant="title" accessibilityRole="header">
            {q.title || 'Ohne Betreff'}
          </Text>
          <Pressable accessibilityRole="link" accessibilityLabel={`Kunde ${q.customerName} öffnen`} onPress={() => router.push(`/customer/${q.customerId}`)} style={styles.customerLink}>
            <Text variant="bodyStrong" tone="brand">
              {q.customerName}
            </Text>
          </Pressable>
          <Text variant="heading" testID="detail-gross">
            {formatEur(q.totals.grossTotal)}
          </Text>
          <View style={styles.rowWrap}>
            <KeyValue label="Datum" value={formatDate(q.issueDate)} />
            <KeyValue label="Gültig bis" value={formatDate(q.validUntil)} />
            {q.sentAt ? <KeyValue label="Versendet" value={formatDateTime(q.sentAt)} /> : null}
          </View>
          {q.decidedAt ? (
            <Text variant="caption" tone={q.status === 'Accepted' ? 'success' : 'danger'}>
              {q.status === 'Accepted' ? 'Angenommen' : 'Abgelehnt'} am {formatDateTime(q.decidedAt)}
              {q.decisionName ? ` von ${q.decisionName}` : q.decidedByActor === 'User' ? ' (intern erfasst)' : ''}
              {q.decisionNote ? ` – „${q.decisionNote}“` : ''}
            </Text>
          ) : null}
          {q.cancelledAt ? (
            <Text variant="caption" tone="muted">
              Storniert am {formatDateTime(q.cancelledAt)}
              {q.cancellationReason ? ` – ${q.cancellationReason}` : ''}
            </Text>
          ) : null}
          {q.hasActivePublicLink ? (
            <Text variant="small" tone="muted">
              Kundenlink aktiv{q.publicLinkLastOpenedAt ? ` · zuletzt geöffnet ${formatDateTime(q.publicLinkLastOpenedAt)}` : ' · noch nicht geöffnet'}
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
            <Button label="Link teilen" icon="share-social-outline" variant="secondary" onPress={() => handle('publicLink')} loading={busy === 'publicLink'} style={styles.flex} testID="action-publicLink" />
          ) : null}
        </View>

        {q.jobId ? (
          <Button label="Zugehörigen Auftrag öffnen" icon="briefcase-outline" variant="ghost" onPress={() => router.push(`/job/${q.jobId}`)} />
        ) : null}

        {q.status === 'Accepted' || q.invoices.length > 0 ? (
          <>
            <SectionHeader title={`Rechnungen (${q.invoices.length})`} />
            <View style={styles.actions} testID="quotation-invoices">
              {q.invoices.map((inv) => (
                <InvoiceLinkCard key={inv.id} item={inv} />
              ))}
              {q.status === 'Accepted' ? (
                <Button
                  label="Rechnung erstellen"
                  icon="receipt-outline"
                  variant="outline"
                  onPress={() => handle('createInvoice')}
                  loading={busy === 'createInvoice'}
                  accessibilityHint="Legt einen Rechnungsentwurf mit den Positionen dieses Angebots an"
                  testID="action-createInvoice"
                />
              ) : null}
            </View>
          </>
        ) : null}

        <SectionHeader title={`Positionen (${q.lineItems.length})`} />
        {q.lineItems
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((li) => (
            <Card key={li.id} style={styles.gapSm} testID={`detail-line-${li.position}`}>
              <View style={styles.rowBetween}>
                <Text variant="small" tone="muted">
                  Pos. {li.position}
                </Text>
                <Text variant="bodyStrong">{formatEur(li.lineNet)}</Text>
              </View>
              <Text variant="bodyStrong">{li.title}</Text>
              {li.description ? <Text variant="caption" tone="secondary">{li.description}</Text> : null}
              <Text variant="caption" tone="secondary">
                {formatQuantity(li.quantity)} {li.unit} × {formatEur(li.unitPriceNet)}
                {li.discountPercent ? ` · −${formatPercent(li.discountPercent)}` : ''}
                {q.taxMode === 'Standard' ? ` · ${formatPercent(li.taxRatePercent)} USt.` : ''}
              </Text>
            </Card>
          ))}

        <SectionHeader title="Summen" />
        <Totals q={q} />

        <SectionHeader title="Details" />
        <Card>
          <KeyValue label="Empfänger" value={[q.recipientName, q.recipientContact, q.recipientAddress].filter(Boolean).join('\n')} />
          {q.recipientEmail ? <KeyValue label="E-Mail" value={q.recipientEmail} /> : null}
          <KeyValue label="Besteuerung" value={taxModeLabel[q.taxMode]} />
          <TextBlock label="Einleitung" value={q.introText} />
          <TextBlock label="Schlusstext" value={q.closingText} />
          <TextBlock label="Zahlungsbedingungen" value={q.paymentTerms} />
          <TextBlock label="Bedingungen" value={q.terms} />
          <TextBlock label="Interne Notiz" value={q.internalNotes} />
        </Card>

        {q.revisions.length > 1 ? (
          <>
            <SectionHeader title="Revisionen" />
            <Card>
              {q.revisions.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${r.number}, Revision ${r.revisionNumber}`}
                  disabled={r.id === q.id}
                  onPress={() => router.push(`/quotation/${r.id}`)}
                  style={styles.revision}
                >
                  <Text variant="body" tone={r.id === q.id ? 'default' : 'brand'} style={styles.flex}>
                    {r.number} · Rev. {r.revisionNumber}
                    {r.id === q.id ? ' (aktuell angezeigt)' : ''}
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
        title="Weitere Aktionen"
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
          toast(body.mode === 'Email' ? 'E-Mail wird versendet – Status im Versandverlauf' : 'Als versendet markiert');
          if (res.publicUrl && body.mode === 'Manual') {
            const url = res.publicUrl;
            setTimeout(() => {
              Alert.alert('Kundenlink', 'Möchten Sie den Kundenlink jetzt teilen? Er wird nur einmal angezeigt.', [
                { text: 'Später', style: 'cancel' },
                { text: 'Teilen', onPress: () => void Share.share({ message: url, url }) },
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
          toast(updated.status === 'Accepted' ? 'Annahme erfasst' : 'Ablehnung erfasst');
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
          toast('Angebot storniert');
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
          toast(`Auftrag ${job.number} angelegt`);
          router.push(`/job/${job.id}`);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
