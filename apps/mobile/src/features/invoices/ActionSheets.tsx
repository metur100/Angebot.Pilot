// Bottom sheets for the invoice actions: issue (Rechnung stellen), send, record payment, payment reminder and cancel.
import {
  emailSchema, errorMessage, formatDate, formatDateTime, formatEur, paymentMethodSuggestions, todayIso,
  type InvoiceDto, type PaymentReminderRequest, type RecordPaymentRequest, type SendInvoiceRequest, type SendMode,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField, SegmentedControl, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { emptyToNull } from '@/lib/forms';
import { formatInvoiceAmount, invoiceLabel } from '@/lib/invoices';
import { fromInput, roundTo, toMoneyInput } from '@/lib/numbers';
import { api, useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme';

interface BaseProps {
  visible: boolean;
  onClose: () => void;
  invoice: InvoiceDto;
}

/** Sheets keep form state only while open: they are mounted on open, so each opening starts from fresh values. */
function mountWhenVisible<P extends { visible: boolean }>(Component: (props: P) => ReactNode) {
  return function MountWhenVisible(props: P) {
    return props.visible ? <Component {...props} /> : null;
  };
}

/** Runs an async submit with busy/error state; errors are shown inline in the sheet. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

type NoticeTone = 'warning' | 'info';

function Notice({ tone, children, testID }: { tone: NoticeTone; children: ReactNode; testID?: string }) {
  const c = colors.palette[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: c.bg, borderColor: c.border }]}
      accessibilityRole={tone === 'warning' ? 'alert' : undefined}
      testID={testID}
    >
      <Ionicons name={tone === 'warning' ? 'alert-circle-outline' : 'information-circle-outline'} size={20} color={c.text} />
      <View style={styles.noticeBody}>{children}</View>
    </View>
  );
}

function EmailVerificationNotice({ what }: { what: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resend = async () => {
    try {
      await api.auth.resendVerification();
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Notice tone="warning">
      <Text variant="caption" tone="warning">
        Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können {what} per E-Mail versendet werden.
      </Text>
      <Button
        label={sent ? 'Bestätigungs-E-Mail gesendet' : 'Bestätigungs-E-Mail erneut senden'}
        variant="outline"
        size="sm"
        disabled={sent}
        onPress={() => void resend()}
      />
      <InlineError message={error} />
    </Notice>
  );
}

// ---------- Rechnung stellen ----------
export const IssueSheet = mountWhenVisible(IssueSheetContent);

function IssueSheetContent({ visible, onClose, invoice, onSubmit, onEdit }: BaseProps & { onSubmit: () => Promise<void>; onEdit?: () => void }) {
  const { busy, error, run } = useSubmit();
  const problems = invoice.issueProblems;
  const blocked = problems.length > 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Rechnung stellen"
      testID="issue-sheet"
      footer={
        <>
          <Button
            label="Jetzt verbindlich stellen"
            icon="checkmark-done-outline"
            onPress={() => void run(onSubmit)}
            loading={busy}
            disabled={blocked}
            accessibilityHint={blocked ? 'Erst möglich, wenn alle Angaben vollständig sind' : undefined}
            testID="issue-submit"
          />
          {blocked && onEdit ? <Button label="Entwurf bearbeiten" icon="create-outline" variant="outline" onPress={onEdit} testID="issue-edit" /> : null}
        </>
      }
    >
      <Text variant="body" tone="secondary">
        Beim Stellen erhält die Rechnung die nächste fortlaufende Rechnungsnummer. Danach ist sie endgültig: Sie kann nicht mehr
        bearbeitet oder gelöscht werden – Korrekturen sind nur noch über eine Stornorechnung möglich.
      </Text>
      <View style={styles.summary}>
        <Text variant="bodyStrong">{invoice.recipientName}</Text>
        <Text variant="caption" tone="secondary">
          Rechnungsdatum {formatDate(invoice.issueDate)} · fällig am {formatDate(invoice.dueDate)}
        </Text>
        <Text variant="heading">{formatInvoiceAmount(invoice.totals.grossTotal, invoice.kind)}</Text>
      </View>
      <Text variant="caption" tone="muted">
        Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931) und wird zusammen mit der XML-Datei unveränderbar gespeichert.
      </Text>
      {blocked ? (
        <Notice tone="warning" testID="issue-sheet-problems">
          <Text variant="bodyStrong" tone="warning">
            Noch nicht möglich – bitte ergänzen:
          </Text>
          {problems.map((p) => (
            <Text key={p} variant="caption" tone="warning">
              • {p}
            </Text>
          ))}
        </Notice>
      ) : null}
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Senden ----------
export const InvoiceSendSheet = mountWhenVisible(InvoiceSendSheetContent);

function defaultSubject(invoice: InvoiceDto): string {
  const label = invoice.kind === 'Cancellation' ? invoiceLabel(invoice) : `Rechnung ${invoice.number ?? ''}`.trim();
  return invoice.title ? `${label} – ${invoice.title}` : label;
}

function InvoiceSendSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (body: SendInvoiceRequest) => Promise<void> }) {
  const { user } = useSession();
  const emailVerified = user?.emailVerified ?? false;
  const [mode, setMode] = useState<SendMode>(emailVerified ? 'Email' : 'Manual');
  const [recipient, setRecipient] = useState(invoice.recipientEmail ?? '');
  const [subject, setSubject] = useState(defaultSubject(invoice));
  const [message, setMessage] = useState('');
  const [recipientError, setRecipientError] = useState<string | undefined>();
  const { busy, error, run } = useSubmit();

  const submit = () => {
    if (mode === 'Email') {
      const parsed = emailSchema.safeParse(recipient);
      if (!parsed.success) {
        setRecipientError(parsed.error.issues[0]?.message);
        return;
      }
    }
    setRecipientError(undefined);
    const body: SendInvoiceRequest =
      mode === 'Email' ? { mode, recipientEmail: recipient.trim(), subject: emptyToNull(subject), message: emptyToNull(message) } : { mode };
    void run(() => onSubmit(body));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={invoice.sentAt ? 'Rechnung erneut senden' : 'Rechnung senden'}
      testID="invoice-send-sheet"
      footer={
        <Button
          label={mode === 'Email' ? 'Per E-Mail senden' : 'Als versendet markieren'}
          icon={mode === 'Email' ? 'mail-outline' : 'checkmark-done-outline'}
          onPress={submit}
          loading={busy}
          testID="invoice-send-submit"
        />
      }
    >
      <SegmentedControl
        accessibilityLabel="Versandart"
        options={[
          { value: 'Email', label: 'Per E-Mail' },
          { value: 'Manual', label: 'Anderweitig übermittelt' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'Email' && !emailVerified ? <EmailVerificationNotice what="Rechnungen" /> : null}
      {mode === 'Email' ? (
        <>
          <TextField
            label="Empfänger"
            value={recipient}
            onChangeText={setRecipient}
            error={recipientError}
            keyboardType="email-address"
            autoCapitalize="none"
            required
            testID="invoice-send-recipient"
          />
          <TextField label="Betreff" value={subject} onChangeText={setSubject} testID="invoice-send-subject" />
          <TextField label="Nachricht (optional)" value={message} onChangeText={setMessage} multiline hint="Ohne Eingabe wird der Standardtext verwendet." />
          <Text variant="caption" tone="muted">
            Angehängt wird das Rechnungs-PDF mit eingebetteter E-Rechnung (ZUGFeRD).
          </Text>
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          Sie haben die Rechnung selbst übermittelt (z. B. ausgedruckt, per eigener E-Mail oder über ein Portal). Sie wird als
          versendet markiert; Zahlungserinnerungen funktionieren wie beim E-Mail-Versand.
        </Text>
      )}
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Zahlung erfassen ----------
export const PaymentSheet = mountWhenVisible(PaymentSheetContent);

/** Parses the German amount input and checks it against the open amount. */
export function validatePaymentAmount(input: string, openAmount: number): { amount?: number; error?: string } {
  const value = fromInput(input);
  if (value === null) return { error: 'Bitte Betrag angeben.' };
  if (Number.isNaN(value)) return { error: 'Bitte einen Betrag eingeben, z. B. 1.234,56.' };
  const amount = roundTo(value, 2);
  if (amount <= 0) return { error: 'Der Betrag muss größer als 0 € sein.' };
  if (amount > roundTo(openAmount, 2)) return { error: `Höchstens der offene Betrag von ${formatEur(openAmount)}.` };
  return { amount };
}

function PaymentSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (body: RecordPaymentRequest) => Promise<void> }) {
  const [amount, setAmount] = useState(toMoneyInput(invoice.openAmount));
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState(paymentMethodSuggestions[0] ?? '');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const { busy, error, run } = useSubmit();

  const submit = () => {
    const result = validatePaymentAmount(amount, invoice.openAmount);
    setAmountError(result.error);
    const value = result.amount;
    if (value === undefined) return;
    void run(() => onSubmit({ amount: value, paidOn, method: emptyToNull(method), note: emptyToNull(note) }));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Zahlung erfassen"
      testID="payment-sheet"
      footer={<Button label="Zahlung speichern" icon="cash-outline" onPress={submit} loading={busy} testID="payment-submit" />}
    >
      <Text variant="body" tone="secondary">
        Offen: {formatEur(invoice.openAmount)} von {formatEur(invoice.totals.grossTotal)}. Bei vollständiger Zahlung wird die Rechnung als
        bezahlt markiert, sonst als teilweise bezahlt.
      </Text>
      <TextField
        label="Betrag (€)"
        value={amount}
        onChangeText={setAmount}
        error={amountError}
        keyboardType="decimal-pad"
        placeholder="0,00"
        required
        testID="payment-amount"
      />
      <DateField label="Zahlungsdatum" value={paidOn} onChange={setPaidOn} required testID="payment-date" />
      <TextField label="Zahlungsart" value={method} onChangeText={setMethod} testID="payment-method" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {paymentMethodSuggestions.map((m) => {
          const active = method === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`Zahlungsart ${m}`}
              accessibilityState={{ selected: active }}
              onPress={() => setMethod(m)}
              style={[styles.chip, active ? styles.chipActive : null]}
              testID={`payment-method-${m}`}
            >
              <Text variant="caption" tone={active ? 'brand' : 'secondary'}>
                {m}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextField label="Notiz (optional)" value={note} onChangeText={setNote} multiline testID="payment-note" />
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Zahlungserinnerung ----------
export const RemindSheet = mountWhenVisible(RemindSheetContent);

function RemindSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (body: PaymentReminderRequest) => Promise<void> }) {
  const { user } = useSession();
  const [recipient, setRecipient] = useState(invoice.recipientEmail ?? '');
  const [message, setMessage] = useState('');
  const [recipientError, setRecipientError] = useState<string | undefined>();
  const { busy, error, run } = useSubmit();
  const submit = () => {
    const parsed = emailSchema.safeParse(recipient);
    if (!parsed.success) {
      setRecipientError(parsed.error.issues[0]?.message);
      return;
    }
    setRecipientError(undefined);
    void run(() => onSubmit({ recipientEmail: recipient.trim(), message: emptyToNull(message) }));
  };
  const days = invoice.daysOverdue;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Zahlungserinnerung senden"
      testID="remind-sheet"
      footer={<Button label="Erinnerung senden" icon="alarm-outline" onPress={submit} loading={busy} testID="remind-submit" />}
    >
      <Text variant="body" tone="secondary">
        {invoiceLabel(invoice)} · offen {formatEur(invoice.openAmount)} · fällig am {formatDate(invoice.dueDate)}
        {invoice.isOverdue ? ` (seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} überfällig)` : ''}
      </Text>
      {invoice.reminderCount > 0 ? (
        <Text variant="caption" tone="muted">
          Bisher {invoice.reminderCount} {invoice.reminderCount === 1 ? 'Erinnerung' : 'Erinnerungen'}
          {invoice.lastReminderAt ? `, zuletzt am ${formatDateTime(invoice.lastReminderAt)}` : ''}.
        </Text>
      ) : null}
      {!user?.emailVerified ? <EmailVerificationNotice what="Zahlungserinnerungen" /> : null}
      <TextField
        label="Empfänger"
        value={recipient}
        onChangeText={setRecipient}
        error={recipientError}
        keyboardType="email-address"
        autoCapitalize="none"
        required
        testID="remind-recipient"
      />
      <TextField label="Nachricht (optional)" value={message} onChangeText={setMessage} multiline hint="Ohne Eingabe wird ein freundlicher Standardtext verwendet." />
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Stornieren ----------
export const InvoiceCancelSheet = mountWhenVisible(InvoiceCancelSheetContent);

function InvoiceCancelSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (reason: string | null) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Rechnung stornieren"
      testID="invoice-cancel-sheet"
      footer={
        <Button
          label="Stornorechnung erstellen"
          variant="danger"
          icon="ban-outline"
          onPress={() => void run(() => onSubmit(emptyToNull(reason)))}
          loading={busy}
          testID="invoice-cancel-submit"
        />
      }
    >
      <Text variant="body" tone="secondary">
        Für {invoiceLabel(invoice)} wird eine Stornorechnung mit eigener Rechnungsnummer über{' '}
        {formatInvoiceAmount(invoice.totals.grossTotal, 'Cancellation')} erstellt. Die ursprüngliche Rechnung wird als storniert markiert;
        geplante Zahlungserinnerungen werden abgebrochen. Dieser Schritt kann nicht rückgängig gemacht werden.
      </Text>
      {invoice.paidAmount > 0 ? (
        <Notice tone="info">
          <Text variant="caption" tone="secondary">
            Es wurden bereits {formatEur(invoice.paidAmount)} gezahlt. Bitte erstatten bzw. verrechnen Sie den Betrag mit Ihrem Kunden.
          </Text>
        </Notice>
      ) : null}
      <TextField label="Grund (optional)" value={reason} onChangeText={setReason} multiline hint="Erscheint auf der Stornorechnung." testID="invoice-cancel-reason" />
      <InlineError message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: space[2], padding: space[3], borderRadius: radius.lg, borderWidth: 1 },
  noticeBody: { flex: 1, gap: space[1] },
  summary: { gap: 2, padding: space[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  chips: { gap: space[2], paddingVertical: space[1] },
  chip: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.full, borderWidth: 1,
    borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder },
});
