import { errorMessage, formatDate, formatDateTime, formatEur, jobStatusLabel, type JobDto, type JobStatus } from '@angebotpilot/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, type IconName } from '@/components/Button';
import { Card, KeyValue, SectionHeader } from '@/components/Card';
import { InvoiceLinkCard } from '@/components/EntityCards';
import { DateField, SelectField, TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { JobStatusBadge } from '@/components/StatusBadge';
import { ErrorState, InlineError, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { emptyToNull, isConflict } from '@/lib/forms';
import { invalidateInvoiceData, keys, useJob } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { space, touch } from '@/theme';

const statusAction: Record<JobStatus, { label: string; icon: IconName }> = {
  Open: { label: 'Wieder öffnen', icon: 'refresh-outline' },
  InProgress: { label: 'Arbeit beginnen', icon: 'construct-outline' },
  Completed: { label: 'Abschließen', icon: 'checkmark-done-outline' },
  Cancelled: { label: 'Stornieren', icon: 'ban-outline' },
};

interface Draft {
  title: string;
  description: string;
  plannedStartDate: string;
  dueDate: string;
  notes: string;
  assignedUserId: string;
}

function toDraft(job: JobDto): Draft {
  return {
    title: job.title, description: job.description ?? '', plannedStartDate: job.plannedStartDate ?? '', dueDate: job.dueDate ?? '',
    notes: job.notes ?? '', assignedUserId: job.assignedUserId ?? '',
  };
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useCompanyId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const job = useJob(id);
  const members = useQuery({ queryKey: ['c', companyId, 'members'], queryFn: () => api.companies.members(companyId), retry: false, staleTime: 5 * 60_000 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState<JobStatus | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const j = job.data;

  /** Creates an invoice draft prefilled from the job (line items of its quotation) and opens it for editing. */
  const createInvoice = async () => {
    if (!j) return;
    setCreatingInvoice(true);
    try {
      const draft = await api.jobs.createInvoice(companyId, j.id);
      invalidateInvoiceData(queryClient, companyId, draft);
      void queryClient.invalidateQueries({ queryKey: keys.job(companyId, j.id) });
      toast('Rechnungsentwurf angelegt');
      router.push({ pathname: '/invoice-editor', params: { id: draft.id, created: '1' } });
    } catch (e) {
      Alert.alert('Rechnung konnte nicht erstellt werden', errorMessage(e));
    } finally {
      setCreatingInvoice(false);
    }
  };

  const apply = (updated: JobDto) => {
    queryClient.setQueryData(keys.job(companyId, updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: keys.jobs(companyId) });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard(companyId) });
  };

  const changeStatus = async (status: JobStatus) => {
    if (!j) return;
    setChanging(status);
    try {
      apply(await api.jobs.changeStatus(companyId, j.id, { status }));
      toast(`Status: ${jobStatusLabel[status]}`);
    } catch (e) {
      Alert.alert('Statuswechsel fehlgeschlagen', errorMessage(e));
    } finally {
      setChanging(null);
    }
  };

  const confirmStatus = (status: JobStatus) => {
    if (status === 'Cancelled') {
      Alert.alert('Auftrag stornieren?', 'Der Auftrag kann später wieder geöffnet werden.', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Stornieren', style: 'destructive', onPress: () => void changeStatus(status) },
      ]);
    } else {
      void changeStatus(status);
    }
  };

  const save = async () => {
    if (!j || !draft) return;
    if (!draft.title.trim()) {
      setError('Bitte einen Titel angeben.');
      return;
    }
    if (draft.plannedStartDate && draft.dueDate && draft.dueDate < draft.plannedStartDate) {
      setError('Das Fälligkeitsdatum muss nach dem geplanten Start liegen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.jobs.update(companyId, j.id, {
        title: draft.title.trim(),
        description: emptyToNull(draft.description),
        plannedStartDate: draft.plannedStartDate || null,
        dueDate: draft.dueDate || null,
        notes: emptyToNull(draft.notes),
        assignedUserId: draft.assignedUserId || null,
        rowVersion: j.rowVersion,
      });
      apply(updated);
      setEditing(false);
      toast('Auftrag gespeichert');
    } catch (e) {
      if (isConflict(e)) {
        setError('Der Auftrag wurde zwischenzeitlich geändert. Ihre Eingaben wurden verworfen und die aktuelle Fassung geladen.');
        setEditing(false);
        void job.refetch();
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };

  if (job.isPending) return <Screen><ListSkeleton rows={3} /></Screen>;
  if (job.isError || !j) {
    return (
      <Screen>
        <ErrorState error={job.error} onRetry={() => void job.refetch()} />
      </Screen>
    );
  }

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const memberOptions = [
    { value: '', label: 'Niemand zugewiesen' },
    ...(members.data ?? []).filter((m) => m.status === 'Active').map((m) => ({ value: m.userId, label: m.displayName, description: m.email })),
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: j.number }} />
      <FormScroll refreshing={job.isRefetching} onRefresh={editing ? undefined : () => void job.refetch()}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="secondary">
              {j.number}
            </Text>
            <JobStatusBadge status={j.status} />
          </View>
          <Text variant="title" accessibilityRole="header">
            {j.title}
          </Text>
          <Pressable accessibilityRole="link" accessibilityLabel={`Kunde ${j.customerName} öffnen`} onPress={() => router.push(`/customer/${j.customerId}`)} style={styles.link}>
            <Text variant="bodyStrong" tone="brand">
              {j.customerName}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={`Angebot ${j.quotationNumber} öffnen`} onPress={() => router.push(`/quotation/${j.quotationId}`)} style={styles.link}>
            <Text variant="body" tone="brand">
              aus Angebot {j.quotationNumber} · {formatEur(j.quotationNetTotal)} netto
            </Text>
          </Pressable>
        </Card>

        {j.allowedTransitions.length > 0 ? (
          <>
            <SectionHeader title="Status ändern" />
            <View style={styles.statusButtons}>
              {j.allowedTransitions.map((s, i) => (
                <Button
                  key={s}
                  label={statusAction[s].label}
                  icon={statusAction[s].icon}
                  variant={s === 'Cancelled' ? 'dangerOutline' : i === 0 ? 'primary' : 'outline'}
                  onPress={() => confirmStatus(s)}
                  loading={changing === s}
                  testID={`job-status-${s}`}
                />
              ))}
            </View>
          </>
        ) : null}

        <SectionHeader title={`Rechnungen (${j.invoices.length})`} />
        <View style={styles.invoices} testID="job-invoices">
          {j.invoices.length === 0 ? (
            <Text variant="caption" tone="muted">
              Noch keine Rechnung zu diesem Auftrag.
            </Text>
          ) : null}
          {j.invoices.map((inv) => (
            <InvoiceLinkCard key={inv.id} item={inv} />
          ))}
          <Button
            label="Rechnung erstellen"
            icon="receipt-outline"
            variant={j.invoices.length === 0 && j.status === 'Completed' ? 'primary' : 'outline'}
            onPress={() => void createInvoice()}
            loading={creatingInvoice}
            accessibilityHint="Legt einen Rechnungsentwurf mit den Positionen des Angebots an"
            testID="job-create-invoice"
          />
        </View>

        <SectionHeader
          title="Details"
          action={
            !editing ? (
              <Button label="Bearbeiten" icon="create-outline" variant="ghost" size="sm" fullWidth={false} onPress={() => { setDraft(toDraft(j)); setEditing(true); }} testID="job-edit" />
            ) : null
          }
        />
        <InlineError message={error} />
        {editing && draft ? (
          <Card style={styles.form}>
            <TextField label="Titel" value={draft.title} onChangeText={set('title')} required testID="job-title" />
            <TextField label="Beschreibung" value={draft.description} onChangeText={set('description')} multiline />
            <View style={styles.row}>
              <View style={styles.flex}>
                <DateField label="Geplanter Start" value={draft.plannedStartDate} onChange={set('plannedStartDate')} onClear={() => set('plannedStartDate')('')} />
              </View>
              <View style={styles.flex}>
                <DateField label="Fällig am" value={draft.dueDate} onChange={set('dueDate')} onClear={() => set('dueDate')('')} />
              </View>
            </View>
            {members.data ? (
              <SelectField label="Zuständig" value={draft.assignedUserId} options={memberOptions} onChange={set('assignedUserId')} />
            ) : null}
            <TextField label="Notizen" value={draft.notes} onChangeText={set('notes')} multiline />
            <View style={styles.row}>
              <Button
                label="Abbrechen"
                variant="outline"
                onPress={() => {
                  setEditing(false);
                  setDraft(toDraft(j));
                  setError(null);
                }}
                style={styles.flex}
              />
              <Button label="Speichern" icon="save-outline" onPress={() => void save()} loading={saving} style={styles.flex} testID="job-save" />
            </View>
          </Card>
        ) : (
          <Card>
            {j.description ? <KeyValue label="Beschreibung" value={j.description} /> : null}
            <KeyValue label="Geplanter Start" value={formatDate(j.plannedStartDate)} />
            <KeyValue label="Fällig am" value={formatDate(j.dueDate)} />
            <KeyValue label="Zuständig" value={j.assignedUserName ?? '–'} />
            <KeyValue label="Auftragswert" value={`${formatEur(j.quotationNetTotal)} netto · ${formatEur(j.quotationGrossTotal)} brutto`} />
            {j.notes ? <KeyValue label="Notizen" value={j.notes} /> : null}
            <KeyValue label="Angelegt" value={formatDateTime(j.createdAt)} />
            {j.startedAt ? <KeyValue label="Begonnen" value={formatDateTime(j.startedAt)} /> : null}
            {j.completedAt ? <KeyValue label="Abgeschlossen" value={formatDateTime(j.completedAt)} /> : null}
            {j.cancelledAt ? <KeyValue label="Storniert" value={formatDateTime(j.cancelledAt)} /> : null}
          </Card>
        )}
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space[2] },
  form: { gap: space[4] },
  row: { flexDirection: 'row', gap: space[3] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { minHeight: touch, justifyContent: 'center', alignSelf: 'flex-start' },
  statusButtons: { gap: space[2] },
  invoices: { gap: space[3] },
});
