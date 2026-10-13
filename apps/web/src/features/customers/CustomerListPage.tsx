import { customerTypeLabel, type CustomerListItemDto, type CustomerListQuery, type CustomerType } from '@angebotpilot/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, Plus, Search, UserRound, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCompany } from '@/app/company';
import { ExportButton } from '@/components/domain/Common';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
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

export function buildCustomerQuery(params: { q: string; type: string; status: string; sort: string; page: string }): CustomerListQuery {
  return compactQuery({
    search: params.q.trim() || undefined,
    type: (params.type || undefined) as CustomerType | undefined,
    status: params.status as CustomerListQuery['status'],
    sort: params.sort as CustomerListQuery['sort'],
    page: Number(params.page) || 1,
    pageSize: PAGE_SIZE,
  });
}

function CustomerIcon({ type }: { type: CustomerType }) {
  const Icon = type === 'Business' ? Building2 : UserRound;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500" title={customerTypeLabel[type]}>
      <Icon aria-hidden size={15} />
    </span>
  );
}

function NameCell({ customer }: { customer: CustomerListItemDto }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CustomerIcon type={customer.type} />
      <div className="min-w-0">
        <Link to={`/kunden/${customer.id}`} className="block truncate font-medium text-neutral-900 hover:text-brand-700 hover:underline">
          {customer.displayName}
        </Link>
        <p className="truncate text-[13px] text-neutral-500">
          {customerTypeLabel[customer.type]}
          {customer.contactPerson ? ` · ${customer.contactPerson}` : ''}
        </p>
      </div>
      {customer.isArchived && <Badge tone="muted">Archiviert</Badge>}
    </div>
  );
}

export default function CustomerListPage() {
  const { companyId, can } = useCompany();
  const [params, update] = useListParams({ q: '', type: '', status: 'active', sort: 'name', page: '1' });
  const [search, setSearch] = useState(params.q);
  const debounced = useDebouncedValue(search, 300);
  useEffect(() => {
    if (debounced !== params.q) update({ q: debounced });
  }, [debounced, params.q, update]);

  const query = buildCustomerQuery(params);
  const list = useQuery({
    queryKey: qk.customerList(companyId, query),
    queryFn: () => api.customers.list(companyId, query),
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(params.q || params.type || params.status !== 'active');

  return (
    <>
      <PageHeader
        title="Kunden"
        description="Alle Geschäfts- und Privatkunden Ihrer Firma."
        actions={
          <>
            <ExportButton
              allowed={can.exportCsv}
              hint={ADMIN_ONLY_HINT}
              fileName={`kunden-${fileStamp()}.csv`}
              load={() => api.customers.exportCsv(companyId)}
            />
            <ButtonLink to="/kunden/neu" variant="primary" icon={Plus}>
              Neuer Kunde
            </ButtonLink>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 lg:max-w-sm">
            <label htmlFor="customer-search" className="sr-only">
              Kunden suchen
            </label>
            <Input
              id="customer-search"
              type="search"
              icon={Search}
              placeholder="Name, E-Mail oder Ort suchen …"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Status" className="flex gap-1.5">
              {(
                [
                  ['active', 'Aktiv'],
                  ['archived', 'Archiviert'],
                  ['all', 'Alle'],
                ] as const
              ).map(([value, label]) => (
                <FilterChip key={value} selected={params.status === value} onClick={() => update({ status: value })}>
                  {label}
                </FilterChip>
              ))}
            </div>
            <label htmlFor="customer-type" className="sr-only">
              Kundenart
            </label>
            <Select id="customer-type" inputSize="sm" className="w-[170px]" value={params.type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">Alle Kundenarten</option>
              <option value="Business">Geschäftskunden</option>
              <option value="Private">Privatkunden</option>
            </Select>
            <label htmlFor="customer-sort" className="sr-only">
              Sortierung
            </label>
            <Select id="customer-sort" inputSize="sm" className="w-[170px]" value={params.sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="name">Name A–Z</option>
              <option value="-name">Name Z–A</option>
              <option value="-createdAt">Neueste zuerst</option>
              <option value="createdAt">Älteste zuerst</option>
            </Select>
          </div>
        </div>

        {list.isPending ? (
          <TableSkeleton rows={8} columns={5} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="Keine Kunden gefunden"
              description="Passen Sie die Suche oder die Filter an."
              action={
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setSearch('');
                    update({ q: '', type: '', status: 'active' });
                  }}
                >
                  Filter zurücksetzen
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Noch keine Kunden"
              description="Legen Sie Ihren ersten Kunden an – danach können Sie direkt ein Angebot für ihn erstellen."
              action={
                <ButtonLink to="/kunden/neu" variant="primary" icon={Plus}>
                  Ersten Kunden anlegen
                </ButtonLink>
              }
            />
          )
        ) : (
          <div className={cx(list.isPlaceholderData && 'opacity-60 transition-opacity')}>
            {/* Desktop table */}
            <div className={cx(table.wrapper, 'hidden md:block')}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col" className={table.th}>
                      Name
                    </th>
                    <th scope="col" className={table.th}>
                      Kontakt
                    </th>
                    <th scope="col" className={table.th}>
                      Ort
                    </th>
                    <th scope="col" className={cx(table.th, 'text-right')}>
                      Angebote
                    </th>
                    <th scope="col" className={cx(table.th, 'text-right')}>
                      Angenommen (netto)
                    </th>
                    <th scope="col" className={cx(table.th, 'text-right')}>
                      Angelegt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((c) => (
                    <tr key={c.id} className={table.row}>
                      <td className={cx(table.td, 'max-w-[320px]')}>
                        <NameCell customer={c} />
                      </td>
                      <td className={cx(table.td, 'max-w-[240px]')}>
                        <p className="truncate">{c.email ?? <span className="text-neutral-500">–</span>}</p>
                        {c.phone && <p className="truncate text-[13px] text-neutral-500">{c.phone}</p>}
                      </td>
                      <td className={table.td}>{c.city ?? <span className="text-neutral-500">–</span>}</td>
                      <td className={cx(table.td, table.num)}>{c.quotationCount}</td>
                      <td className={cx(table.td, table.num)}>{formatEur(c.acceptedValue)}</td>
                      <td className={cx(table.td, table.num, 'text-neutral-500')}>{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="divide-y divide-neutral-100 md:hidden">
              {list.data.items.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <NameCell customer={c} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-[13px] text-neutral-600">
                    {c.city && <span>{c.city}</span>}
                    <span>{c.quotationCount} Angebote</span>
                    <span>{formatEur(c.acceptedValue)} angenommen</span>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              totalCount={list.data.totalCount}
              onPageChange={(page) => update({ page: String(page) }, { resetPage: false })}
              noun={['Kunde', 'Kunden']}
            />
          </div>
        )}
      </Card>
    </>
  );
}
