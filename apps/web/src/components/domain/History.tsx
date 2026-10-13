import { emailKindLabel, type ActorType, type EmailDeliveryDto } from '@angebotpilot/api-contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { Bot, History, Mail, User, type LucideIcon } from 'lucide-react';
import { EmailStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { HelpPopover } from '@/components/ui/Menu';
import { table } from '@/components/ui/Page';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { tr } from '@/lib/i18n';

export interface TimelineEvent<T extends string> {
  id: string;
  type: T;
  occurredAt: string;
  actorType: ActorType;
  actorName: string | null;
  details: string | null;
}

const actorLabel = (actor: ActorType): string =>
  ({ User: tr('Benutzer', 'User'), Customer: tr('Kunde', 'Customer'), System: tr('System', 'System') })[actor];
const actorIcon: Record<ActorType, LucideIcon> = { User, Customer: User, System: Bot };

interface EventTimelineProps<T extends string> {
  query: UseQueryResult<TimelineEvent<T>[]>;
  labels: Record<T, string>;
  icons?: Partial<Record<T, LucideIcon>>;
  /** Tailwind classes for highlighted event types. */
  tones?: Partial<Record<T, string>>;
}

/** Chronological event history (newest first) of a document. */
export function EventTimeline<T extends string>({ query, labels, icons = {}, tones = {} }: EventTimelineProps<T>) {
  if (query.isPending) return <Spinner className="p-5" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) return <EmptyState compact icon={History} title={tr('Noch keine Ereignisse', 'No events yet')} />;
  const sorted = [...query.data].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <ol className="px-5 py-4" aria-label={tr('Verlauf', 'History')}>
      {sorted.map((event, index) => {
        const Icon = icons[event.type] ?? History;
        const ActorIcon = actorIcon[event.actorType];
        return (
          <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {index < sorted.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-neutral-200" />}
            <span className={cx('relative flex size-8 shrink-0 items-center justify-center rounded-full', tones[event.type] ?? 'bg-neutral-100 text-neutral-500')}>
              <Icon aria-hidden size={15} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium text-neutral-900">{labels[event.type] ?? event.type}</p>
              {event.details && <p className="mt-0.5 text-[13px] break-words text-neutral-600">{event.details}</p>}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
                <ActorIcon aria-hidden size={12} />
                {event.actorName ?? actorLabel(event.actorType)}
                <span aria-hidden>·</span>
                <time dateTime={event.occurredAt} title={formatDateTime(event.occurredAt)}>
                  {formatDateTime(event.occurredAt)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** E-mail deliveries of a document with an explanation of the delivery states. */
export function DeliveryTable({ query, emptyDescription }: { query: UseQueryResult<EmailDeliveryDto[]>; emptyDescription: string }) {
  return (
    <div>
      <div className="flex items-start gap-2 border-b border-neutral-100 bg-neutral-25 px-5 py-3 text-[13px] text-neutral-600">
        <span>
          <strong className="font-medium text-neutral-800">{tr('„An Mailserver übergeben“', '“Handed to mail server”')}</strong>
          {tr(
            ' heißt: Unser Mailserver hat die E-Mail angenommen. Das ist keine Bestätigung, dass sie im Postfach angekommen ist (z. B. Spam-Filter).',
            ' means: our mail server has accepted the email. This does not confirm that it reached the inbox (e.g. spam filters).',
          )}
        </span>
        <HelpPopover label={tr('Erklärung der Versandstatus', 'Delivery statuses explained')}>
          <ul className="space-y-1">
            <li><strong>{tr('In Warteschlange', 'Queued')}</strong>{tr(' – wird in Kürze versendet.', ' – will be sent shortly.')}</li>
            <li>
              <strong>{tr('An Mailserver übergeben', 'Handed to mail server')}</strong>
              {tr(' – vom Mailserver angenommen; Zustellung ins Postfach nicht garantiert.', ' – accepted by the mail server; delivery to the inbox is not guaranteed.')}
            </li>
            <li>
              <strong>{tr('Erneuter Versuch geplant', 'Retry scheduled')}</strong>
              {tr(' – vorübergehender Fehler, wir versuchen es automatisch erneut.', ' – temporary error, we will retry automatically.')}
            </li>
            <li><strong>{tr('Fehlgeschlagen', 'Failed')}</strong>{tr(' – endgültig nicht versendet, z. B. ungültige Adresse.', ' – permanently not sent, e.g. invalid address.')}</li>
          </ul>
        </HelpPopover>
      </div>
      {query.isPending ? (
        <Spinner className="p-5" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState compact icon={Mail} title={tr('Noch keine E-Mails', 'No emails yet')} description={emptyDescription} />
      ) : (
        <div className={table.wrapper}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>{tr('Art', 'Type')}</th>
                <th scope="col" className={table.th}>{tr('Empfänger & Betreff', 'Recipient & subject')}</th>
                <th scope="col" className={table.th}>{tr('Status', 'Status')}</th>
                <th scope="col" className={cx(table.th, 'text-right')}>{tr('Zeitpunkt', 'Time')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((d) => (
                <tr key={d.id} className={table.row}>
                  <td className={cx(table.td, 'whitespace-nowrap')}>{emailKindLabel[d.kind]}</td>
                  <td className={cx(table.td, 'max-w-[320px]')}>
                    <p className="truncate">{d.toAddress}</p>
                    <p className="truncate text-[13px] text-neutral-500">{d.subject}</p>
                    {d.lastError && <p className="mt-0.5 text-[13px] text-danger-text">{tr('Fehler: ', 'Error: ')}{d.lastError}</p>}
                  </td>
                  <td className={table.td}>
                    <EmailStatusBadge status={d.status} />
                    {d.attempts > 1 && <p className="mt-1 text-xs text-neutral-500">{tr(`${d.attempts} Versuche`, `${d.attempts} attempts`)}</p>}
                  </td>
                  <td className={cx(table.td, table.num, 'text-[13px] text-neutral-600')}>
                    {d.handedOffAt
                      ? formatDateTime(d.handedOffAt)
                      : d.nextAttemptAt
                        ? tr(`nächster Versuch ${formatDateTime(d.nextAttemptAt)}`, `next attempt ${formatDateTime(d.nextAttemptAt)}`)
                        : formatDateTime(d.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
