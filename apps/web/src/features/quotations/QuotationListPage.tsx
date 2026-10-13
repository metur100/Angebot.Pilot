import { quotationStatusLabel, type QuotationListQuery, type QuotationStatus } from '@angebotpilot/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilePlus2, FileText, Hammer, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCompany } from '@/app/company';
import { ExportButton } from '@/components/domain/Common';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Input';
import { FilterChip, PageHeader, Pagination, table } from '@/components/ui/Page';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { fileStamp } from '@/lib/download';
import { formatDate, formatEur } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { compactQuery, useListParams } from '@/lib/listParams';
import { qk } from '@/lib/queryKeys';
import { ADMIN_ONLY_HINT } from '@/lib/roles';

const PAGE_SIZE = 20;
const statuses: QuotationStatus[] = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled'];

interface QuotationListParams {
  q: string;
  status: string;
  customer: string;
  from: string;
  to: string;
  sort: string;
  page: string;
}

/** URL state → API query (exported for unit tests). */
export function buildQuotationQuery(params: QuotationListParams): QuotationListQuery {
  const status = params.status
    .split(',')
    .filter((s): s is QuotationStatus => (statuses as string[]).includes(s));
  return compactQuery({
    search: params.q.trim() || undefined,
    status,
    customerId: params.customer || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    sort: params.sort as QuotationListQuery['sort'],
    page: Number(params.page) || 1,
    pageSize: PAGE_SIZE,
  });
}

export function toggleStatus(current: string, status: QuotationStatus): string {
  const set = new Set(current.split(',').filter(Boolean));
  if (set.has(status)) set.delete(status);
  else set.add(status);
  return statuses.filter((s) => set.has(s)).join(',');
}

export default function QuotationListPage() {
  const { companyId, can } = useCompany();
  const [params, update] = useListParams<QuotationListParams>({ q: '', status: '', customer: '', from: '', to: '', sort: '-updatedAt', page: '1' });
  const [search, setSearch] = useState(params.q);
  const debounced = useDebouncedValue(search, 300);
  useEffect(() => {
    if (debounced !== params.q) update({ q: debounced });
  }, [debounced, params.q, update]);

  const query = buildQuotationQuery(params);
  const list = useQuery({ queryKey: qk.quotationList(companyId, query), queryFn: () => api.quotations.list(companyId, query), placeholderData: keepPreviousData });
  const customer = useQuery({
    queryKey: qk.customer(companyId, params.customer),
    queryFn: () => api.customers.get(companyId, params.customer),
    enabled: Boolean(params.customer),
  });
  const selectedStatuses = new Set(params.status.split(',').filter(Boolean));
  const filtered = Boolean(params.q || params.status || params.customer || params.from || params.to);
  const exportQuery = { ...query, page: undefined, pageSize: undefined };

  const resetFilters = () => {
    setSearch('');
    update({ q: '', status: '', customer: '', from: '', to: '' });
  };

  return (
    <>
      <PageHeader
        title="Angebote"
        description="Alle Angebote mit Status, Gültigkeit und Volumen."
        actions={
          <>
            <ExportButton
              allowed={can.exportCsv}
              hint={ADMIN_ONLY_HINT}
              fileName={`angebote-${fileStamp()}.csv`}
              load={() => api.quotations.exportCsv(companyId, exportQuery)}
            />
            <ButtonLink to="/angebote/neu" variant="primary" icon={Plus}>
              Neues Angebot
            </ButtonLink>
          </>
        }
      />

      <Card>
        <div className="space-y-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1 lg:max-w-sm">
              <label htmlFor="quotation-search" className="sr-only">
                Angebote suchen
              </label>
              <Input
                id="quotation-search"
                type="search"
                icon={Search}
                placeholder="Nummer, Betreff oder Kunde …"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[13px] text-neutral-600">
                <label htmlFor="quotation-from">Von</label>
                <Input id="quotation-from" type="date" inputSize="sm" className="w-[150px]" value={params.from} onChange={(e) => update({ from: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 text-[13px] text-neutral-600">
                <label htmlFor="quotation-to">Bis</label>
                <Input id="quotation-to" type="date" inputSize="sm" className="w-[150px]" value={params.to} onChange={(e) => update({ to: e.target.value })} />
              </div>
              <label htmlFor="quotation-sort" className="sr-only">
                Sortierung
              </label>
              <Select id="quotation-sort" inputSize="sm" className="w-[190px]" value={params.sort} onChange={(e) => update({ sort: e.target.value })}>
                <option value="-updatedAt">Zuletzt bearbeitet</option>
                <option value="-issueDate">Angebotsdatum (neueste)</option>
                <option value="issueDate">Angebotsdatum (älteste)</option>
                <option value="-number">Nummer absteigend</option>
                <option value="number">Nummer aufsteigend</option>
                <option value="-grossTotal">Betrag (höchster)</option>
                <option value="grossTotal">Betrag (niedrigster)</option>
                <option value="validUntil">Gültig bis (bald ablaufend)</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Status filtern">
            {statuses.map((status) => (
              <FilterChip key={status} selected={selectedStatuses.has(status)} onClick={() => update({ status: toggleStatus(params.status, status) })}>
                {quotationStatusLabel[status]}
              </FilterChip>
            ))}
            {params.customer && (
              <span className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 pr-1 pl-3 text-[13px] font-medium text-brand-800">
                Kunde: {customer.data?.displayName ?? '…'}
                <button
                  type="button"
                  aria-label="Kundenfilter entfernen"
                  onClick={() => update({ customer: '' })}
                  className="inline-flex size-6 items-center justify-center rounded-full hover:bg-brand-100"
                >
                  <X aria-hidden size={14} />
                </button>
              </span>
            )}
            {filtered && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto">
                Filter zurücksetzen
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
              title="Keine Angebote gefunden"
              description="Für diese Filter gibt es keine Angebote."
              action={<Button onClick={resetFilters}>Filter zurücksetzen</Button>}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Noch keine Angebote"
              description="Erstellen Sie Ihr erstes Angebot – mit Positionen, automatischer USt.-Berechnung und PDF."
              action={
                <ButtonLink to="/angebote/neu" variant="primary" icon={FilePlus2}>
                  Erstes Angebot erstellen
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
                    <th scope="col" className={table.th}>Nummer</th>
                    <th scope="col" className={table.th}>Kunde & Betreff</th>
                    <th scope="col" className={table.th}>Status</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Datum</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Gültig bis</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Netto</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((q) => (
                    <tr key={q.id} className={table.row}>
                      <td className={cx(table.td, 'whitespace-nowrap')}>
                        <Link to={`/angebote/${q.id}`} className="font-medium text-neutral-900 hover:text-brand-700 hover:underline">
                          {q.number}
                        </Link>
                        {q.revisionNumber > 1 && <span className="ml-1.5 text-xs text-neutral-500">Rev. {q.revisionNumber}</span>}
                      </td>
                      <td className={cx(table.td, 'max-w-[360px]')}>
                        <p className="truncate font-medium text-neutral-800">{q.customerName}</p>
                        <p className="truncate text-[13px] text-neutral-500">{q.title}</p>
                      </td>
                      <td className={table.td}>
                        <div className="flex items-center gap-1.5">
                          <QuotationStatusBadge status={q.status} />
                          {q.hasJob && (
                            <span title="Auftrag erstellt" className="text-neutral-400">
                              <Hammer aria-hidden size={14} />
                              <span className="sr-only">Auftrag erstellt</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={cx(table.td, table.num, 'text-neutral-600')}>{formatDate(q.issueDate)}</td>
                      <td className={cx(table.td, table.num, 'text-neutral-600')}>{formatDate(q.validUntil)}</td>
                      <td className={cx(table.td, table.num, 'text-neutral-600')}>{formatEur(q.netTotal)}</td>
                      <td className={cx(table.td, table.num, 'font-medium')}>{formatEur(q.grossTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-neutral-100 md:hidden">
              {list.data.items.map((q) => (
                <li key={q.id}>
                  <Link to={`/angebote/${q.id}`} className="block px-4 py-3 hover:bg-neutral-25">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">{q.customerName}</p>
                        <p className="truncate text-[13px] text-neutral-500">
                          {q.number} · {q.title}
                        </p>
                      </div>
                      <p className="font-medium whitespace-nowrap tabular">{formatEur(q.grossTotal)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <QuotationStatusBadge status={q.status} />
                      <span className="text-xs text-neutral-500">gültig bis {formatDate(q.validUntil)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              totalCount={list.data.totalCount}
              onPageChange={(page) => update({ page: String(page) }, { resetPage: false })}
              noun={['Angebot', 'Angeboten']}
            />
          </div>
        )}
      </Card>
    </>
  );
}
