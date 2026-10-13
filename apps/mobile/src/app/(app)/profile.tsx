import { ApiError, errorMessage, passwordSchema } from '@angebotpilot/api-contracts';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, KeyValue, SectionHeader } from '@/components/Card';
import { TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { Badge } from '@/components/StatusBadge';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { shareMyDataExport } from '@/lib/pdf';
import { api, clearAfterAccountDeletion, logout, updateUser, useSession } from '@/lib/session';
import { space } from '@/theme';

function NameCard() {
  const { user } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== (user?.displayName ?? '');
  const save = async () => {
    if (name.trim().length < 2) {
      setError('Bitte Ihren Namen angeben.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      updateUser(await api.me.update({ displayName: name.trim() }));
      toast('Name gespeichert');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={styles.card}>
      <TextField label="Anzeigename" value={name} onChangeText={setName} autoComplete="name" testID="profile-name" />
      <InlineError message={error} />
      <Button label="Name speichern" variant="outline" onPress={() => void save()} disabled={!dirty} loading={saving} />
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const e: { current?: string; next?: string } = {};
    if (!current) e.current = 'Bitte aktuelles Passwort eingeben.';
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
      toast('Passwort geändert');
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 400 ? (err.problem.detail ?? 'Das aktuelle Passwort ist falsch.') : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={styles.card}>
      <TextField label="Aktuelles Passwort" value={current} onChangeText={setCurrent} error={errors.current} secureToggle autoComplete="current-password" textContentType="password" />
      <TextField label="Neues Passwort" value={next} onChangeText={setNext} error={errors.next} secureToggle autoComplete="new-password" textContentType="newPassword" hint="Mindestens 10 Zeichen, mit Buchstaben und Ziffern." />
      <InlineError message={formError} />
      <Button label="Passwort ändern" variant="outline" onPress={() => void save()} loading={saving} />
    </Card>
  );
}

function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!password) {
      setError('Bitte geben Sie zur Bestätigung Ihr Passwort ein.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.me.delete({ password });
      onClose();
      await clearAfterAccountDeletion();
      Alert.alert('Konto gelöscht', 'Ihr Konto und Ihre persönlichen Daten wurden gelöscht.');
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
      title="Konto endgültig löschen"
      testID="delete-account-sheet"
      footer={<Button label="Konto endgültig löschen" variant="danger" icon="trash-outline" onPress={() => void submit()} loading={busy} testID="delete-account-submit" />}
    >
      <Text variant="body">
        Ihr Benutzerkonto wird gelöscht und Sie werden auf allen Geräten abgemeldet. Dies kann nicht rückgängig gemacht werden.
      </Text>
      <Text variant="caption" tone="secondary">
        Sind Sie alleinige:r Inhaber:in eines Unternehmens mit weiteren Mitgliedern, übertragen Sie die Inhaberschaft bitte zuerst.
        Geschäftsunterlagen (Angebote, Aufträge) eines Unternehmens unterliegen ggf. gesetzlichen Aufbewahrungspflichten.
      </Text>
      <TextField label="Passwort zur Bestätigung" value={password} onChangeText={setPassword} secureToggle autoComplete="current-password" testID="delete-account-password" />
      <InlineError message={error} />
    </Sheet>
  );
}

export default function ProfileScreen() {
  const { user } = useSession();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      await shareMyDataExport();
      toast('Datenexport erstellt');
    } catch (e) {
      Alert.alert('Datenexport', e instanceof Error ? e.message : 'Fehler');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <FormScroll>
        <Card>
          <KeyValue label="E-Mail-Adresse" value={user?.email ?? ''} />
          <View style={styles.badge}>
            {user?.emailVerified ? (
              <Badge label="E-Mail bestätigt" tone="success" icon="checkmark-circle-outline" />
            ) : (
              <Badge label="E-Mail nicht bestätigt" tone="warning" icon="alert-circle-outline" />
            )}
          </View>
        </Card>

        <SectionHeader title="Name" />
        <NameCard />

        <SectionHeader title="Passwort ändern" />
        <PasswordCard />

        <SectionHeader title="Meine Daten" />
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            Sie können eine Kopie Ihrer bei AngebotPilot gespeicherten persönlichen Daten (JSON) herunterladen (Art. 15/20 DSGVO).
            Unternehmensdaten exportieren Inhaber:innen in der Web-App.
          </Text>
          <Button label="Datenexport herunterladen" icon="download-outline" variant="outline" onPress={() => void exportData()} loading={exporting} />
        </Card>

        <SectionHeader title="Sitzung" />
        <Card style={styles.card}>
          <Button
            label="Abmelden"
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

        <SectionHeader title="Konto löschen" />
        <Card style={styles.card}>
          <Text variant="caption" tone="secondary">
            Löscht Ihr Benutzerkonto dauerhaft. Sie benötigen dafür Ihr Passwort.
          </Text>
          <Button label="Konto löschen …" icon="trash-outline" variant="dangerOutline" onPress={() => setDeleteOpen(true)} testID="profile-delete" />
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
