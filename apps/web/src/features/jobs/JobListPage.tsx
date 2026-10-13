import { jobStatusLabel, todayIso, type JobListItemDto, type JobListQuery, type JobStatus } from '@angebotpilot/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, FileCheck2, Hammer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCompany, useMembers } from '@/app/company';
import { ExportButton } from '@/components/domain/Common';
import { JobStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Input';
import { FilterChip, PageHeader, Pagination, table } from '@/components/ui/Page';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { fileStamp } from '@/lib/download';
import { daysUntil, formatDate, formatEur, getDisplayTimeZone } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { compactQuery, useListParams } from '@/lib/listParams';
import { qk } from '@/lib/queryKeys';
import { ADMIN_ONLY_HINT } from '@/lib/roles';

const PAGE_SIZE = 20;
const statuses: JobStatus[] = ['Open', 'InProgress', 'Completed', 'Cancelled'];
const sorts = ['dueDate', '-dueDate', '-createdAt', 'createdAt', 'number', '-number'] as const;

interface JobListParams {
  q: string;
  status: string;
  assignee: string;
  sort: string;
  page: string;
}

/** URL state → API query (exported for unit tests). */
export function buildJobQuery(params: JobListParams): JobListQuery {
  const status = params.status.split(',').filter((s): s is JobStatus => (statuses as string[]).includes(s));
  const sort = (sorts as readonly string[]).includes(params.sort) ? (params.sort as JobListQuery['sort']) : 'dueDate';
  return compactQuery({
    search: params.q.trim() || undefined,
    status,
    assignedUserId: params.assignee || undefined,
    sort,
    page: Number(params.page) || 1,
    pageSize: PAGE_SIZE,
  });
}

export function toggleJobStatus(current: string, status: JobStatus): string {
  const set = new Set(current.split(',').filter(Boolean));
  if (set.has(status)) set.delete(status);
  else set.add(status);
  return statuses.filter((s) => set.has(s)).join(',');
}

/** A job is overdue when its due date has passed and it is still open or in progress. */
export function isJobOverdue(job: Pick<JobListItemDto, 'dueDate' | 'status'>, today: string): boolean {
  return Boolean(job.dueDate) && (job.status === 'Open' || job.status === 'InProgress') && daysUntil(job.dueDate ?? '', today) < 0;
}

function DueDate({ job, today, compact }: { job: JobListItemDto; today: string; compact?: boolean }) {
  if (!job.dueDate) return <span className="text-neutral-500">–</span>;
  if (!isJobOverdue(job, today)) return <span>{compact ? tr(`fällig ${formatDate(job.dueDate)}`, `due ${formatDate(job.dueDate)}`) : formatDate(job.dueDate)}</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-danger-text">
      <AlarmClock aria-hidden size={13} />
      {compact ? tr(`fällig ${formatDate(job.dueDate)}`, `due ${formatDate(job.dueDate)}`) : formatDate(job.dueDate)}
      <span className="text-xs">{tr('· überfällig', '· overdue')}</span>
    </span>
  );
}

export default function JobListPage() {
  const { companyId, can } = useCompany();
  const [params, update] = useListParams<JobListParams>({ q: '', status: '', assignee: '', sort: 'dueDate', page: '1' });
  const [search, setSearch] = useState(params.q);
  const debounced = useDebouncedValue(search, 300);
  useEffect(() => {
    if (debounced !== params.q) update({ q: debounced });
  }, [debounced, params.q, update]);

  const query = buildJobQuery(params);
  const list = useQuery({ queryKey: qk.jobList(companyId, query), queryFn: () => api.jobs.list(companyId, query), placeholderData: keepPreviousData });
  const members = useMembers();
  const today = todayIso(getDisplayTimeZone());
  const selectedStatuses = new Set(params.status.split(',').filter(Boolean));
  const filtered = Boolean(params.q || params.status || params.assignee);
  // Members can be unavailable (e.g. 403): then the assignee filter is hidden, unless it is already set via URL.
  const memberOptions = members.data ?? [];
  const showAssignee = members.isSuccess || Boolean(params.assignee);

  const resetFilters = () => {
    setSearch('');
    update({ q: '', status: '', assignee: '' });
  };

  return (
    <>
      <PageHeader
        title={tr('Aufträge', 'Jobs')}
        description={tr('Aus angenommenen Angeboten entstandene Aufträge mit Zuständigkeit und Terminen.', 'Jobs created from accepted quotations, with assignees and dates.')}
        actions={
          <ExportButton
            allowed={can.exportCsv}
            hint={ADMIN_ONLY_HINT}
            fileName={`${tr('auftraege', 'jobs')}-${fileStamp()}.csv`}
            load={() => api.jobs.exportCsv(companyId)}
          />
        }
      />

      <Card>
        <div className="space-y-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1 lg:max-w-sm">
              <label htmlFor="job-search" className="sr-only">
                {tr('Aufträge suchen', 'Search jobs')}
              </label>
              <Input
                id="job-search"
                type="search"
                icon={Search}
                placeholder={tr('Nummer, Titel, Angebot oder Kunde …', 'Number, title, quotation or customer …')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showAssignee && (
                <>
                  <label htmlFor="job-assignee" className="sr-only">
                    {tr('Zuständig', 'Assignee')}
                  </label>
                  <Select
                    id="job-assignee"
                    inputSize="sm"
                    className="w-[200px]"
                    value={params.assignee}
                    onChange={(e) => update({ assignee: e.target.value })}
                  >
                    <option value="">{tr('Alle Zuständigen', 'All assignees')}</option>
                    {memberOptions.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                        {m.status === 'Deactivated' ? tr(' (deaktiviert)', ' (deactivated)') : ''}
                      </option>
                    ))}
                    {params.assignee && !memberOptions.some((m) => m.userId === params.assignee) && (
                      <option value={params.assignee}>{tr('Ausgewählte Person', 'Selected person')}</option>
                    )}
                  </Select>
                </>
              )}
              <label htmlFor="job-sort" className="sr-only">
                {tr('Sortierung', 'Sort order')}
              </label>
              <Select id="job-sort" inputSize="sm" className="w-[200px]" value={params.sort} onChange={(e) => update({ sort: e.target.value })}>
                <option value="dueDate">{tr('Fälligkeit (früheste)', 'Due date (earliest)')}</option>
                <option value="-dueDate">{tr('Fälligkeit (späteste)', 'Due date (latest)')}</option>
                <option value="-createdAt">{tr('Neueste zuerst', 'Newest first')}</option>
                <option value="createdAt">{tr('Älteste zuerst', 'Oldest first')}</option>
                <option value="number">{tr('Nummer aufsteigend', 'Number ascending')}</option>
                <option value="-number">{tr('Nummer absteigend', 'Number descending')}</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tr('Nach Status filtern', 'Filter by status')}>
            {statuses.map((status) => (
              <FilterChip key={status} selected={selectedStatuses.has(status)} onClick={() => update({ status: toggleJobStatus(params.status, status) })}>
                {jobStatusLabel[status]}
              </FilterChip>
            ))}
            {filtered && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto">
                {tr('Filter zurücksetzen', 'Reset filters')}
              </Button>
            )}
          </div>
        </div>

        {list.isPending ? (
          <TableSkeleton rows={8} columns={6} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title={tr('Keine Aufträge gefunden', 'No jobs found')}
              description={tr('Für diese Filter gibt es keine Aufträge.', 'There are no jobs for these filters.')}
              action={<Button onClick={resetFilters}>{tr('Filter zurücksetzen', 'Reset filters')}</Button>}
            />
          ) : (
            <EmptyState
              icon={Hammer}
              title={tr('Noch keine Aufträge', 'No jobs yet')}
              description={tr(
                'Aufträge entstehen aus angenommenen Angeboten. Angenommene Angebote können Sie mit einem Klick in Aufträge umwandeln.',
                'Jobs are created from accepted quotations. You can turn accepted quotations into jobs with one click.',
              )}
              action={
                <ButtonLink to="/angebote?status=Accepted" variant="primary" icon={FileCheck2}>
                  {tr('Angenommene Angebote anzeigen', 'Show accepted quotations')}
                </ButtonLink>
              }
            />
          )
        ) : (
          <div className={cx(list.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <div className={cx(table.wrapper, 'hidden md:block')}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col" className={table.th}>{tr('Nummer', 'Number')}</th>
                    <th scope="col" className={table.th}>{tr('Titel & Kunde', 'Title & customer')}</th>
                    <th scope="col" className={table.th}>{tr('Status', 'Status')}</th>
                    <th scope="col" className={table.th}>{tr('Zuständig', 'Assignee')}</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>{tr('Geplanter Start', 'Planned start')}</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>{tr('Fällig', 'Due')}</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>{tr('Wert netto', 'Net value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((j) => (
                    <tr key={j.id} className={table.row}>
                      <td className={cx(table.td, 'whitespace-nowrap')}>
                        <Link to={`/auftraege/${j.id}`} className="font-medium text-neutral-900 hover:text-brand-700 dark:hover:text-brand-800 hover:underline">
                          {j.number}
                        </Link>
                        <p className="text-xs text-neutral-500">{tr(`aus ${j.quotationNumber}`, `from ${j.quotationNumber}`)}</p>
                      </td>
                      <td className={cx(table.td, 'max-w-[340px]')}>
                        <p className="truncate font-medium text-neutral-800">{j.title}</p>
                        <p className="truncate text-[13px] text-neutral-500">{j.customerName}</p>
                      </td>
                      <td className={table.td}>
                        <JobStatusBadge status={j.status} />
                      </td>
                      <td className={cx(table.td, 'max-w-[180px] truncate')}>
                        {j.assignedUserName ?? <span className="text-neutral-500">{tr('Niemand', 'Nobody')}</span>}
                      </td>
                      <td className={cx(table.td, table.num, 'text-neutral-600')}>
                        {j.plannedStartDate ? formatDate(j.plannedStartDate) : <span className="text-neutral-500">–</span>}
                      </td>
                      <td className={cx(table.td, table.num, 'text-neutral-600')}>
                        <DueDate job={j} today={today} />
                      </td>
                      <td className={cx(table.td, table.num, 'font-medium')}>{formatEur(j.netValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-neutral-100 md:hidden">
              {list.data.items.map((j) => (
                <li key={j.id}>
                  <Link to={`/auftraege/${j.id}`} className="block px-4 py-3 hover:bg-neutral-25">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">{j.title}</p>
                        <p className="truncate text-[13px] text-neutral-500">
                          {j.number} · {j.customerName}
                        </p>
                      </div>
                      <p className="font-medium whitespace-nowrap tabular">{formatEur(j.netValue)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      <JobStatusBadge status={j.status} />
                      <span className="text-xs text-neutral-500">
                        <DueDate job={j} today={today} compact />
                      </span>
                    </div>
                    {j.assignedUserName && <p className="mt-1.5 text-xs text-neutral-500">{tr('Zuständig', 'Assignee')}: {j.assignedUserName}</p>}
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              totalCount={list.data.totalCount}
              onPageChange={(page) => update({ page: String(page) }, { resetPage: false })}
              noun={[tr('Auftrag', 'job'), tr('Aufträgen', 'jobs')]}
            />
          </div>
        )}
      </Card>
    </>
  );
}
