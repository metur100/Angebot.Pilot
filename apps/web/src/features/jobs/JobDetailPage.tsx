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
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';

const msg = (de: string, en: string) => ({ error: () => tr(de, en) });
const optionalText = (max: number) => z.string().trim().max(max, msg(`Maximal ${max} Zeichen.`, `At most ${max} characters.`));
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, msg('Ungültiges Datum.', 'Invalid date.'));

const jobSchema = z
  .object({
    title: z.string().trim().min(1, msg('Bitte Titel angeben.', 'Please enter a title.')).max(200, msg('Maximal 200 Zeichen.', 'At most 200 characters.')),
    description: optionalText(4000),
    plannedStartDate: optionalDate,
    dueDate: optionalDate,
    assignedUserId: z.string(),
    notes: optionalText(4000),
  })
  .refine((v) => !v.plannedStartDate || !v.dueDate || v.dueDate >= v.plannedStartDate, {
    path: ['dueDate'],
    ...msg('Das Fälligkeitsdatum muss nach dem geplanten Start liegen.', 'The due date must be after the planned start.'),
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
    actions.push({ status: 'Open', label: current === 'Cancelled' ? tr('Wieder öffnen', 'Reopen') : tr('Zurück auf „Offen“', 'Back to “Open”'), icon: RotateCcw, variant: 'secondary' });
  }
  if (allowed.includes('InProgress')) {
    actions.push({
      status: 'InProgress',
      label: current === 'Completed' ? tr('Wieder aufnehmen', 'Resume') : tr('Auftrag starten', 'Start job'),
      icon: current === 'Completed' ? RotateCcw : Play,
      variant: current === 'Open' ? 'primary' : 'secondary',
    });
  }
  if (allowed.includes('Completed')) {
    actions.push({ status: 'Completed', label: tr('Als abgeschlossen markieren', 'Mark as completed'), icon: CircleCheck, variant: current === 'InProgress' ? 'primary' : 'secondary' });
  }
  if (allowed.includes('Cancelled')) {
    actions.push({ status: 'Cancelled', label: tr('Stornieren', 'Cancel job'), icon: Ban, variant: 'dangerGhost' });
  }
  return actions;
}

function statusToast(status: JobStatus): string {
  const texts: Record<JobStatus, string> = {
    Open: tr('Auftrag wieder geöffnet', 'Job reopened'),
    InProgress: tr('Auftrag in Arbeit', 'Job in progress'),
    Completed: tr('Auftrag abgeschlossen', 'Job completed'),
    Cancelled: tr('Auftrag storniert', 'Job cancelled'),
  };
  return texts[status];
}

/** Invoices of the job plus "Rechnung erstellen" (emphasised once the job is completed and not yet invoiced). */
function JobInvoices({ job }: { job: JobDto }) {
  const create = useCreateInvoiceFrom({ type: 'job', id: job.id });
  const invoiced = job.invoices.some((i) => i.kind === 'Invoice' && i.status !== 'Cancelled');
  const highlight = job.status === 'Completed' && !invoiced;
  return (
    <Card>
      <CardHeader title={tr('Rechnungen', 'Invoices')} as="h2" />
      <CardBody className="space-y-3">
        {highlight && (
          <Alert tone="success" icon={ReceiptText} title={tr('Bereit zur Abrechnung', 'Ready to invoice')}>
            {tr(
              `Der Auftrag ist abgeschlossen. Die Positionen aus Angebot ${job.quotationNumber} werden in den Rechnungsentwurf übernommen.`,
              `The job is completed. The line items from quotation ${job.quotationNumber} are copied into the invoice draft.`,
            )}
          </Alert>
        )}
        <InvoiceLinkList invoices={job.invoices} empty={tr('Noch keine Rechnung zu diesem Auftrag.', 'No invoice for this job yet.')} />
        <Button
          variant={highlight ? 'primary' : 'secondary'}
          size={highlight ? 'md' : 'sm'}
          icon={ReceiptText}
          loading={create.isPending}
          onClick={() => create.mutate()}
          className={highlight ? 'w-full sm:w-auto' : undefined}
        >
          {tr('Rechnung erstellen', 'Create invoice')}
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
      toast.info(tr('Aktuelle Fassung geladen', 'Latest version loaded'));
    },
    onError: (error) => toast.error(tr('Neu laden fehlgeschlagen', 'Reload failed'), errorMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: (status: JobStatus) => api.jobs.changeStatus(companyId, job.id, { status }),
    onSuccess: (fresh) => {
      // Keep unsaved edits; only refresh the form when it is untouched.
      applyFresh(fresh, !isDirty);
      void queryClient.invalidateQueries({ queryKey: ['c', companyId, 'dashboard'] });
      toast.success(statusToast(fresh.status), `${fresh.number} · ${jobStatusLabel[fresh.status]}`);
    },
    onError: (error) => {
      if (isConflict(error)) setConflictOpen(true);
      else toast.error(tr('Status konnte nicht geändert werden', 'Status could not be changed'), errorMessage(error));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await api.jobs.update(companyId, job.id, toRequest(values, rowVersion));
      applyFresh(saved, true);
      toast.success(tr('Änderungen gespeichert', 'Changes saved'), saved.number);
    } catch (error) {
      if (isConflict(error)) {
        setConflictOpen(true);
        return;
      }
      const rest = applyServerErrors(error, setError, knownFields);
      if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
      else toast.error(tr('Bitte prüfen Sie die markierten Felder.', 'Please check the highlighted fields.'));
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
        documentTitle={tr(`Auftrag ${job.number}`, `Job ${job.number}`)}
        back={{ to: '/auftraege', label: tr('Aufträge', 'Jobs') }}
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
        <Alert tone="danger" icon={AlarmClock} className="mb-6" title={tr('Auftrag überfällig', 'Job overdue')}>
          {tr(
            `Fällig war der ${formatDate(job.dueDate)}. Passen Sie das Fälligkeitsdatum an oder schließen Sie den Auftrag ab.`,
            `It was due on ${formatDate(job.dueDate)}. Adjust the due date or complete the job.`,
          )}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="min-w-0 self-start">
          <CardHeader
            title={tr('Auftragsdaten', 'Job details')}
            description={tr('Titel, Termine und Zuständigkeit. Nur intern sichtbar.', 'Title, dates and assignee. Only visible internally.')}
          />
          <form id="job-form" noValidate onSubmit={(event) => void onSubmit(event)} aria-label={tr('Auftragsdaten bearbeiten', 'Edit job details')}>
            <CardBody className="space-y-4">
              {formError && (
                <Alert tone="danger" live title={tr('Speichern nicht möglich', 'Unable to save')}>
                  {formError}
                </Alert>
              )}
              <Field label={tr('Titel', 'Title')} error={errors.title?.message} required>
                <Input {...register('title')} />
              </Field>
              <Field label={tr('Beschreibung', 'Description')} error={errors.description?.message} optional>
                <Textarea rows={4} placeholder={tr('Leistungsumfang, Ansprechpartner vor Ort, Material …', 'Scope of work, on-site contact, materials …')} {...register('description')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr('Geplanter Start', 'Planned start')} error={errors.plannedStartDate?.message} optional>
                  <Input type="date" {...register('plannedStartDate')} />
                </Field>
                <Field label={tr('Fällig am', 'Due date')} error={errors.dueDate?.message} optional>
                  <Input type="date" {...register('dueDate')} />
                </Field>
              </div>
              <Field
                label={tr('Zuständig', 'Assignee')}
                error={errors.assignedUserId?.message}
                hint={
                  members.isError
                    ? isForbidden(members.error)
                      ? tr('Sie haben keine Berechtigung, die Teamliste einzusehen.', 'You do not have permission to view the team list.')
                      : tr('Die Teamliste konnte nicht geladen werden.', 'The team list could not be loaded.')
                    : members.isPending
                      ? tr('Teamliste wird geladen …', 'Loading team list …')
                      : tr('Nur aktive Teammitglieder können zugewiesen werden.', 'Only active team members can be assigned.')
                }
              >
                <Select {...register('assignedUserId')} disabled={!members.isSuccess}>
                  <option value="">{tr('Niemand', 'Nobody')}</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                  {assigneeMissing && job.assignedUserId && (
                    <option value={job.assignedUserId}>
                      {job.assignedUserName ?? tr('Unbekannte Person', 'Unknown person')}
                      {members.isSuccess ? tr(' (nicht mehr aktiv)', ' (no longer active)') : ''}
                    </option>
                  )}
                </Select>
              </Field>
              <Field label={tr('Notizen', 'Notes')} error={errors.notes?.message} optional>
                <Textarea rows={3} {...register('notes')} />
              </Field>
            </CardBody>
            <CardFooter>
              <span className="mr-auto text-[13px] text-neutral-500" aria-live="polite">
                {isDirty ? tr('Ungespeicherte Änderungen', 'Unsaved changes') : tr('Alle Änderungen gespeichert', 'All changes saved')}
              </span>
              <Button disabled={!isDirty || isSubmitting} onClick={() => reset()}>
                {tr('Verwerfen', 'Discard')}
              </Button>
              <Button type="submit" variant="primary" icon={Save} loading={isSubmitting} disabled={!isDirty}>
                {tr('Speichern', 'Save')}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title={tr('Kunde & Quelle', 'Customer & source')} as="h2" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: tr('Kunde', 'Customer'),
                    value: (
                      <Link to={`/kunden/${job.customerId}`} className="font-medium text-brand-700 hover:underline">
                        {job.customerName}
                      </Link>
                    ),
                  },
                  {
                    label: tr('Quelle', 'Source'),
                    value: (
                      <>
                        {tr('Angebot', 'Quotation')}{' '}
                        <Link to={`/angebote/${job.quotationId}`} className="font-medium text-brand-700 hover:underline">
                          {job.quotationNumber}
                        </Link>
                      </>
                    ),
                  },
                  { label: tr('Auftragswert netto', 'Job value (net)'), value: <span className="tabular">{formatEur(job.quotationNetTotal)}</span> },
                  { label: tr('Auftragswert brutto', 'Job value (gross)'), value: <span className="tabular">{formatEur(job.quotationGrossTotal)}</span> },
                ]}
              />
            </CardBody>
          </Card>
          <JobInvoices job={job} />
          <Card>
            <CardHeader title={tr('Verlauf', 'History')} as="h2" />
            <CardBody>
              <DetailList
                items={[
                  { label: tr('Angelegt', 'Created'), value: formatDateTime(job.createdAt) },
                  { label: tr('Gestartet', 'Started'), value: job.startedAt ? formatDateTime(job.startedAt) : null },
                  { label: tr('Abgeschlossen', 'Completed'), value: job.completedAt ? formatDateTime(job.completedAt) : null },
                  ...(job.cancelledAt ? [{ label: tr('Storniert', 'Cancelled'), value: formatDateTime(job.cancelledAt) }] : []),
                  { label: tr('Zuletzt geändert', 'Last modified'), value: formatDateTime(job.updatedAt) },
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
        title={tr(`Auftrag ${job.number} stornieren?`, `Cancel job ${job.number}?`)}
        description={tr('Der Auftrag wird als storniert markiert. Sie können ihn später wieder öffnen.', 'The job is marked as cancelled. You can reopen it later.')}
        confirmLabel={tr('Stornieren', 'Cancel job')}
        cancelLabel={tr('Nicht stornieren', 'Keep job')}
        variant="danger"
        onConfirm={() => changeStatus.mutateAsync('Cancelled').catch(() => undefined)}
      />

      <Dialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        title={tr('Der Auftrag wurde zwischenzeitlich geändert', 'The job has been changed in the meantime')}
        description={tr(
          'Jemand anderes hat diesen Auftrag gespeichert, während Sie ihn bearbeitet haben. Ihre Änderungen wurden nicht gespeichert.',
          'Someone else saved this job while you were editing it. Your changes have not been saved.',
        )}
        footer={
          <>
            <Button onClick={() => setConflictOpen(false)}>{tr('Weiter bearbeiten', 'Keep editing')}</Button>
            <Button variant="primary" icon={RefreshCw} loading={reload.isPending} onClick={() => reload.mutate()}>
              {tr('Aktuelle Fassung laden', 'Load latest version')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">{tr('Beim Neuladen gehen Ihre ungespeicherten Änderungen verloren.', 'Reloading discards your unsaved changes.')}</p>
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
        <PageHeader title={tr('Auftrag', 'Job')} back={{ to: '/auftraege', label: tr('Aufträge', 'Jobs') }} />
        <ErrorState error={job.error} onRetry={() => void job.refetch()} title={tr('Auftrag konnte nicht geladen werden', 'Job could not be loaded')} />
      </>
    );
  }
  return <JobDetail key={job.data.id} job={job.data} />;
}
