import { ApiError, errorMessage, passwordSchema } from '@angebotpilot/api-contracts';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, KeyValue, SectionHeader } from '@/components/Card';
import { TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { LanguageSwitcher } from '@/components/Preferences';
import { Sheet } from '@/components/Sheet';
import { Badge } from '@/components/StatusBadge';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useLocale } from '@/lib/i18n';
import { shareMyDataExport } from '@/lib/pdf';
import { api, clearAfterAccountDeletion, logout, updateUser, useSession } from '@/lib/session';
import { space } from '@/theme';

function NameCard() {
  const { tr } = useLocale();
  const { user } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== (user?.displayName ?? '');
  const save = async () => {
    if (name.trim().length < 2) {
      setError(tr('Bitte Ihren Namen angeben.', 'Please enter your name.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      updateUser(await api.me.update({ displayName: name.trim() }));
      toast(tr('Name gespeichert', 'Name saved'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={styles.card}>
      <TextField label={tr('Anzeigename', 'Display name')} value={name} onChangeText={setName} autoComplete="name" testID="profile-name" />
      <InlineError message={error} />
      <Button label={tr('Name speichern', 'Save name')} variant="outline" onPress={() => void save()} disabled={!dirty} loading={saving} />
    </Card>
  );
}

function PasswordCard() {
  const { tr } = useLocale();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const e: { current?: string; next?: string } = {};
    if (!current) e.current = tr('Bitte aktuelles Passwort eingeben.', 'Please enter your current password.');
    const parsed = passwordSchema.safeParse(next);
    if (!parsed.success) e.next = parsed.error.issues[0]?.message;
    setErrors(e);
    if (e.current || e.next) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.me.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      toast(tr('Passwort geändert', 'Password changed'));
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 400 ? (err.problem.detail ?? tr('Das aktuelle Passwort ist falsch.', 'The current password is incorrect.')) : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={styles.card}>
      <TextField
        label={tr('Aktuelles Passwort', 'Current password')}
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
        secureToggle
        autoComplete="current-password"
        textContentType="password"
      />
      <TextField
        label={tr('Neues Passwort', 'New password')}
        value={next}
        onChangeText={setNext}
        error={errors.next}
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
        hint={tr('Mindestens 10 Zeichen, mit Buchstaben und Ziffern.', 'At least 10 characters, with letters and digits.')}
      />
      <InlineError message={formError} />
      <Button label={tr('Passwort ändern', 'Change password')} variant="outline" onPress={() => void save()} loading={saving} />
    </Card>
  );
}

function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tr } = useLocale();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!password) {
      setError(tr('Bitte geben Sie zur Bestätigung Ihr Passwort ein.', 'Please enter your password to confirm.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.me.delete({ password });
      onClose();
      await clearAfterAccountDeletion();
      Alert.alert(tr('Konto gelöscht', 'Account deleted'), tr('Ihr Konto und Ihre persönlichen Daten wurden gelöscht.', 'Your account and your personal data have been deleted.'));
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
      title={tr('Konto endgültig löschen', 'Delete account permanently')}
      testID="delete-account-sheet"
      footer={<Button label={tr('Konto endgültig löschen', 'Delete account permanently')} variant="danger" icon="trash-outline" onPress={() => void submit()} loading={busy} testID="delete-account-submit" />}
    >
      <Text variant="body">
        {tr(
          'Ihr Benutzerkonto wird gelöscht und Sie werden auf allen Geräten abgemeldet. Dies kann nicht rückgängig gemacht werden.',
          'Your user account will be deleted and you will be signed out on all devices. This cannot be undone.',
        )}
      </Text>
      <Text variant="caption" tone="secondary">
        {tr(
          'Sind Sie alleinige:r Inhaber:in eines Unternehmens mit weiteren Mitgliedern, übertragen Sie die Inhaberschaft bitte zuerst. Geschäftsunterlagen (Angebote, Aufträge) eines Unternehmens unterliegen ggf. gesetzlichen Aufbewahrungspflichten.',
          'If you are the sole owner of a company with other members, please transfer ownership first. A company’s business records (quotations, jobs) may be subject to statutory retention periods.',
        )}
      </Text>
      <TextField label={tr('Passwort zur Bestätigung', 'Password to confirm')} value={password} onChangeText={setPassword} secureToggle autoComplete="current-password" testID="delete-account-password" />
      <InlineError message={error} />
    </Sheet>
  );
}

export default function ProfileScreen() {
  const { tr } = useLocale();
  const { user } = useSession();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      await shareMyDataExport();
      toast(tr('Datenexport erstellt', 'Data export created'));
    } catch (e) {
      Alert.alert(tr('Datenexport', 'Data export'), e instanceof Error ? e.message : tr('Fehler', 'Error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <FormScroll>
        <Card>
          <KeyValue label={tr('E-Mail-Adresse', 'Email address')} value={user?.email ?? ''} />
          <View style={styles.badge}>
            {user?.emailVerified ? (
              <Badge label={tr('E-Mail bestätigt', 'Email verified')} tone="success" icon="checkmark-circle-outline" />
            ) : (
              <Badge label={tr('E-Mail nicht bestätigt', 'Email not verified')} tone="warning" icon="alert-circle-outline" />
            )}
          </View>
        </Card>

        <SectionHeader title={tr('Name', 'Name')} />
        <NameCard />

        <SectionHeader title={tr('Sprache', 'Language')} />
        <Card style={styles.card}>
          <LanguageSwitcher />
          <Text variant="caption" tone="secondary">
            {tr(
              'Gilt für die App und E-Mails an Sie (z. B. Passwort zurücksetzen). Angebote, Rechnungen und E-Mails an Kunden bleiben auf Deutsch.',
              'Applies to the app and emails to you (e.g. password reset). Quotations, invoices and emails to customers stay in German.',
            )}
          </Text>
        </Card>

        <SectionHeader title={tr('Passwort ändern', 'Change password')} />
        <PasswordCard />

        <SectionHeader title={tr('Meine Daten', 'My data')} />
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            {tr(
              'Sie können eine Kopie Ihrer bei AngebotPilot gespeicherten persönlichen Daten (JSON) herunterladen (Art. 15/20 DSGVO). Unternehmensdaten exportieren Inhaber:innen in der Web-App.',
              'You can download a copy of the personal data AngebotPilot stores about you (JSON, Art. 15/20 GDPR). Owners export company data in the web app.',
            )}
          </Text>
          <Button label={tr('Datenexport herunterladen', 'Download data export')} icon="download-outline" variant="outline" onPress={() => void exportData()} loading={exporting} />
        </Card>

        <SectionHeader title={tr('Sitzung', 'Session')} />
        <Card style={styles.card}>
          <Button
            label={tr('Abmelden', 'Sign out')}
            icon="log-out-outline"
            variant="outline"
            loading={loggingOut}
            onPress={() => {
              setLoggingOut(true);
              void logout().finally(() => setLoggingOut(false));
            }}
            testID="profile-logout"
          />
        </Card>

        <SectionHeader title={tr('Konto löschen', 'Delete account')} />
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            {tr('Löscht Ihr Benutzerkonto dauerhaft. Sie benötigen dafür Ihr Passwort.', 'Permanently deletes your user account. You need your password for this.')}
          </Text>
          <Button label={tr('Konto löschen …', 'Delete account …')} icon="trash-outline" variant="dangerOutline" onPress={() => setDeleteOpen(true)} testID="profile-delete" />
        </Card>
      </FormScroll>
      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  badge: { marginTop: space[1] },
});
