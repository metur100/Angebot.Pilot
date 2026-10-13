import { CircleAlert, CircleCheck, Info, Loader2, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/errors';
import { cx } from '@/lib/cx';
import { Button } from './Button';

type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const alertStyles: Record<AlertTone, { box: string; icon: LucideIcon; iconColor: string }> = {
  info: { box: 'border-info-border bg-info-bg', icon: Info, iconColor: 'text-info-text' },
  success: { box: 'border-success-border bg-success-bg', icon: CircleCheck, iconColor: 'text-success-text' },
  warning: { box: 'border-warning-border bg-warning-bg', icon: TriangleAlert, iconColor: 'text-warning-text' },
  danger: { box: 'border-danger-border bg-danger-bg', icon: CircleAlert, iconColor: 'text-danger-text' },
  neutral: { box: 'border-neutral-200 bg-neutral-50', icon: Info, iconColor: 'text-neutral-500' },
};

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  icon?: LucideIcon;
  /** Use role="alert" for errors that appear as a result of a user action. */
  live?: boolean;
}

export function Alert({ tone = 'info', title, children, actions, className, icon, live }: AlertProps) {
  const style = alertStyles[tone];
  const Icon = icon ?? style.icon;
  return (
    <div role={live ? 'alert' : undefined} className={cx('flex gap-3 rounded-lg border px-4 py-3', style.box, className)}>
      <Icon aria-hidden size={18} className={cx('mt-px shrink-0', style.iconColor)} />
      <div className="min-w-0 flex-1 text-sm leading-5 text-neutral-800">
        {title && <p className="font-semibold text-neutral-900">{title}</p>}
        {children && <div className={cx(Boolean(title) && 'mt-0.5', 'text-neutral-700 [&_a]:font-medium [&_a]:underline')}>{children}</div>}
        {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Wird geladen …', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-2 text-sm text-neutral-500', className)}>
      <Loader2 aria-hidden size={16} className="animate-spin" />
      <span>{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('ap-skeleton rounded-md', className)} />;
}

/** Generic loading placeholder for a page body. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Inhalt wird geladen" className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className={cx('h-5', i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6')} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Table skeleton with a given number of rows/columns. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Liste wird geladen" className="divide-y divide-neutral-100">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cx('h-4', c === 0 ? 'w-40 flex-none' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-500 shadow-sm">
        <Icon aria-hidden size={20} />
      </div>
      <p className="text-[15px] font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Daten konnten nicht geladen werden', className }: { error: unknown; onRetry?: () => void; title?: string; className?: string }) {
  return (
    <div role="alert" className={cx('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-danger-border bg-danger-bg text-danger-text">
        <CircleAlert aria-hidden size={20} />
      </div>
      <p className="text-[15px] font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 max-w-md text-sm text-neutral-600">{errorMessage(error)}</p>
      {onRetry && (
        <Button className="mt-4" icon={RefreshCw} onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}
