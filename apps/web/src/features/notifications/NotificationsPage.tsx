import type { NotificationDto } from '@angebotpilot/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useCompany } from '@/app/company';
import { notificationTarget, useNotificationActions } from '@/components/layout/NotificationBell';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { FilterChip, PageHeader, Pagination } from '@/components/ui/Page';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useListParams } from '@/lib/listParams';
import { qk } from '@/lib/queryKeys';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [params, update] = useListParams({ filter: 'all', page: '1' });
  const unreadOnly = params.filter === 'unread';
  const page = Number(params.page) || 1;
  const list = useQuery({
    queryKey: [...qk.notifications(companyId), 'page', unreadOnly, page],
    queryFn: () => api.notifications.list(companyId, { unreadOnly: unreadOnly || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const { markRead, markAll } = useNotificationActions();

  const open = (n: NotificationDto) => {
    if (!n.isRead) markRead.mutate(n.id);
    const target = notificationTarget(n);
    if (target) void navigate(target);
  };

  return (
    <>
      <PageHeader
        title="Benachrichtigungen"
        description="Entscheidungen Ihrer Kunden, Versandprobleme und andere Ereignisse."
        actions={
          <Button icon={CheckCheck} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Alle als gelesen markieren
          </Button>
        }
      />
      <Card>
        <div className="flex gap-1.5 border-b border-neutral-100 px-4 py-3 sm:px-5" role="group" aria-label="Filter">
          <FilterChip selected={!unreadOnly} onClick={() => update({ filter: 'all' })}>
            Alle
          </FilterChip>
          <FilterChip selected={unreadOnly} onClick={() => update({ filter: 'unread' })}>
            Ungelesen
          </FilterChip>
        </div>
        {list.isPending ? (
          <TableSkeleton rows={6} columns={2} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'Keine ungelesenen Benachrichtigungen' : 'Noch keine Benachrichtigungen'}
            description="Sie werden hier informiert, sobald ein Kunde ein Angebot annimmt oder ablehnt."
          />
        ) : (
          <div className={cx(list.isPlaceholderData && 'opacity-60')}>
            <ul className="divide-y divide-neutral-100">
              {list.data.items.map((n) => {
                const target = notificationTarget(n);
                return (
                  <li key={n.id} className={cx('flex items-start gap-3 px-4 py-3.5 sm:px-5', !n.isRead && 'bg-brand-50/40')}>
                    <span aria-hidden className={cx('mt-2 size-2 shrink-0 rounded-full', n.isRead ? 'bg-neutral-200' : 'bg-brand-600')} />
                    <div className="min-w-0 flex-1">
                      {target ? (
                        <button type="button" onClick={() => open(n)} className="text-left text-sm font-medium text-neutral-900 hover:text-brand-700 hover:underline">
                          {n.title}
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-neutral-900">{n.title}</p>
                      )}
                      {!n.isRead && <span className="sr-only"> (ungelesen)</span>}
                      {n.body && <p className="mt-0.5 text-[13px] text-neutral-600">{n.body}</p>}
                      <p className="mt-1 text-xs text-neutral-500" title={formatDateTime(n.createdAt)}>
                        {formatRelative(n.createdAt)}
                      </p>
                    </div>
                    {!n.isRead && <IconButton size="sm" icon={Check} label={`„${n.title}“ als gelesen markieren`} onClick={() => markRead.mutate(n.id)} />}
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              totalCount={list.data.totalCount}
              onPageChange={(p) => update({ page: String(p) }, { resetPage: false })}
              noun={['Benachrichtigung', 'Benachrichtigungen']}
            />
          </div>
        )}
      </Card>
    </>
  );
}
