import { jobStatusLabel, todayIso, type JobDto, type JobStatus, type UpdateJobRequest } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Ban, CircleCheck, Play, ReceiptText, RefreshCw, RotateCcw, Save, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { useCompany, useMembers } from '@/app/company';
import { UnsavedChangesGuard } from '@/components/domain/Common';
import { JobStatusBadge } from '@/components/ui/Badge';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, DetailList } from '@/components/ui/Card';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { InvoiceLinkList, useCreateInvoiceFrom } from '@/features/invoices/shared';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, hasFieldErrors, isConflict, isForbidden } from '@/lib/errors';
import { daysUntil, formatDate, formatDateTime, formatEur, getDisplayTimeZone } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

const optionalText = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen.`);
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Ungültiges Datum.');

const jobSchema = z
  .object({
    title: z.string().trim().min(1, 'Bitte Titel angeben.').max(200, 'Maximal 200 Zeichen.'),
    description: optionalText(4000),
    plannedStartDate: optionalDate,
    dueDate: optionalDate,
    assignedUserId: z.string(),
    notes: optionalText(4000),
  })
  .refine((v) => !v.plannedStartDate || !v.dueDate || v.dueDate >= v.plannedStartDate, {
    path: ['dueDate'],
    message: 'Das Fälligkeitsdatum muss nach dem geplanten Start liegen.',
  });

type JobFormInput = z.input<typeof jobSchema>;
type JobFormOutput = z.output<typeof jobSchema>;

const knownFields = ['title', 'description', 'plannedStartDate', 'dueDate', 'assignedUserId', 'notes'];

const nullIfEmpty = (value: string) => (value.trim() ? value.trim() : null);

function jobToForm(job: JobDto): JobFormInput {
  return {
    title: job.title,
    description: job.description ?? '',
    plannedStartDate: job.plannedStartDate ?? '',
    dueDate: job.dueDate ?? '',
    assignedUserId: job.assignedUserId ?? '',
    notes: job.notes ?? '',
  };
}

function toRequest(values: JobFormOutput, rowVersion: string): UpdateJobRequest {
  return {
    title: values.title.trim(),
    description: nullIfEmpty(values.description),
    plannedStartDate: values.plannedStartDate || null,
    dueDate: values.dueDate || null,
    assignedUserId: values.assignedUserId || null,
    notes: nullIfEmpty(values.notes),
    rowVersion,
  };
}

interface TransitionAction {
  status: JobStatus;
  label: string;
  icon: LucideIcon;
  variant: ButtonVariant;
}

/** Buttons for the allowed status transitions, in display order. */
export function transitionActions(current: JobStatus, allowed: readonly JobStatus[]): TransitionAction[] {
  const actions: TransitionAction[] = [];
  if (allowed.includes('Open')) {
    actions.push({ status: 'Open', label: current === 'Cancelled' ? 'Wieder öffnen' : 'Zurück auf „Offen“', icon: RotateCcw, variant: 'secondary' });
  }
  if (allowed.includes('InProgress')) {
    actions.push({
      status: 'InProgress',
      label: current === 'Completed' ? 'Wieder aufnehmen' : 'Auftrag starten',
      icon: current === 'Completed' ? RotateCcw : Play,
      variant: current === 'Open' ? 'primary' : 'secondary',
    });
  }
  if (allowed.includes('Completed')) {
    actions.push({ status: 'Completed', label: 'Als abgeschlossen markieren', icon: CircleCheck, variant: current === 'InProgress' ? 'primary' : 'secondary' });
  }
  if (allowed.includes('Cancelled')) {
    actions.push({ status: 'Cancelled', label: 'Stornieren', icon: Ban, variant: 'dangerGhost' });
  }
  return actions;
}

const statusToast: Record<JobStatus, string> = {
  Open: 'Auftrag wieder geöffnet',
  InProgress: 'Auftrag in Arbeit',
  Completed: 'Auftrag abgeschlossen',
  Cancelled: 'Auftrag storniert',
};

/** Invoices of the job plus "Rechnung erstellen" (emphasised once the job is completed and not yet invoiced). */
function JobInvoices({ job }: { job: JobDto }) {
  const create = useCreateInvoiceFrom({ type: 'job', id: job.id });
  const invoiced = job.invoices.some((i) => i.kind === 'Invoice' && i.status !== 'Cancelled');
  const highlight = job.status === 'Completed' && !invoiced;
  return (
    <Card>
      <CardHeader title="Rechnungen" as="h2" />
      <CardBody className="space-y-3">
        {highlight && (
          <Alert tone="success" icon={ReceiptText} title="Bereit zur Abrechnung">
            Der Auftrag ist abgeschlossen. Die Positionen aus Angebot {job.quotationNumber} werden in den Rechnungsentwurf übernommen.
          </Alert>
        )}
        <InvoiceLinkList invoices={job.invoices} empty="Noch keine Rechnung zu diesem Auftrag." />
        <Button
          variant={highlight ? 'primary' : 'secondary'}
          size={highlight ? 'md' : 'sm'}
          icon={ReceiptText}
          loading={create.isPending}
          onClick={() => create.mutate()}
          className={highlight ? 'w-full sm:w-auto' : undefined}
        >
          Rechnung erstellen
        </Button>
      </CardBody>
    </Card>
  );
}

function JobDetail({ job }: { job: JobDto }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const members = useMembers();
  const [rowVersion, setRowVersion] = useState(job.rowVersion);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JobFormInput, unknown, JobFormOutput>({
    resolver: zodResolver(jobSchema),
    defaultValues: jobToForm(job),
  });

  const applyFresh = (fresh: JobDto, resetForm: boolean) => {
    queryClient.setQueryData(qk.job(companyId, fresh.id), fresh);
    void queryClient.invalidateQueries({ queryKey: qk.jobs(companyId) });
    void queryClient.invalidateQueries({ queryKey: qk.customerJobs(companyId, fresh.customerId) });
    setRowVersion(fresh.rowVersion);
    if (resetForm) reset(jobToForm(fresh));
  };

  const reload = useMutation({
    mutationFn: () => api.jobs.get(companyId, job.id),
    onSuccess: (fresh) => {
      applyFresh(fresh, true);
      setConflictOpen(false);
      setFormError(null);
      toast.info('Aktuelle Fassung geladen');
    },
    onError: (error) => toast.error('Neu laden fehlgeschlagen', errorMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: (status: JobStatus) => api.jobs.changeStatus(companyId, job.id, { status }),
    onSuccess: (fresh) => {
      // Keep unsaved edits; only refresh the form when it is untouched.
      applyFresh(fresh, !isDirty);
      void queryClient.invalidateQueries({ queryKey: ['c', companyId, 'dashboard'] });
      toast.success(statusToast[fresh.status], `${fresh.number} · ${jobStatusLabel[fresh.status]}`);
    },
    onError: (error) => {
      if (isConflict(error)) setConflictOpen(true);
      else toast.error('Status konnte nicht geändert werden', errorMessage(error));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await api.jobs.update(companyId, job.id, toRequest(values, rowVersion));
      applyFresh(saved, true);
      toast.success('Änderungen gespeichert', saved.number);
    } catch (error) {
      if (isConflict(error)) {
        setConflictOpen(true);
        return;
      }
      const rest = applyServerErrors(error, setError, knownFields);
      if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
      else toast.error('Bitte prüfen Sie die markierten Felder.');
    }
  });

  const actions = transitionActions(job.status, job.allowedTransitions);
  const memberList = members.data ?? [];
  const activeMembers = memberList.filter((m) => m.status === 'Active');
  const assigneeMissing = Boolean(job.assignedUserId) && !activeMembers.some((m) => m.userId === job.assignedUserId);
  const today = todayIso(getDisplayTimeZone());
  const overdue =
    Boolean(job.dueDate) && (job.status === 'Open' || job.status === 'InProgress') && daysUntil(job.dueDate ?? '', today) < 0;

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="text-neutral-500">{job.number}</span> {job.title}
          </>
        }
        documentTitle={`Auftrag ${job.number}`}
        back={{ to: '/auftraege', label: 'Aufträge' }}
        meta={<JobStatusBadge status={job.status} size="md" />}
        actions={actions.map((action) => (
          <Button
            key={action.status}
            variant={action.variant}
            icon={action.icon}
            loading={changeStatus.isPending && changeStatus.variables === action.status}
            disabled={changeStatus.isPending}
            onClick={() => (action.status === 'Cancelled' ? setConfirmCancel(true) : changeStatus.mutate(action.status))}
          >
            {action.label}
          </Button>
        ))}
      />

      {overdue && (
        <Alert tone="danger" icon={AlarmClock} className="mb-6" title="Auftrag überfällig">
          Fällig war der {formatDate(job.dueDate)}. Passen Sie das Fälligkeitsdatum an oder schließen Sie den Auftrag ab.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="min-w-0 self-start">
          <CardHeader title="Auftragsdaten" description="Titel, Termine und Zuständigkeit. Nur intern sichtbar." />
          <form id="job-form" noValidate onSubmit={(event) => void onSubmit(event)} aria-label="Auftragsdaten bearbeiten">
            <CardBody className="space-y-4">
              {formError && (
                <Alert tone="danger" live title="Speichern nicht möglich">
                  {formError}
                </Alert>
              )}
              <Field label="Titel" error={errors.title?.message} required>
                <Input {...register('title')} />
              </Field>
              <Field label="Beschreibung" error={errors.description?.message} optional>
                <Textarea rows={4} placeholder="Leistungsumfang, Ansprechpartner vor Ort, Material …" {...register('description')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Geplanter Start" error={errors.plannedStartDate?.message} optional>
                  <Input type="date" {...register('plannedStartDate')} />
                </Field>
                <Field label="Fällig am" error={errors.dueDate?.message} optional>
                  <Input type="date" {...register('dueDate')} />
                </Field>
              </div>
              <Field
                label="Zuständig"
                error={errors.assignedUserId?.message}
                hint={
                  members.isError
                    ? isForbidden(members.error)
                      ? 'Sie haben keine Berechtigung, die Teamliste einzusehen.'
                      : 'Die Teamliste konnte nicht geladen werden.'
                    : members.isPending
                      ? 'Teamliste wird geladen …'
                      : 'Nur aktive Teammitglieder können zugewiesen werden.'
                }
              >
                <Select {...register('assignedUserId')} disabled={!members.isSuccess}>
                  <option value="">Niemand</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                  {assigneeMissing && job.assignedUserId && (
                    <option value={job.assignedUserId}>
                      {job.assignedUserName ?? 'Unbekannte Person'}
                      {members.isSuccess ? ' (nicht mehr aktiv)' : ''}
                    </option>
                  )}
                </Select>
              </Field>
              <Field label="Notizen" error={errors.notes?.message} optional>
                <Textarea rows={3} {...register('notes')} />
              </Field>
            </CardBody>
            <CardFooter>
              <span className="mr-auto text-[13px] text-neutral-500" aria-live="polite">
                {isDirty ? 'Ungespeicherte Änderungen' : 'Alle Änderungen gespeichert'}
              </span>
              <Button disabled={!isDirty || isSubmitting} onClick={() => reset()}>
                Verwerfen
              </Button>
              <Button type="submit" variant="primary" icon={Save} loading={isSubmitting} disabled={!isDirty}>
                Speichern
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Kunde & Quelle" as="h2" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: 'Kunde',
                    value: (
                      <Link to={`/kunden/${job.customerId}`} className="font-medium text-brand-700 hover:underline">
                        {job.customerName}
                      </Link>
                    ),
                  },
                  {
                    label: 'Quelle',
                    value: (
                      <>
                        Angebot{' '}
                        <Link to={`/angebote/${job.quotationId}`} className="font-medium text-brand-700 hover:underline">
                          {job.quotationNumber}
                        </Link>
                      </>
                    ),
                  },
                  { label: 'Auftragswert netto', value: <span className="tabular">{formatEur(job.quotationNetTotal)}</span> },
                  { label: 'Auftragswert brutto', value: <span className="tabular">{formatEur(job.quotationGrossTotal)}</span> },
                ]}
              />
            </CardBody>
          </Card>
          <JobInvoices job={job} />
          <Card>
            <CardHeader title="Verlauf" as="h2" />
            <CardBody>
              <DetailList
                items={[
                  { label: 'Angelegt', value: formatDateTime(job.createdAt) },
                  { label: 'Gestartet', value: job.startedAt ? formatDateTime(job.startedAt) : null },
                  { label: 'Abgeschlossen', value: job.completedAt ? formatDateTime(job.completedAt) : null },
                  ...(job.cancelledAt ? [{ label: 'Storniert', value: formatDateTime(job.cancelledAt) }] : []),
                  { label: 'Zuletzt geändert', value: formatDateTime(job.updatedAt) },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <UnsavedChangesGuard when={isDirty && !isSubmitting} />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Auftrag ${job.number} stornieren?`}
        description="Der Auftrag wird als storniert markiert. Sie können ihn später wieder öffnen."
        confirmLabel="Stornieren"
        cancelLabel="Nicht stornieren"
        variant="danger"
        onConfirm={() => changeStatus.mutateAsync('Cancelled').catch(() => undefined)}
      />

      <Dialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        title="Der Auftrag wurde zwischenzeitlich geändert"
        description="Jemand anderes hat diesen Auftrag gespeichert, während Sie ihn bearbeitet haben. Ihre Änderungen wurden nicht gespeichert."
        footer={
          <>
            <Button onClick={() => setConflictOpen(false)}>Weiter bearbeiten</Button>
            <Button variant="primary" icon={RefreshCw} loading={reload.isPending} onClick={() => reload.mutate()}>
              Aktuelle Fassung laden
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">Beim Neuladen gehen Ihre ungespeicherten Änderungen verloren.</p>
      </Dialog>
    </>
  );
}

export default function JobDetailPage() {
  const { id = '' } = useParams();
  const { companyId } = useCompany();
  const job = useQuery({ queryKey: qk.job(companyId, id), queryFn: () => api.jobs.get(companyId, id) });

  if (job.isPending) return <PageSkeleton rows={8} />;
  if (job.isError) {
    return (
      <>
        <PageHeader title="Auftrag" back={{ to: '/auftraege', label: 'Aufträge' }} />
        <ErrorState error={job.error} onRetry={() => void job.refetch()} title="Auftrag konnte nicht geladen werden" />
      </>
    );
  }
  return <JobDetail key={job.data.id} job={job.data} />;
}
