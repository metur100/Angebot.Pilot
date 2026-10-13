import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-lg border border-neutral-200 bg-white shadow-sm', className)} {...rest}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Heading level for document outline (default h2). */
  as?: 'h2' | 'h3';
  id?: string;
}

export function CardHeader({ title, description, actions, className, as: Heading = 'h2', id }: CardHeaderProps) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-neutral-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <Heading id={id} className="text-[15px] leading-6 font-semibold text-neutral-900">
          {title}
        </Heading>
        {description && <p className="mt-0.5 text-[13px] leading-[18px] text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-end gap-2 rounded-b-lg border-t border-neutral-100 bg-neutral-25 px-5 py-3', className)}>
      {children}
    </div>
  );
}

/** Definition list for read-only details. */
export function DetailList({ items, className, columns = 1 }: { items: { label: ReactNode; value: ReactNode; full?: boolean }[]; className?: string; columns?: 1 | 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', columns === 2 && 'sm:grid-cols-2', className)}>
      {items.map((item, index) => (
        <div key={index} className={cx('min-w-0', item.full && 'sm:col-span-2')}>
          <dt className="text-xs font-medium text-neutral-500">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-neutral-900">{item.value || <span className="text-neutral-500">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
