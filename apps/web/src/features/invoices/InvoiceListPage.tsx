import { invoiceStatusLabel, type InvoiceListItemDto, type InvoiceListQuery, type InvoiceStatus } from '@angebotpilot/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, CircleCheck, FilePlus2, Hammer, Plus, ReceiptText, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCompany } from '@/app/company';
import { ExportButton } from '@/components/domain/Common';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
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
import { daysText, invoiceAmount } from './shared';

const PAGE_SIZE = 20;
const statuses: InvoiceStatus[] = ['Draft', 'Issued', 'PartiallyPaid', 'Paid', 'Cancelled'];

export interface InvoiceListParams {
  q: string;
  status: string;
  /** "1" = only overdue invoices (API filter overdue=true). */
  ueberfaellig: string;
  customer: string;
  from: string;
  to: string;
  sort: string;
  page: string;
}

export const invoiceListDefaults: InvoiceListParams = { q: '', status: '', ueberfaellig: '', customer: '', from: '', to: '', sort: '-updatedAt', page: '1' };

/** URL state → API query (exported for unit tests). */
export function buildInvoiceQuery(params: InvoiceListParams): InvoiceListQuery {
  const status = params.status
    .split(',')
    .filter((s): s is InvoiceStatus => (statuses as string[]).includes(s));
  return compactQuery({
    search: params.q.trim() || undefined,
    status,
    overdue: params.ueberfaellig === '1' ? true : undefined,
    customerId: params.customer || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    sort: params.sort as InvoiceListQuery['sort'],
    page: Number(params.page) || 1,
    pageSize: PAGE_SIZE,
  });
}

export function toggleInvoiceStatus(current: string, status: InvoiceStatus): string {
  const set = new Set(current.split(',').filter(Boolean));
  if (set.has(status)) set.delete(status);
  else set.add(status);
  return statuses.filter((s) => set.has(s)).join(',');
}

function DueDate({ invoice, compact }: { invoice: InvoiceListItemDto; compact?: boolean }) {
  if (invoice.status === 'Draft' || invoice.kind === 'Cancellation') {
    return <span className="text-neutral-500">{compact ? '' : formatDate(invoice.dueDate)}</span>;
  }
  if (invoice.isOverdue) {
    return (
      <span className="text-danger-text">
        {compact ? '' : <span className="block">{formatDate(invoice.dueDate)}</span>}
        <span className="text-xs font-medium">{daysText(invoice.daysOverdue)} überfällig</span>
      </span>
    );
  }
  return <span className="text-neutral-600">{compact ? `fällig am ${formatDate(invoice.dueDate)}` : formatDate(invoice.dueDate)}</span>;
}

export default function InvoiceListPage() {
  const { companyId, can } = useCompany();
  const [params, update] = useListParams<InvoiceListParams>(invoiceListDefaults);
  const [search, setSearch] = useState(params.q);
  const debounced = useDebouncedValue(search, 300);
  useEffect(() => {
    if (debounced !== params.q) update({ q: debounced });
  }, [debounced, params.q, update]);

  const query = buildInvoiceQuery(params);
  const list = useQuery({ queryKey: qk.invoiceList(companyId, query), queryFn: () => api.invoices.list(companyId, query), placeholderData: keepPreviousData });
  const customer = useQuery({
    queryKey: qk.customer(companyId, params.customer),
    queryFn: () => api.customers.get(companyId, params.customer),
    enabled: Boolean(params.customer),
  });
  const selectedStatuses = new Set(params.status.split(',').filter(Boolean));
  const filtered = Boolean(params.q || params.status || params.ueberfaellig || params.customer || params.from || params.to);
  const exportQuery = { ...query, page: undefined, pageSize: undefined };

  const resetFilters = () => {
    setSearch('');
    update({ q: '', status: '', ueberfaellig: '', customer: '', from: '', to: '' });
  };

  return (
    <>
      <PageHeader
        title="Rechnungen"
        description="Rechnungen stellen, versenden und Zahlungseingänge im Blick behalten."
        actions={
          <>
            <ExportButton
              allowed={can.exportCsv}
              hint={ADMIN_ONLY_HINT}
              fileName={`rechnungen-${fileStamp()}.csv`}
              load={() => api.invoices.exportCsv(companyId, exportQuery)}
            />
            <ButtonLink to="/rechnungen/neu" variant="primary" icon={Plus}>
              Neue Rechnung
            </ButtonLink>
          </>
        }
      />

      <Card>
        <div className="space-y-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1 lg:max-w-sm">
              <label htmlFor="invoice-search" className="sr-only">
                Rechnungen suchen
              </label>
              <Input
                id="invoice-search"
                type="search"
                icon={Search}
                placeholder="Nummer, Betreff, Kunde oder Auftrag …"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[13px] text-neutral-600">
                <label htmlFor="invoice-from">Von</label>
                <Input id="invoice-from" type="date" inputSize="sm" className="w-[150px]" value={params.from} onChange={(e) => update({ from: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 text-[13px] text-neutral-600">
                <label htmlFor="invoice-to">Bis</label>
                <Input id="invoice-to" type="date" inputSize="sm" className="w-[150px]" value={params.to} onChange={(e) => update({ to: e.target.value })} />
              </div>
              <label htmlFor="invoice-sort" className="sr-only">
                Sortierung
              </label>
              <Select id="invoice-sort" inputSize="sm" className="w-[200px]" value={params.sort} onChange={(e) => update({ sort: e.target.value })}>
                <option value="-updatedAt">Zuletzt bearbeitet</option>
                <option value="-issueDate">Rechnungsdatum (neueste)</option>
                <option value="issueDate">Rechnungsdatum (älteste)</option>
                <option value="dueDate">Fälligkeit (früheste)</option>
                <option value="-dueDate">Fälligkeit (späteste)</option>
                <option value="-number">Nummer absteigend</option>
                <option value="number">Nummer aufsteigend</option>
                <option value="-grossTotal">Betrag (höchster)</option>
                <option value="grossTotal">Betrag (niedrigster)</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Status filtern">
            {statuses.map((status) => (
              <FilterChip key={status} selected={selectedStatuses.has(status)} onClick={() => update({ status: toggleInvoiceStatus(params.status, status) })}>
                {invoiceStatusLabel[status]}
              </FilterChip>
            ))}
            <FilterChip selected={params.ueberfaellig === '1'} onClick={() => update({ ueberfaellig: params.ueberfaellig === '1' ? '' : '1' })}>
              <AlarmClock aria-hidden size={14} />
              Überfällig
            </FilterChip>
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
              title="Keine Rechnungen gefunden"
              description={params.ueberfaellig === '1' ? 'Keine überfälligen Rechnungen – alle offenen Rechnungen sind noch im Zahlungsziel.' : 'Für diese Filter gibt es keine Rechnungen.'}
              action={<Button onClick={resetFilters}>Filter zurücksetzen</Button>}
            />
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="Noch keine Rechnungen"
              description={
                <>
                  So erstellen Sie eine Rechnung: <strong className="font-medium text-neutral-700">manuell</strong> mit eigenen Positionen,{' '}
                  <strong className="font-medium text-neutral-700">aus einem Auftrag</strong> (Auftrag öffnen → „Rechnung erstellen“) oder{' '}
                  <strong className="font-medium text-neutral-700">aus einem angenommenen Angebot</strong>. Positionen werden dabei übernommen.
                </>
              }
              action={
                <>
                  <ButtonLink to="/rechnungen/neu" variant="primary" icon={FilePlus2}>
                    Rechnung manuell erstellen
                  </ButtonLink>
                  <ButtonLink to="/auftraege" icon={Hammer}>
                    Zu den Aufträgen
                  </ButtonLink>
                  <ButtonLink to="/angebote?status=Accepted" icon={CircleCheck}>
                    Angenommene Angebote
                  </ButtonLink>
                </>
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
                    <th scope="col" className={cx(table.th, 'hidden text-right xl:table-cell')}>Rechnungsdatum</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Fällig am</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Brutto</th>
                    <th scope="col" className={cx(table.th, 'hidden text-right xl:table-cell')}>Offen</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((i) => (
                    <tr key={i.id} className={table.row}>
                      <td className={cx(table.td, 'whitespace-nowrap')}>
                        <Link
                          to={`/rechnungen/${i.id}`}
                          className={cx('font-medium hover:text-brand-700 hover:underline', i.number ? 'text-neutral-900' : 'text-neutral-500 italic')}
                        >
                          {i.number ?? 'Entwurf'}
                        </Link>
                      </td>
                      <td className={cx(table.td, 'max-w-[220px] xl:max-w-[320px]')}>
                        <p className="truncate font-medium text-neutral-800">{i.customerName}</p>
                        <p className="truncate text-[13px] text-neutral-500">{i.title}</p>
                      </td>
                      <td className={table.td}>
                        <InvoiceStatusBadge status={i.status} kind={i.kind} isOverdue={i.isOverdue} />
                      </td>
                      <td className={cx(table.td, table.num, 'hidden text-neutral-600 xl:table-cell')}>{formatDate(i.issueDate)}</td>
                      <td className={cx(table.td, table.num)}>
                        <DueDate invoice={i} />
                      </td>
                      <td className={cx(table.td, table.num, 'font-medium')}>
                        {invoiceAmount(i.grossTotal, i.kind)}
                        {i.openAmount > 0 && i.openAmount !== i.grossTotal ? (
                          <span className={cx('block text-[12px] font-normal xl:hidden', i.isOverdue ? 'text-danger-text' : 'text-neutral-500')}>
                            offen {formatEur(i.openAmount)}
                          </span>
                        ) : null}
                      </td>
                      <td className={cx(table.td, table.num, 'hidden xl:table-cell', i.openAmount > 0 ? (i.isOverdue ? 'font-medium text-danger-text' : 'text-neutral-800') : 'text-neutral-500')}>
                        {i.openAmount > 0 ? formatEur(i.openAmount) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-neutral-100 md:hidden">
              {list.data.items.map((i) => (
                <li key={i.id}>
                  <Link to={`/rechnungen/${i.id}`} className="block px-4 py-3 hover:bg-neutral-25">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">{i.customerName}</p>
                        <p className="truncate text-[13px] text-neutral-500">
                          {i.number ?? 'Entwurf'} · {i.title}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium whitespace-nowrap tabular">{invoiceAmount(i.grossTotal, i.kind)}</p>
                        {i.openAmount > 0 && i.openAmount !== i.grossTotal && (
                          <p className="text-xs whitespace-nowrap text-neutral-500 tabular">offen {formatEur(i.openAmount)}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <InvoiceStatusBadge status={i.status} kind={i.kind} isOverdue={i.isOverdue} />
                      <span className="text-xs">
                        <DueDate invoice={i} compact />
                      </span>
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
              noun={['Rechnung', 'Rechnungen']}
            />
          </div>
        )}
      </Card>
    </>
  );
}
