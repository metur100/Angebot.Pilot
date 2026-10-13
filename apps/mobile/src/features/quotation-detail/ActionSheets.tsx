import {
  emailSchema, errorMessage, type ConvertToJobRequest, type QuotationDto, type SendMode, type SendQuotationRequest,
} from '@angebotpilot/api-contracts';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField, SegmentedControl, SwitchRow, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { emptyToNull } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { api, useSession } from '@/lib/session';
import { makeStyles, radius, space } from '@/theme';

interface BaseProps {
  visible: boolean;
  onClose: () => void;
  quotation: QuotationDto;
}

/** Sheets keep form state only while open: they are mounted on open, so each opening starts from fresh values. */
function mountWhenVisible<P extends { visible: boolean }>(Component: (props: P) => ReactNode) {
  return function MountWhenVisible(props: P) {
    return props.visible ? <Component {...props} /> : null;
  };
}

export const SendSheet = mountWhenVisible(SendSheetContent);

function SendSheetContent({ visible, onClose, quotation, onSubmit }: BaseProps & { onSubmit: (body: SendQuotationRequest) => Promise<void> }) {
  const { tr } = useLocale();
  const styles = useStyles();
  const { user } = useSession();
  const emailVerified = user?.emailVerified ?? false;
  const [mode, setMode] = useState<SendMode>(emailVerified ? 'Email' : 'Manual');
  const [recipient, setRecipient] = useState(quotation.recipientEmail ?? '');
  // Customer-facing prefill: stays German (the customer and the document are German) even in the English UI.
  const [subject, setSubject] = useState(`Angebot ${quotation.number}${quotation.title ? ` – ${quotation.title}` : ''}`);
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [includePublicLink, setIncludePublicLink] = useState(true);
  const [scheduleFollowUps, setScheduleFollowUps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (mode === 'Email') {
      const parsed = emailSchema.safeParse(recipient);
      if (!parsed.success) {
        setRecipientError(parsed.error.issues[0]?.message);
        return;
      }
    }
    setRecipientError(undefined);
    setBusy(true);
    try {
      await onSubmit({
        mode,
        recipientEmail: mode === 'Email' ? recipient.trim() : null,
        subject: mode === 'Email' ? emptyToNull(subject) : null,
        message: mode === 'Email' ? emptyToNull(message) : null,
        attachPdf: mode === 'Email' ? attachPdf : null,
        includePublicLink,
        scheduleFollowUps,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    try {
      await api.auth.resendVerification();
      setVerificationSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const isResend = quotation.status === 'Sent';
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isResend ? tr('Erneut senden', 'Send again') : tr('Angebot versenden', 'Send quotation')}
      testID="send-sheet"
      footer={
        <Button
          label={mode === 'Email' ? tr('Per E-Mail senden', 'Send by email') : tr('Als versendet markieren', 'Mark as sent')}
          icon={mode === 'Email' ? 'mail-outline' : 'checkmark-done-outline'}
          onPress={() => void submit()}
          loading={busy}
          testID="send-submit"
        />
      }
    >
      <SegmentedControl
        accessibilityLabel={tr('Versandart', 'Delivery method')}
        options={[
          { value: 'Email', label: tr('Per E-Mail', 'By email') },
          { value: 'Manual', label: tr('Selbst übergeben', 'Hand over myself') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'Email' && !emailVerified ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Text variant="caption" tone="warning">
            {tr(
              'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail versendet werden.',
              'Please verify your email address first. Quotations can only be sent by email after that.',
            )}
          </Text>
          <Button
            label={verificationSent ? tr('Bestätigungs-E-Mail gesendet', 'Verification email sent') : tr('Bestätigungs-E-Mail erneut senden', 'Resend verification email')}
            variant="outline"
            size="sm"
            disabled={verificationSent}
            onPress={() => void resendVerification()}
          />
        </View>
      ) : null}
      {mode === 'Email' ? (
        <>
          <TextField label={tr('Empfänger', 'Recipient')} value={recipient} onChangeText={setRecipient} error={recipientError} keyboardType="email-address" autoCapitalize="none" testID="send-recipient" />
          <TextField label={tr('Betreff', 'Subject')} value={subject} onChangeText={setSubject} />
          <TextField
            label={tr('Nachricht (optional)', 'Message (optional)')}
            value={message}
            onChangeText={setMessage}
            multiline
            hint={tr('Ohne Eingabe wird der Standardtext verwendet.', 'If left empty, the standard (German) text is used.')}
          />
          <SwitchRow label={tr('PDF anhängen', 'Attach PDF')} value={attachPdf} onChange={setAttachPdf} />
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          {tr(
            'Sie übergeben das Angebot selbst (z. B. ausgedruckt oder per eigener Mail). Es wird als versendet markiert; Erinnerungen und Kundenlink funktionieren wie beim E-Mail-Versand.',
            'You hand over the quotation yourself (e.g. printed or by your own email). It is marked as sent; reminders and the customer link work just like with email delivery.',
          )}
        </Text>
      )}
      <SwitchRow
        label={tr('Kundenlink einfügen', 'Include customer link')}
        description={tr('Kunde kann online ansehen, annehmen oder ablehnen.', 'The customer can view, accept or reject online.')}
        value={includePublicLink}
        onChange={setIncludePublicLink}
      />
      <SwitchRow
        label={tr('Automatische Erinnerungen planen', 'Schedule automatic reminders')}
        description={tr('Gemäß den Nachfass-Einstellungen Ihres Unternehmens.', 'According to your company’s follow-up settings.')}
        value={scheduleFollowUps}
        onChange={setScheduleFollowUps}
      />
      <InlineError message={error} />
    </Sheet>
  );
}

export const DecisionSheet = mountWhenVisible(DecisionSheetContent);

function DecisionSheetContent({
  visible, onClose, quotation, kind, onSubmit,
}: BaseProps & { kind: 'accept' | 'reject'; onSubmit: (note: string | null) => Promise<void> }) {
  const { tr } = useLocale();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = kind === 'accept';
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(emptyToNull(note));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={accept ? tr('Annahme erfassen', 'Record acceptance') : tr('Ablehnung erfassen', 'Record rejection')}
      testID="decision-sheet"
      footer={
        <Button
          label={accept ? tr('Als angenommen speichern', 'Save as accepted') : tr('Als abgelehnt speichern', 'Save as rejected')}
          variant={accept ? 'primary' : 'danger'}
          icon={accept ? 'checkmark-circle-outline' : 'close-circle-outline'}
          onPress={() => void submit()}
          loading={busy}
          testID="decision-submit"
        />
      }
    >
      <Text variant="body" tone="secondary">
        {accept
          ? tr(
            `Der Kunde hat ${quotation.number} angenommen (z. B. telefonisch oder per Mail).${quotation.status === 'Expired' ? ' Das Angebot ist bereits abgelaufen – die Annahme wird als nachträgliche Annahme erfasst.' : ''}`,
            `The customer accepted ${quotation.number} (e.g. by phone or email).${quotation.status === 'Expired' ? ' The quotation has already expired – this is recorded as a late acceptance.' : ''}`,
          )
          : tr(
            `Der Kunde hat ${quotation.number} abgelehnt. Geplante Erinnerungen werden beendet.`,
            `The customer rejected ${quotation.number}. Scheduled reminders are stopped.`,
          )}
      </Text>
      <TextField
        label={tr('Notiz (optional)', 'Note (optional)')}
        value={note}
        onChangeText={setNote}
        multiline
        hint={tr('z. B. „Telefonisch am 12.10. zugesagt“', 'e.g. “Confirmed by phone on 12 Oct”')}
        testID="decision-note"
      />
      <InlineError message={error} />
    </Sheet>
  );
}

export const CancelSheet = mountWhenVisible(CancelSheetContent);

function CancelSheetContent({ visible, onClose, quotation, onSubmit }: BaseProps & { onSubmit: (reason: string | null) => Promise<void> }) {
  const { tr } = useLocale();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(emptyToNull(reason));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('Angebot stornieren', 'Cancel quotation')}
      footer={<Button label={tr('Stornieren', 'Cancel quotation')} variant="danger" icon="ban-outline" onPress={() => void submit()} loading={busy} testID="cancel-submit" />}
    >
      <Text variant="body" tone="secondary">
        {tr(
          `${quotation.number} wird storniert. Kundenlink und Erinnerungen werden deaktiviert. Die Nummer bleibt vergeben.`,
          `${quotation.number} will be cancelled. The customer link and reminders are deactivated. The number remains assigned.`,
        )}
      </Text>
      <TextField label={tr('Grund (optional)', 'Reason (optional)')} value={reason} onChangeText={setReason} multiline />
      <InlineError message={error} />
    </Sheet>
  );
}

export const ConvertSheet = mountWhenVisible(ConvertSheetContent);

function ConvertSheetContent({ visible, onClose, quotation, onSubmit }: BaseProps & { onSubmit: (body: ConvertToJobRequest) => Promise<void> }) {
  const { tr } = useLocale();
  const styles = useStyles();
  const [title, setTitle] = useState(quotation.title);
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (start && due && due < start) {
      setError(tr('Das Fälligkeitsdatum muss nach dem geplanten Start liegen.', 'The due date must be after the planned start.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title: emptyToNull(title), plannedStartDate: start || null, dueDate: due || null, notes: emptyToNull(notes) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('In Auftrag umwandeln', 'Convert to job')}
      testID="convert-sheet"
      footer={<Button label={tr('Auftrag anlegen', 'Create job')} icon="briefcase-outline" onPress={() => void submit()} loading={busy} testID="convert-submit" />}
    >
      <TextField label={tr('Titel des Auftrags', 'Job title')} value={title} onChangeText={setTitle} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <DateField label={tr('Geplanter Start', 'Planned start')} value={start} onChange={setStart} onClear={() => setStart('')} />
        </View>
        <View style={styles.flex}>
          <DateField label={tr('Fällig am', 'Due on')} value={due} onChange={setDue} onClear={() => setDue('')} minimumDate={start || undefined} />
        </View>
      </View>
      <TextField label={tr('Notizen (optional)', 'Notes (optional)')} value={notes} onChangeText={setNotes} multiline />
      <InlineError message={error} />
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  notice: {
    gap: space[2], padding: space[3], borderRadius: radius.lg, backgroundColor: colors.palette.warning.bg,
    borderWidth: 1, borderColor: colors.palette.warning.border,
  },
}));
