// Public (token-based) quotation view for customers – no login required. Opened via angebotpilot://q/<token>,
// via the public URL printed as QR code on the PDF, or from the scanner for quotations of other companies.
import {
  ApiError, errorMessage, formatDate, formatDateTime, formatEur, formatPercent, formatQuantity,
  type PublicDecisionResponse, type PublicQuotationDto,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, Divider, KeyValue, SectionHeader } from '@/components/Card';
import { Checkbox, TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { QuotationStatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState, InlineError, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useLocale } from '@/lib/i18n';
import { sharePublicPdf } from '@/lib/pdf';
import { keys } from '@/lib/queries';
import { api, useSession } from '@/lib/session';
import { space, useTheme } from '@/theme';

function AcceptSheet({ visible, onClose, token, q, onDone }: { visible: boolean; onClose: () => void; token: string; q: PublicQuotationDto; onDone: (r: PublicDecisionResponse) => void }) {
  const { tr } = useLocale();
  const [fullName, setFullName] = useState('');
  const [binding, setBinding] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; binding?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: typeof errors = {};
    if (fullName.trim().length < 2) e.fullName = tr('Bitte vollständigen Namen angeben.', 'Please enter your full name.');
    if (!binding) e.binding = tr('Bitte bestätigen Sie die verbindliche Annahme.', 'Please confirm the binding acceptance.');
    setErrors(e);
    if (e.fullName || e.binding) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.publicQuotation.accept(token, { fullName: fullName.trim(), confirmBinding: true, note: note.trim() || null }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('Angebot annehmen', 'Accept quotation')}
      testID="public-accept-sheet"
      footer={<Button label={tr('Verbindlich annehmen', 'Accept (binding)')} icon="checkmark-circle-outline" onPress={() => void submit()} loading={busy} testID="public-accept-submit" />}
    >
      <Text variant="body" tone="secondary">
        {tr(
          `Sie nehmen das Angebot ${q.number} von ${q.companyName} über ${formatEur(q.totals.grossTotal)} an.`,
          `You are accepting quotation ${q.number} from ${q.companyName} for ${formatEur(q.totals.grossTotal)}.`,
        )}
      </Text>
      <TextField label={tr('Vor- und Nachname', 'First and last name')} value={fullName} onChangeText={setFullName} error={errors.fullName} autoComplete="name" required testID="public-fullname" />
      <TextField label={tr('Nachricht (optional)', 'Message (optional)')} value={note} onChangeText={setNote} multiline />
      <Checkbox
        label={tr('Ich nehme dieses Angebot verbindlich an.', 'I accept this quotation as binding.')}
        checked={binding}
        onChange={setBinding}
        error={errors.binding}
        testID="public-binding"
      />
      <InlineError message={error} />
    </Sheet>
  );
}

function RejectSheet({ visible, onClose, token, onDone }: { visible: boolean; onClose: () => void; token: string; onDone: (r: PublicDecisionResponse) => void }) {
  const { tr } = useLocale();
  const [fullName, setFullName] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.publicQuotation.reject(token, { fullName: fullName.trim() || null, reason: reason.trim() || null }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('Angebot ablehnen', 'Reject quotation')}
      footer={<Button label={tr('Ablehnen', 'Reject')} variant="danger" icon="close-circle-outline" onPress={() => void submit()} loading={busy} testID="public-reject-submit" />}
    >
      <TextField label={tr('Ihr Name (optional)', 'Your name (optional)')} value={fullName} onChangeText={setFullName} autoComplete="name" />
      <TextField
        label={tr('Grund (optional)', 'Reason (optional)')}
        value={reason}
        onChangeText={setReason}
        multiline
        hint={tr('Hilft dem Anbieter, sein Angebot zu verbessern.', 'Helps the supplier improve their offer.')}
      />
      <InlineError message={error} />
    </Sheet>
  );
}

export default function PublicQuotationScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const session = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: keys.publicQuotation(token), queryFn: () => api.publicQuotation.get(token), retry: false });
  const [sheet, setSheet] = useState<null | 'accept' | 'reject'>(null);
  const [decision, setDecision] = useState<PublicDecisionResponse | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const close = () => {
    if (router.canGoBack()) router.back();
    // Opened cold via deep link: '/' is a protected route while signed out, so go to the login instead.
    else router.replace(session.status === 'signedIn' ? '/' : '/login');
  };

  const onDecided = (r: PublicDecisionResponse) => {
    setSheet(null);
    setDecision(r);
    void queryClient.invalidateQueries({ queryKey: keys.publicQuotation(token) });
  };

  const header = <Stack.Screen options={{ title: query.data ? `${tr('Angebot', 'Quotation')} ${query.data.number}` : tr('Angebot', 'Quotation'), headerBackVisible: true }} />;

  if (query.isPending) return <Screen>{header}<ListSkeleton rows={3} /></Screen>;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 410);
    return (
      <Screen>
        {header}
        {notFound ? (
          <EmptyState
            icon="link-outline"
            title={tr('Link ungültig oder abgelaufen', 'Link invalid or expired')}
            message={tr(
              'Dieser Angebotslink ist nicht mehr gültig. Bitte wenden Sie sich an den Anbieter für einen neuen Link.',
              'This quotation link is no longer valid. Please contact the supplier for a new link.',
            )}
            actionLabel={session.status === 'signedIn' ? tr('Zur App', 'Go to app') : tr('Schließen', 'Close')}
            onAction={close}
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  const q = query.data;

  if (decision) {
    const accepted = decision.status === 'Accepted';
    return (
      <Screen>
        {header}
        <FormScroll>
          <Card style={styles.confirm} testID="public-confirmation">
            <Ionicons name={accepted ? 'checkmark-circle' : 'close-circle'} size={56} color={accepted ? colors.palette.success.solid : colors.palette.danger.solid} />
            <Text variant="title" align="center" accessibilityRole="header">
              {accepted ? tr('Vielen Dank!', 'Thank you!') : tr('Ablehnung übermittelt', 'Rejection sent')}
            </Text>
            <Text variant="body" tone="secondary" align="center">
              {accepted
                ? tr(
                  `Sie haben das Angebot ${decision.number} am ${formatDateTime(decision.decidedAt)} angenommen. ${decision.companyName} wurde informiert.`,
                  `You accepted quotation ${decision.number} on ${formatDateTime(decision.decidedAt)}. ${decision.companyName} has been notified.`,
                )
                : tr(
                  `Sie haben das Angebot ${decision.number} abgelehnt. ${decision.companyName} wurde informiert.`,
                  `You rejected quotation ${decision.number}. ${decision.companyName} has been notified.`,
                )}
            </Text>
            <Button label={tr('Fertig', 'Done')} onPress={() => setDecision(null)} variant="outline" />
          </Card>
        </FormScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FormScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
        <Card style={styles.gap}>
          <Text variant="caption" tone="secondary">
            {q.companyName}
          </Text>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="secondary">
              {q.number}
            </Text>
            <QuotationStatusBadge status={q.status} />
          </View>
          <Text variant="title" accessibilityRole="header">
            {q.title}
          </Text>
          <Text variant="body">{tr(`für ${q.recipientName}`, `for ${q.recipientName}`)}</Text>
          <Text variant="heading">{formatEur(q.totals.grossTotal)}</Text>
          <Text variant="caption" tone="secondary">
            {tr(
              `vom ${formatDate(q.issueDate)} · gültig bis ${formatDate(q.validUntil)}`,
              `dated ${formatDate(q.issueDate)} · valid until ${formatDate(q.validUntil)}`,
            )}
          </Text>
          {q.decidedAt ? (
            <Text variant="caption" tone={q.status === 'Accepted' ? 'success' : 'danger'}>
              {q.status === 'Accepted'
                ? tr(`Angenommen am ${formatDateTime(q.decidedAt)}`, `Accepted on ${formatDateTime(q.decidedAt)}`)
                : tr(`Abgelehnt am ${formatDateTime(q.decidedAt)}`, `Rejected on ${formatDateTime(q.decidedAt)}`)}
              {q.decisionName ? tr(` von ${q.decisionName}`, ` by ${q.decisionName}`) : ''}
            </Text>
          ) : null}
          {q.isPastValidity && q.status === 'Sent' ? (
            <Text variant="caption" tone="warning">
              {tr(`Die Gültigkeit ist abgelaufen. Bitte wenden Sie sich an ${q.companyName}.`, `The quotation has expired. Please contact ${q.companyName}.`)}
            </Text>
          ) : null}
        </Card>

        {q.canDecide ? (
          <View style={styles.gap}>
            <Button label={tr('Angebot annehmen', 'Accept quotation')} icon="checkmark-circle-outline" onPress={() => setSheet('accept')} testID="public-accept" />
            <Button label={tr('Ablehnen', 'Reject')} icon="close-circle-outline" variant="dangerOutline" onPress={() => setSheet('reject')} testID="public-reject" />
          </View>
        ) : null}
        <Button
          label={tr('PDF öffnen / teilen', 'Open / share PDF')}
          icon="document-attach-outline"
          variant="secondary"
          loading={pdfBusy}
          onPress={async () => {
            setPdfBusy(true);
            try {
              await sharePublicPdf(token, q.number);
            } catch (e) {
              Alert.alert('PDF', e instanceof Error ? e.message : tr('Fehler', 'Error'));
            } finally {
              setPdfBusy(false);
            }
          }}
        />

        {q.introText ? <Text variant="body">{q.introText}</Text> : null}

        <SectionHeader title={tr('Positionen', 'Line items')} />
        {q.lineItems.map((li) => (
          <Card key={li.position} style={styles.gapSm}>
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
            </Text>
          </Card>
        ))}

        <SectionHeader title={tr('Summe', 'Total')} />
        <Card>
          <KeyValue label={tr('Netto', 'Net')} value={formatEur(q.totals.netTotal)} />
          {q.taxMode === 'Standard'
            ? q.totals.taxGroups.map((g) => <KeyValue key={g.ratePercent} label={`${tr('USt.', 'VAT')} ${formatPercent(g.ratePercent)}`} value={formatEur(g.taxAmount)} />)
            : null}
          <Divider spaced />
          <KeyValue label={tr('Gesamt brutto', 'Total gross')} value={formatEur(q.totals.grossTotal)} strong />
        </Card>

        {q.closingText ? <Text variant="body">{q.closingText}</Text> : null}
        {q.paymentTerms ? <KeyValue label={tr('Zahlungsbedingungen', 'Payment terms')} value={q.paymentTerms} /> : null}
        {q.terms ? <KeyValue label={tr('Bedingungen', 'Terms')} value={q.terms} /> : null}

        <SectionHeader title={tr('Anbieter', 'Supplier')} />
        <Card>
          <KeyValue label={tr('Firma', 'Company')} value={[q.companyName, q.companyAddress].filter(Boolean).join('\n')} />
          {q.companyEmail ? <KeyValue label={tr('E-Mail', 'Email')} value={q.companyEmail} /> : null}
          {q.companyPhone ? <KeyValue label={tr('Telefon', 'Phone')} value={q.companyPhone} /> : null}
        </Card>
      </FormScroll>
      <AcceptSheet visible={sheet === 'accept'} onClose={() => setSheet(null)} token={token} q={q} onDone={onDecided} />
      <RejectSheet visible={sheet === 'reject'} onClose={() => setSheet(null)} token={token} onDone={onDecided} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space[2] },
  gapSm: { gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  confirm: { alignItems: 'center', gap: space[3], paddingVertical: space[8] },
});
