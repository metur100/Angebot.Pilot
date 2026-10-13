// Bottom sheets for the invoice actions: issue (Rechnung stellen), send, record payment, payment reminder and cancel.
import {
  emailSchema, errorMessage, formatDate, formatDateTime, formatEur, paymentMethodSuggestions, todayIso, tr,
  type InvoiceDto, type PaymentReminderRequest, type RecordPaymentRequest, type SendInvoiceRequest, type SendMode,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField, SegmentedControl, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { emptyToNull } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { formatInvoiceAmount, invoiceLabel } from '@/lib/invoices';
import { exampleAmount, fromInput, roundTo, toMoneyInput } from '@/lib/numbers';
import { api, useSession } from '@/lib/session';
import { makeStyles, radius, space, useTheme } from '@/theme';

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
  const { colors } = useTheme();
  const styles = useStyles();
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
  const { tr } = useLocale();
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
        {tr(
          `Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können ${what} per E-Mail versendet werden.`,
          `Please verify your email address first. Only then can ${what} be sent by email.`,
        )}
      </Text>
      <Button
        label={sent ? tr('Bestätigungs-E-Mail gesendet', 'Verification email sent') : tr('Bestätigungs-E-Mail erneut senden', 'Resend verification email')}
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
  const { tr } = useLocale();
  const styles = useStyles();
  const { busy, error, run } = useSubmit();
  const problems = invoice.issueProblems;
  const blocked = problems.length > 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('Rechnung stellen', 'Issue invoice')}
      testID="issue-sheet"
      footer={
        <>
          <Button
            label={tr('Jetzt verbindlich stellen', 'Issue now (final)')}
            icon="checkmark-done-outline"
            onPress={() => void run(onSubmit)}
            loading={busy}
            disabled={blocked}
            accessibilityHint={blocked ? tr('Erst möglich, wenn alle Angaben vollständig sind', 'Only possible once all details are complete') : undefined}
            testID="issue-submit"
          />
          {blocked && onEdit ? <Button label={tr('Entwurf bearbeiten', 'Edit draft')} icon="create-outline" variant="outline" onPress={onEdit} testID="issue-edit" /> : null}
        </>
      }
    >
      <Text variant="body" tone="secondary">
        {tr(
          'Beim Stellen erhält die Rechnung die nächste fortlaufende Rechnungsnummer. Danach ist sie endgültig: Sie kann nicht mehr bearbeitet oder gelöscht werden – Korrekturen sind nur noch über eine Stornorechnung möglich.',
          'When issued, the invoice receives the next sequential invoice number. It is then final: it can no longer be edited or deleted – corrections are only possible with a cancellation invoice.',
        )}
      </Text>
      <View style={styles.summary}>
        <Text variant="bodyStrong">{invoice.recipientName}</Text>
        <Text variant="caption" tone="secondary">
          {tr(
            `Rechnungsdatum ${formatDate(invoice.issueDate)} · fällig am ${formatDate(invoice.dueDate)}`,
            `Invoice date ${formatDate(invoice.issueDate)} · due on ${formatDate(invoice.dueDate)}`,
          )}
        </Text>
        <Text variant="heading">{formatInvoiceAmount(invoice.totals.grossTotal, invoice.kind)}</Text>
      </View>
      <Text variant="caption" tone="muted">
        {tr(
          'Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931) und wird zusammen mit der XML-Datei unveränderbar gespeichert.',
          'The PDF contains the e-invoice in ZUGFeRD format (EN 16931) and is stored unalterably together with the XML file.',
        )}
      </Text>
      {blocked ? (
        <Notice tone="warning" testID="issue-sheet-problems">
          <Text variant="bodyStrong" tone="warning">
            {tr('Noch nicht möglich – bitte ergänzen:', 'Not possible yet – please complete:')}
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

/** Customer-facing prefill: stays German (the customer and the document are German) even in the English UI. */
function defaultSubject(invoice: InvoiceDto): string {
  const label = `${invoice.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'} ${invoice.number ?? ''}`.trim();
  return invoice.title ? `${label} – ${invoice.title}` : label;
}

function InvoiceSendSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (body: SendInvoiceRequest) => Promise<void> }) {
  const { tr } = useLocale();
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
      title={invoice.sentAt ? tr('Rechnung erneut senden', 'Send invoice again') : tr('Rechnung senden', 'Send invoice')}
      testID="invoice-send-sheet"
      footer={
        <Button
          label={mode === 'Email' ? tr('Per E-Mail senden', 'Send by email') : tr('Als versendet markieren', 'Mark as sent')}
          icon={mode === 'Email' ? 'mail-outline' : 'checkmark-done-outline'}
          onPress={submit}
          loading={busy}
          testID="invoice-send-submit"
        />
      }
    >
      <SegmentedControl
        accessibilityLabel={tr('Versandart', 'Delivery method')}
        options={[
          { value: 'Email', label: tr('Per E-Mail', 'By email') },
          { value: 'Manual', label: tr('Anderweitig übermittelt', 'Delivered otherwise') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'Email' && !emailVerified ? <EmailVerificationNotice what={tr('Rechnungen', 'invoices')} /> : null}
      {mode === 'Email' ? (
        <>
          <TextField
            label={tr('Empfänger', 'Recipient')}
            value={recipient}
            onChangeText={setRecipient}
            error={recipientError}
            keyboardType="email-address"
            autoCapitalize="none"
            required
            testID="invoice-send-recipient"
          />
          <TextField label={tr('Betreff', 'Subject')} value={subject} onChangeText={setSubject} testID="invoice-send-subject" />
          <TextField
            label={tr('Nachricht (optional)', 'Message (optional)')}
            value={message}
            onChangeText={setMessage}
            multiline
            hint={tr('Ohne Eingabe wird der Standardtext verwendet.', 'If left empty, the standard (German) text is used.')}
          />
          <Text variant="caption" tone="muted">
            {tr('Angehängt wird das Rechnungs-PDF mit eingebetteter E-Rechnung (ZUGFeRD).', 'The invoice PDF with the embedded e-invoice (ZUGFeRD) is attached.')}
          </Text>
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          {tr(
            'Sie haben die Rechnung selbst übermittelt (z. B. ausgedruckt, per eigener E-Mail oder über ein Portal). Sie wird als versendet markiert; Zahlungserinnerungen funktionieren wie beim E-Mail-Versand.',
            'You delivered the invoice yourself (e.g. printed, by your own email or via a portal). It is marked as sent; payment reminders work just like with email delivery.',
          )}
        </Text>
      )}
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Zahlung erfassen ----------
export const PaymentSheet = mountWhenVisible(PaymentSheetContent);

/** Parses the amount input (UI notation) and checks it against the open amount. */
export function validatePaymentAmount(input: string, openAmount: number): { amount?: number; error?: string } {
  const value = fromInput(input);
  if (value === null) return { error: tr('Bitte Betrag angeben.', 'Please enter an amount.') };
  if (Number.isNaN(value)) return { error: tr(`Bitte einen Betrag eingeben, z. B. ${exampleAmount()}.`, `Please enter an amount, e.g. ${exampleAmount()}.`) };
  const amount = roundTo(value, 2);
  if (amount <= 0) return { error: tr('Der Betrag muss größer als 0 € sein.', 'The amount must be greater than €0.') };
  if (amount > roundTo(openAmount, 2)) return { error: tr(`Höchstens der offene Betrag von ${formatEur(openAmount)}.`, `At most the open amount of ${formatEur(openAmount)}.`) };
  return { amount };
}

function PaymentSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (body: RecordPaymentRequest) => Promise<void> }) {
  const { tr } = useLocale();
  const styles = useStyles();
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
      title={tr('Zahlung erfassen', 'Record payment')}
      testID="payment-sheet"
      footer={<Button label={tr('Zahlung speichern', 'Save payment')} icon="cash-outline" onPress={submit} loading={busy} testID="payment-submit" />}
    >
      <Text variant="body" tone="secondary">
        {tr(
          `Offen: ${formatEur(invoice.openAmount)} von ${formatEur(invoice.totals.grossTotal)}. Bei vollständiger Zahlung wird die Rechnung als bezahlt markiert, sonst als teilweise bezahlt.`,
          `Open: ${formatEur(invoice.openAmount)} of ${formatEur(invoice.totals.grossTotal)}. If paid in full, the invoice is marked as paid, otherwise as partially paid.`,
        )}
      </Text>
      <TextField
        label={tr('Betrag (€)', 'Amount (€)')}
        value={amount}
        onChangeText={setAmount}
        error={amountError}
        keyboardType="decimal-pad"
        placeholder={toMoneyInput(0)}
        required
        testID="payment-amount"
      />
      <DateField label={tr('Zahlungsdatum', 'Payment date')} value={paidOn} onChange={setPaidOn} required testID="payment-date" />
      <TextField label={tr('Zahlungsart', 'Payment method')} value={method} onChangeText={setMethod} testID="payment-method" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {paymentMethodSuggestions.map((m) => {
          const active = method === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={tr(`Zahlungsart ${m}`, `Payment method ${m}`)}
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
      <TextField label={tr('Notiz (optional)', 'Note (optional)')} value={note} onChangeText={setNote} multiline testID="payment-note" />
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Zahlungserinnerung ----------
export const RemindSheet = mountWhenVisible(RemindSheetContent);

function RemindSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (body: PaymentReminderRequest) => Promise<void> }) {
  const { tr } = useLocale();
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
      title={tr('Zahlungserinnerung senden', 'Send payment reminder')}
      testID="remind-sheet"
      footer={<Button label={tr('Erinnerung senden', 'Send reminder')} icon="alarm-outline" onPress={submit} loading={busy} testID="remind-submit" />}
    >
      <Text variant="body" tone="secondary">
        {invoiceLabel(invoice)} · {tr(`offen ${formatEur(invoice.openAmount)} · fällig am ${formatDate(invoice.dueDate)}`, `${formatEur(invoice.openAmount)} open · due on ${formatDate(invoice.dueDate)}`)}
        {invoice.isOverdue ? tr(` (seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} überfällig)`, ` (${days} ${days === 1 ? 'day' : 'days'} overdue)`) : ''}
      </Text>
      {invoice.reminderCount > 0 ? (
        <Text variant="caption" tone="muted">
          {tr(
            `Bisher ${invoice.reminderCount} ${invoice.reminderCount === 1 ? 'Erinnerung' : 'Erinnerungen'}`,
            `${invoice.reminderCount} ${invoice.reminderCount === 1 ? 'reminder' : 'reminders'} so far`,
          )}
          {invoice.lastReminderAt ? tr(`, zuletzt am ${formatDateTime(invoice.lastReminderAt)}`, `, last on ${formatDateTime(invoice.lastReminderAt)}`) : ''}.
        </Text>
      ) : null}
      {!user?.emailVerified ? <EmailVerificationNotice what={tr('Zahlungserinnerungen', 'payment reminders')} /> : null}
      <TextField
        label={tr('Empfänger', 'Recipient')}
        value={recipient}
        onChangeText={setRecipient}
        error={recipientError}
        keyboardType="email-address"
        autoCapitalize="none"
        required
        testID="remind-recipient"
      />
      <TextField
        label={tr('Nachricht (optional)', 'Message (optional)')}
        value={message}
        onChangeText={setMessage}
        multiline
        hint={tr('Ohne Eingabe wird ein freundlicher Standardtext verwendet.', 'If left empty, a friendly standard (German) text is used.')}
      />
      <InlineError message={error} />
    </Sheet>
  );
}

// ---------- Stornieren ----------
export const InvoiceCancelSheet = mountWhenVisible(InvoiceCancelSheetContent);

function InvoiceCancelSheetContent({ visible, onClose, invoice, onSubmit }: BaseProps & { onSubmit: (reason: string | null) => Promise<void> }) {
  const { tr } = useLocale();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('Rechnung stornieren', 'Cancel invoice')}
      testID="invoice-cancel-sheet"
      footer={
        <Button
          label={tr('Stornorechnung erstellen', 'Create cancellation invoice')}
          variant="danger"
          icon="ban-outline"
          onPress={() => void run(() => onSubmit(emptyToNull(reason)))}
          loading={busy}
          testID="invoice-cancel-submit"
        />
      }
    >
      <Text variant="body" tone="secondary">
        {tr(
          `Für ${invoiceLabel(invoice)} wird eine Stornorechnung mit eigener Rechnungsnummer über ${formatInvoiceAmount(invoice.totals.grossTotal, 'Cancellation')} erstellt. Die ursprüngliche Rechnung wird als storniert markiert; geplante Zahlungserinnerungen werden abgebrochen. Dieser Schritt kann nicht rückgängig gemacht werden.`,
          `A cancellation invoice with its own invoice number for ${formatInvoiceAmount(invoice.totals.grossTotal, 'Cancellation')} will be created for ${invoiceLabel(invoice)}. The original invoice is marked as cancelled; scheduled payment reminders are stopped. This step cannot be undone.`,
        )}
      </Text>
      {invoice.paidAmount > 0 ? (
        <Notice tone="info">
          <Text variant="caption" tone="secondary">
            {tr(
              `Es wurden bereits ${formatEur(invoice.paidAmount)} gezahlt. Bitte erstatten bzw. verrechnen Sie den Betrag mit Ihrem Kunden.`,
              `${formatEur(invoice.paidAmount)} has already been paid. Please refund or offset the amount with your customer.`,
            )}
          </Text>
        </Notice>
      ) : null}
      <TextField
        label={tr('Grund (optional)', 'Reason (optional)')}
        value={reason}
        onChangeText={setReason}
        multiline
        hint={tr('Erscheint auf der Stornorechnung.', 'Printed on the cancellation invoice (enter it in German).')}
        testID="invoice-cancel-reason"
      />
      <InlineError message={error} />
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  notice: { flexDirection: 'row', gap: space[2], padding: space[3], borderRadius: radius.lg, borderWidth: 1 },
  noticeBody: { flex: 1, gap: space[1] },
  summary: { gap: 2, padding: space[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  chips: { gap: space[2], paddingVertical: space[1] },
  chip: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.full, borderWidth: 1,
    borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder },
}));
