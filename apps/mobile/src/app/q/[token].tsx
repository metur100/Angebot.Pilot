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
import { sharePublicPdf } from '@/lib/pdf';
import { keys } from '@/lib/queries';
import { api, useSession } from '@/lib/session';
import { colors, space } from '@/theme';

function AcceptSheet({ visible, onClose, token, q, onDone }: { visible: boolean; onClose: () => void; token: string; q: PublicQuotationDto; onDone: (r: PublicDecisionResponse) => void }) {
  const [fullName, setFullName] = useState('');
  const [binding, setBinding] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; binding?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: typeof errors = {};
    if (fullName.trim().length < 2) e.fullName = 'Bitte vollständigen Namen angeben.';
    if (!binding) e.binding = 'Bitte bestätigen Sie die verbindliche Annahme.';
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
      title="Angebot annehmen"
      testID="public-accept-sheet"
      footer={<Button label="Verbindlich annehmen" icon="checkmark-circle-outline" onPress={() => void submit()} loading={busy} testID="public-accept-submit" />}
    >
      <Text variant="body" tone="secondary">
        Sie nehmen das Angebot {q.number} von {q.companyName} über {formatEur(q.totals.grossTotal)} an.
      </Text>
      <TextField label="Vor- und Nachname" value={fullName} onChangeText={setFullName} error={errors.fullName} autoComplete="name" required testID="public-fullname" />
      <TextField label="Nachricht (optional)" value={note} onChangeText={setNote} multiline />
      <Checkbox
        label="Ich nehme dieses Angebot verbindlich an."
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
      title="Angebot ablehnen"
      footer={<Button label="Ablehnen" variant="danger" icon="close-circle-outline" onPress={() => void submit()} loading={busy} testID="public-reject-submit" />}
    >
      <TextField label="Ihr Name (optional)" value={fullName} onChangeText={setFullName} autoComplete="name" />
      <TextField label="Grund (optional)" value={reason} onChangeText={setReason} multiline hint="Hilft dem Anbieter, sein Angebot zu verbessern." />
      <InlineError message={error} />
    </Sheet>
  );
}

export default function PublicQuotationScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
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

  const header = <Stack.Screen options={{ title: query.data ? `Angebot ${query.data.number}` : 'Angebot', headerBackVisible: true }} />;

  if (query.isPending) return <Screen>{header}<ListSkeleton rows={3} /></Screen>;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 410);
    return (
      <Screen>
        {header}
        {notFound ? (
          <EmptyState
            icon="link-outline"
            title="Link ungültig oder abgelaufen"
            message="Dieser Angebotslink ist nicht mehr gültig. Bitte wenden Sie sich an den Anbieter für einen neuen Link."
            actionLabel={session.status === 'signedIn' ? 'Zur App' : 'Schließen'}
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
              {accepted ? 'Vielen Dank!' : 'Ablehnung übermittelt'}
            </Text>
            <Text variant="body" tone="secondary" align="center">
              {accepted
                ? `Sie haben das Angebot ${decision.number} am ${formatDateTime(decision.decidedAt)} angenommen. ${decision.companyName} wurde informiert.`
                : `Sie haben das Angebot ${decision.number} abgelehnt. ${decision.companyName} wurde informiert.`}
            </Text>
            <Button label="Fertig" onPress={() => setDecision(null)} variant="outline" />
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
          <Text variant="body">für {q.recipientName}</Text>
          <Text variant="heading">{formatEur(q.totals.grossTotal)}</Text>
          <Text variant="caption" tone="secondary">
            vom {formatDate(q.issueDate)} · gültig bis {formatDate(q.validUntil)}
          </Text>
          {q.decidedAt ? (
            <Text variant="caption" tone={q.status === 'Accepted' ? 'success' : 'danger'}>
              {q.status === 'Accepted' ? 'Angenommen' : 'Abgelehnt'} am {formatDateTime(q.decidedAt)}
              {q.decisionName ? ` von ${q.decisionName}` : ''}
            </Text>
          ) : null}
          {q.isPastValidity && q.status === 'Sent' ? (
            <Text variant="caption" tone="warning">
              Die Gültigkeit ist abgelaufen. Bitte wenden Sie sich an {q.companyName}.
            </Text>
          ) : null}
        </Card>

        {q.canDecide ? (
          <View style={styles.gap}>
            <Button label="Angebot annehmen" icon="checkmark-circle-outline" onPress={() => setSheet('accept')} testID="public-accept" />
            <Button label="Ablehnen" icon="close-circle-outline" variant="dangerOutline" onPress={() => setSheet('reject')} testID="public-reject" />
          </View>
        ) : null}
        <Button
          label="PDF öffnen / teilen"
          icon="document-attach-outline"
          variant="secondary"
          loading={pdfBusy}
          onPress={async () => {
            setPdfBusy(true);
            try {
              await sharePublicPdf(token, q.number);
            } catch (e) {
              Alert.alert('PDF', e instanceof Error ? e.message : 'Fehler');
            } finally {
              setPdfBusy(false);
            }
          }}
        />

        {q.introText ? <Text variant="body">{q.introText}</Text> : null}

        <SectionHeader title="Positionen" />
        {q.lineItems.map((li) => (
          <Card key={li.position} style={styles.gapSm}>
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
            </Text>
          </Card>
        ))}

        <SectionHeader title="Summe" />
        <Card>
          <KeyValue label="Netto" value={formatEur(q.totals.netTotal)} />
          {q.taxMode === 'Standard'
            ? q.totals.taxGroups.map((g) => <KeyValue key={g.ratePercent} label={`USt. ${formatPercent(g.ratePercent)}`} value={formatEur(g.taxAmount)} />)
            : null}
          <Divider spaced />
          <KeyValue label="Gesamt brutto" value={formatEur(q.totals.grossTotal)} strong />
        </Card>

        {q.closingText ? <Text variant="body">{q.closingText}</Text> : null}
        {q.paymentTerms ? <KeyValue label="Zahlungsbedingungen" value={q.paymentTerms} /> : null}
        {q.terms ? <KeyValue label="Bedingungen" value={q.terms} /> : null}

        <SectionHeader title="Anbieter" />
        <Card>
          <KeyValue label="Firma" value={[q.companyName, q.companyAddress].filter(Boolean).join('\n')} />
          {q.companyEmail ? <KeyValue label="E-Mail" value={q.companyEmail} /> : null}
          {q.companyPhone ? <KeyValue label="Telefon" value={q.companyPhone} /> : null}
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
