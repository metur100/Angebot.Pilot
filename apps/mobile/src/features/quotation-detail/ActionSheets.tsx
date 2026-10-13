import {
  emailSchema, errorMessage, type ConvertToJobRequest, type QuotationDto, type SendMode, type SendQuotationRequest,
} from '@angebotpilot/api-contracts';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField, SegmentedControl, SwitchRow, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { emptyToNull } from '@/lib/forms';
import { api, useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme';

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
  const { user } = useSession();
  const emailVerified = user?.emailVerified ?? false;
  const [mode, setMode] = useState<SendMode>(emailVerified ? 'Email' : 'Manual');
  const [recipient, setRecipient] = useState(quotation.recipientEmail ?? '');
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
      title={isResend ? 'Erneut senden' : 'Angebot versenden'}
      testID="send-sheet"
      footer={
        <Button
          label={mode === 'Email' ? 'Per E-Mail senden' : 'Als versendet markieren'}
          icon={mode === 'Email' ? 'mail-outline' : 'checkmark-done-outline'}
          onPress={() => void submit()}
          loading={busy}
          testID="send-submit"
        />
      }
    >
      <SegmentedControl
        accessibilityLabel="Versandart"
        options={[
          { value: 'Email', label: 'Per E-Mail' },
          { value: 'Manual', label: 'Selbst übergeben' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'Email' && !emailVerified ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Text variant="caption" tone="warning">
            Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail versendet werden.
          </Text>
          <Button
            label={verificationSent ? 'Bestätigungs-E-Mail gesendet' : 'Bestätigungs-E-Mail erneut senden'}
            variant="outline"
            size="sm"
            disabled={verificationSent}
            onPress={() => void resendVerification()}
          />
        </View>
      ) : null}
      {mode === 'Email' ? (
        <>
          <TextField label="Empfänger" value={recipient} onChangeText={setRecipient} error={recipientError} keyboardType="email-address" autoCapitalize="none" testID="send-recipient" />
          <TextField label="Betreff" value={subject} onChangeText={setSubject} />
          <TextField label="Nachricht (optional)" value={message} onChangeText={setMessage} multiline hint="Ohne Eingabe wird der Standardtext verwendet." />
          <SwitchRow label="PDF anhängen" value={attachPdf} onChange={setAttachPdf} />
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          Sie übergeben das Angebot selbst (z. B. ausgedruckt oder per eigener Mail). Es wird als versendet markiert; Erinnerungen
          und Kundenlink funktionieren wie beim E-Mail-Versand.
        </Text>
      )}
      <SwitchRow label="Kundenlink einfügen" description="Kunde kann online ansehen, annehmen oder ablehnen." value={includePublicLink} onChange={setIncludePublicLink} />
      <SwitchRow label="Automatische Erinnerungen planen" description="Gemäß den Nachfass-Einstellungen Ihres Unternehmens." value={scheduleFollowUps} onChange={setScheduleFollowUps} />
      <InlineError message={error} />
    </Sheet>
  );
}

export const DecisionSheet = mountWhenVisible(DecisionSheetContent);

function DecisionSheetContent({
  visible, onClose, quotation, kind, onSubmit,
}: BaseProps & { kind: 'accept' | 'reject'; onSubmit: (note: string | null) => Promise<void> }) {
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
      title={accept ? 'Annahme erfassen' : 'Ablehnung erfassen'}
      testID="decision-sheet"
      footer={
        <Button
          label={accept ? 'Als angenommen speichern' : 'Als abgelehnt speichern'}
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
          ? `Der Kunde hat ${quotation.number} angenommen (z. B. telefonisch oder per Mail).${quotation.status === 'Expired' ? ' Das Angebot ist bereits abgelaufen – die Annahme wird als nachträgliche Annahme erfasst.' : ''}`
          : `Der Kunde hat ${quotation.number} abgelehnt. Geplante Erinnerungen werden beendet.`}
      </Text>
      <TextField label="Notiz (optional)" value={note} onChangeText={setNote} multiline hint="z. B. „Telefonisch am 12.10. zugesagt“" testID="decision-note" />
      <InlineError message={error} />
    </Sheet>
  );
}

export const CancelSheet = mountWhenVisible(CancelSheetContent);

function CancelSheetContent({ visible, onClose, quotation, onSubmit }: BaseProps & { onSubmit: (reason: string | null) => Promise<void> }) {
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
      title="Angebot stornieren"
      footer={<Button label="Stornieren" variant="danger" icon="ban-outline" onPress={() => void submit()} loading={busy} testID="cancel-submit" />}
    >
      <Text variant="body" tone="secondary">
        {quotation.number} wird storniert. Kundenlink und Erinnerungen werden deaktiviert. Die Nummer bleibt vergeben.
      </Text>
      <TextField label="Grund (optional)" value={reason} onChangeText={setReason} multiline />
      <InlineError message={error} />
    </Sheet>
  );
}

export const ConvertSheet = mountWhenVisible(ConvertSheetContent);

function ConvertSheetContent({ visible, onClose, quotation, onSubmit }: BaseProps & { onSubmit: (body: ConvertToJobRequest) => Promise<void> }) {
  const [title, setTitle] = useState(quotation.title);
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (start && due && due < start) {
      setError('Das Fälligkeitsdatum muss nach dem geplanten Start liegen.');
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
      title="In Auftrag umwandeln"
      testID="convert-sheet"
      footer={<Button label="Auftrag anlegen" icon="briefcase-outline" onPress={() => void submit()} loading={busy} testID="convert-submit" />}
    >
      <TextField label="Titel des Auftrags" value={title} onChangeText={setTitle} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <DateField label="Geplanter Start" value={start} onChange={setStart} onClear={() => setStart('')} />
        </View>
        <View style={styles.flex}>
          <DateField label="Fällig am" value={due} onChange={setDue} onClear={() => setDue('')} minimumDate={start || undefined} />
        </View>
      </View>
      <TextField label="Notizen (optional)" value={notes} onChangeText={setNotes} multiline />
      <InlineError message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  notice: {
    gap: space[2], padding: space[3], borderRadius: radius.lg, backgroundColor: colors.palette.warning.bg,
    borderWidth: 1, borderColor: colors.palette.warning.border,
  },
});
