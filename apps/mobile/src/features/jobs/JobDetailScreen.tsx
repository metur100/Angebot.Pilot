import { errorMessage, formatDate, formatDateTime, formatEur, jobStatusLabel, tr, type JobDto, type JobStatus } from '@angebotpilot/api-contracts';
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
import { useLocale } from '@/lib/i18n';
import { invalidateInvoiceData, keys, useJob } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { space, touch } from '@/theme';

function statusAction(status: JobStatus): { label: string; icon: IconName } {
  switch (status) {
    case 'Open':
      return { label: tr('Wieder öffnen', 'Reopen'), icon: 'refresh-outline' };
    case 'InProgress':
      return { label: tr('Arbeit beginnen', 'Start work'), icon: 'construct-outline' };
    case 'Completed':
      return { label: tr('Abschließen', 'Complete'), icon: 'checkmark-done-outline' };
    case 'Cancelled':
      return { label: tr('Stornieren', 'Cancel job'), icon: 'ban-outline' };
  }
}

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
  const { tr } = useLocale();
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
      toast(tr('Rechnungsentwurf angelegt', 'Draft invoice created'));
      router.push({ pathname: '/invoice-editor', params: { id: draft.id, created: '1' } });
    } catch (e) {
      Alert.alert(tr('Rechnung konnte nicht erstellt werden', 'Invoice could not be created'), errorMessage(e));
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
      Alert.alert(tr('Statuswechsel fehlgeschlagen', 'Status change failed'), errorMessage(e));
    } finally {
      setChanging(null);
    }
  };

  const confirmStatus = (status: JobStatus) => {
    if (status === 'Cancelled') {
      Alert.alert(tr('Auftrag stornieren?', 'Cancel job?'), tr('Der Auftrag kann später wieder geöffnet werden.', 'The job can be reopened later.'), [
        { text: tr('Abbrechen', 'Back'), style: 'cancel' },
        { text: tr('Stornieren', 'Cancel job'), style: 'destructive', onPress: () => void changeStatus(status) },
      ]);
    } else {
      void changeStatus(status);
    }
  };

  const save = async () => {
    if (!j || !draft) return;
    if (!draft.title.trim()) {
      setError(tr('Bitte einen Titel angeben.', 'Please enter a title.'));
      return;
    }
    if (draft.plannedStartDate && draft.dueDate && draft.dueDate < draft.plannedStartDate) {
      setError(tr('Das Fälligkeitsdatum muss nach dem geplanten Start liegen.', 'The due date must be after the planned start.'));
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
      toast(tr('Auftrag gespeichert', 'Job saved'));
    } catch (e) {
      if (isConflict(e)) {
        setError(
          tr(
            'Der Auftrag wurde zwischenzeitlich geändert. Ihre Eingaben wurden verworfen und die aktuelle Fassung geladen.',
            'The job was changed in the meantime. Your entries were discarded and the current version has been loaded.',
          ),
        );
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
    { value: '', label: tr('Niemand zugewiesen', 'Unassigned') },
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
          <Pressable accessibilityRole="link" accessibilityLabel={tr(`Kunde ${j.customerName} öffnen`, `Open customer ${j.customerName}`)} onPress={() => router.push(`/customer/${j.customerId}`)} style={styles.link}>
            <Text variant="bodyStrong" tone="brand">
              {j.customerName}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={tr(`Angebot ${j.quotationNumber} öffnen`, `Open quotation ${j.quotationNumber}`)} onPress={() => router.push(`/quotation/${j.quotationId}`)} style={styles.link}>
            <Text variant="body" tone="brand">
              {tr(
                `aus Angebot ${j.quotationNumber} · ${formatEur(j.quotationNetTotal)} netto`,
                `from quotation ${j.quotationNumber} · ${formatEur(j.quotationNetTotal)} net`,
              )}
            </Text>
          </Pressable>
        </Card>

        {j.allowedTransitions.length > 0 ? (
          <>
            <SectionHeader title={tr('Status ändern', 'Change status')} />
            <View style={styles.statusButtons}>
              {j.allowedTransitions.map((s, i) => (
                <Button
                  key={s}
                  label={statusAction(s).label}
                  icon={statusAction(s).icon}
                  variant={s === 'Cancelled' ? 'dangerOutline' : i === 0 ? 'primary' : 'outline'}
                  onPress={() => confirmStatus(s)}
                  loading={changing === s}
                  testID={`job-status-${s}`}
                />
              ))}
            </View>
          </>
        ) : null}

        <SectionHeader title={`${tr('Rechnungen', 'Invoices')} (${j.invoices.length})`} />
        <View style={styles.invoices} testID="job-invoices">
          {j.invoices.length === 0 ? (
            <Text variant="caption" tone="muted">
              {tr('Noch keine Rechnung zu diesem Auftrag.', 'No invoice for this job yet.')}
            </Text>
          ) : null}
          {j.invoices.map((inv) => (
            <InvoiceLinkCard key={inv.id} item={inv} />
          ))}
          <Button
            label={tr('Rechnung erstellen', 'Create invoice')}
            icon="receipt-outline"
            variant={j.invoices.length === 0 && j.status === 'Completed' ? 'primary' : 'outline'}
            onPress={() => void createInvoice()}
            loading={creatingInvoice}
            accessibilityHint={tr('Legt einen Rechnungsentwurf mit den Positionen des Angebots an', 'Creates a draft invoice with the line items of the quotation')}
            testID="job-create-invoice"
          />
        </View>

        <SectionHeader
          title={tr('Details', 'Details')}
          action={
            !editing ? (
              <Button label={tr('Bearbeiten', 'Edit')} icon="create-outline" variant="ghost" size="sm" fullWidth={false} onPress={() => { setDraft(toDraft(j)); setEditing(true); }} testID="job-edit" />
            ) : null
          }
        />
        <InlineError message={error} />
        {editing && draft ? (
          <Card style={styles.form}>
            <TextField label={tr('Titel', 'Title')} value={draft.title} onChangeText={set('title')} required testID="job-title" />
            <TextField label={tr('Beschreibung', 'Description')} value={draft.description} onChangeText={set('description')} multiline />
            <View style={styles.row}>
              <View style={styles.flex}>
                <DateField label={tr('Geplanter Start', 'Planned start')} value={draft.plannedStartDate} onChange={set('plannedStartDate')} onClear={() => set('plannedStartDate')('')} />
              </View>
              <View style={styles.flex}>
                <DateField label={tr('Fällig am', 'Due on')} value={draft.dueDate} onChange={set('dueDate')} onClear={() => set('dueDate')('')} />
              </View>
            </View>
            {members.data ? (
              <SelectField label={tr('Zuständig', 'Assigned to')} value={draft.assignedUserId} options={memberOptions} onChange={set('assignedUserId')} />
            ) : null}
            <TextField label={tr('Notizen', 'Notes')} value={draft.notes} onChangeText={set('notes')} multiline />
            <View style={styles.row}>
              <Button
                label={tr('Abbrechen', 'Cancel')}
                variant="outline"
                onPress={() => {
                  setEditing(false);
                  setDraft(toDraft(j));
                  setError(null);
                }}
                style={styles.flex}
              />
              <Button label={tr('Speichern', 'Save')} icon="save-outline" onPress={() => void save()} loading={saving} style={styles.flex} testID="job-save" />
            </View>
          </Card>
        ) : (
          <Card>
            {j.description ? <KeyValue label={tr('Beschreibung', 'Description')} value={j.description} /> : null}
            <KeyValue label={tr('Geplanter Start', 'Planned start')} value={formatDate(j.plannedStartDate)} />
            <KeyValue label={tr('Fällig am', 'Due on')} value={formatDate(j.dueDate)} />
            <KeyValue label={tr('Zuständig', 'Assigned to')} value={j.assignedUserName ?? '–'} />
            <KeyValue
              label={tr('Auftragswert', 'Job value')}
              value={tr(
                `${formatEur(j.quotationNetTotal)} netto · ${formatEur(j.quotationGrossTotal)} brutto`,
                `${formatEur(j.quotationNetTotal)} net · ${formatEur(j.quotationGrossTotal)} gross`,
              )}
            />
            {j.notes ? <KeyValue label={tr('Notizen', 'Notes')} value={j.notes} /> : null}
            <KeyValue label={tr('Angelegt', 'Created')} value={formatDateTime(j.createdAt)} />
            {j.startedAt ? <KeyValue label={tr('Begonnen', 'Started')} value={formatDateTime(j.startedAt)} /> : null}
            {j.completedAt ? <KeyValue label={tr('Abgeschlossen', 'Completed')} value={formatDateTime(j.completedAt)} /> : null}
            {j.cancelledAt ? <KeyValue label={tr('Storniert', 'Cancelled')} value={formatDateTime(j.cancelledAt)} /> : null}
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
