import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '@/lib/cx';
import { useDocumentTitle } from '@/lib/hooks';
import { formatCount, tr } from '@/lib/i18n';

interface PageHeaderProps {
  title: ReactNode;
  /** Plain-text title for document.title (defaults to title when it is a string). */
  documentTitle?: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, documentTitle, description, actions, back, meta, className }: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? (typeof title === 'string' ? title : null));
  return (
    <header className={cx('mb-6', className)}>
      {back && (
        <Link
          to={back.to}
          className="mb-3 inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft aria-hidden size={14} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-[22px] leading-8 font-semibold tracking-[-0.01em] text-neutral-900">{title}</h1>
            {meta}
          </div>
          {description && <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  noun?: [string, string];
}

export function Pagination({ page, pageSize, totalCount, onPageChange, noun = [tr('Eintrag', 'entry'), tr('Einträgen', 'entries')] }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);
  return (
    <nav aria-label={tr('Seitennavigation', 'Pagination')} className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
      <p className="text-[13px] text-neutral-500 tabular">
        {totalCount === 0
          ? tr(`Keine ${noun[1]}`, `No ${noun[1]}`)
          : tr(
              `${formatCount(first)}–${formatCount(last)} von ${formatCount(totalCount)} ${totalCount === 1 ? noun[0] : noun[1]}`,
              `${formatCount(first)}–${formatCount(last)} of ${formatCount(totalCount)} ${totalCount === 1 ? noun[0] : noun[1]}`,
            )}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 text-[13px] font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft aria-hidden size={15} />
          {tr('Zurück', 'Previous')}
        </button>
        <span className="px-2 text-[13px] text-neutral-600 tabular" aria-current="page">
          {tr(`Seite ${page} von ${pageCount}`, `Page ${page} of ${pageCount}`)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 text-[13px] font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tr('Weiter', 'Next')}
          <ChevronRight aria-hidden size={15} />
        </button>
      </div>
    </nav>
  );
}

/** Shared table styles. Tables scroll horizontally inside their card on narrow screens. */
export const table = {
  wrapper: 'relative overflow-x-auto',
  table: 'w-full border-collapse text-sm',
  th: 'h-10 border-b border-neutral-200 bg-neutral-25 px-4 text-left text-xs font-medium whitespace-nowrap text-neutral-500 first:pl-5 last:pr-5',
  td: 'border-b border-neutral-100 px-4 py-3 align-middle text-neutral-800 first:pl-5 last:pr-5',
  row: 'group transition-colors hover:bg-neutral-25',
  num: 'text-right tabular whitespace-nowrap',
};

/** Segmented control of toggle buttons (e.g. filter chips). */
export function FilterChip({ selected, onClick, children, count }: { selected: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
        selected
          ? 'border-brand-600 bg-brand-600 text-on-brand hover:bg-brand-solid-hover'
          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('tabular', selected ? 'text-on-brand/80' : 'text-neutral-500')}>{count}</span>}
    </button>
  );
}
