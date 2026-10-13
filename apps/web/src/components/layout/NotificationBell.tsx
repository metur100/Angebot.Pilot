import type { NotificationDto } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCompany } from '@/app/company';
import { Spinner } from '@/components/ui/Feedback';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';

/** Route for the entity a notification refers to. */
export function notificationTarget(notification: Pick<NotificationDto, 'entityType' | 'entityId'>): string | null {
  if (!notification.entityId) return null;
  switch (notification.entityType?.toLowerCase()) {
    case 'quotation':
      return `/angebote/${notification.entityId}`;
    case 'job':
      return `/auftraege/${notification.entityId}`;
    case 'invoice':
      return `/rechnungen/${notification.entityId}`;
    case 'customer':
      return `/kunden/${notification.entityId}`;
    default:
      return null;
  }
}

export function useNotificationActions() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.notifications(companyId) });
  const markRead = useMutation({ mutationFn: (id: string) => api.notifications.markRead(companyId, id), onSuccess: invalidate });
  const markAll = useMutation({
    mutationFn: () => api.notifications.markAllRead(companyId),
    onSuccess: invalidate,
    onError: (error) => toast.error(tr('Aktion fehlgeschlagen', 'Action failed'), errorMessage(error)),
  });
  return { markRead, markAll };
}

export function NotificationBell() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    queryKey: qk.unreadCount(companyId),
    queryFn: () => api.notifications.unreadCount(companyId),
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: [...qk.notifications(companyId), 'popover'],
    queryFn: () => api.notifications.list(companyId, { page: 1, pageSize: 8 }),
    enabled: open,
  });
  const { markRead, markAll } = useNotificationActions();
  const count = unread.data?.count ?? 0;

  const openNotification = (notification: NotificationDto) => {
    if (!notification.isRead) markRead.mutate(notification.id);
    const target = notificationTarget(notification);
    setOpen(false);
    if (target) void navigate(target);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            count > 0
              ? tr(`Benachrichtigungen, ${count} ungelesen`, `Notifications, ${count} unread`)
              : tr('Benachrichtigungen', 'Notifications')
          }
          className="relative inline-flex size-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <Bell aria-hidden size={18} />
          {count > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-text px-1 text-[10px] leading-none font-semibold text-white tabular">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="ap-popover z-50 w-[min(380px,calc(100vw-16px))] rounded-xl border border-neutral-200 bg-white shadow-lg focus:outline-none"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">{tr('Benachrichtigungen', 'Notifications')}</p>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={count === 0 || markAll.isPending}
              className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-brand-600 dark:text-brand-700 hover:text-brand-700 dark:hover:text-brand-800 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              <CheckCheck aria-hidden size={14} />
              {tr('Alle als gelesen', 'Mark all as read')}
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {list.isPending ? (
              <div className="px-4 py-6">
                <Spinner />
              </div>
            ) : list.isError ? (
              <p className="px-4 py-6 text-sm text-danger-text">{errorMessage(list.error)}</p>
            ) : list.data.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">{tr('Keine Benachrichtigungen – alles erledigt.', 'No notifications – all caught up.')}</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {list.data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 focus-visible:-outline-offset-2"
                    >
                      <span
                        aria-hidden
                        className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-brand-600')}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-sm', n.isRead ? 'text-neutral-700' : 'font-medium text-neutral-900')}>
                          {n.title}
                          {!n.isRead && <span className="sr-only">{tr(' (ungelesen)', ' (unread)')}</span>}
                        </span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-neutral-500">{n.body}</span>}
                        <span className="mt-1 block text-xs text-neutral-500">{formatRelative(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-neutral-100 px-4 py-2.5">
            <Link
              to="/benachrichtigungen"
              onClick={() => setOpen(false)}
              className="text-[13px] font-medium text-brand-600 dark:text-brand-700 hover:text-brand-700 dark:hover:text-brand-800"
            >
              {tr('Alle Benachrichtigungen anzeigen', 'View all notifications')}
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
