import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { cx } from '@/lib/cx';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(tone: ToastTone, title: string, description?: string) {
  const item: ToastItem = { id: nextId++, tone, title, description };
  items = [...items.slice(-3), item];
  emit();
  return item.id;
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Global toast API, usable outside React (e.g. in mutation callbacks). */
export const toast = {
  success: (title: string, description?: string) => push('success', title, description),
  error: (title: string, description?: string) => push('error', title, description),
  info: (title: string, description?: string) => push('info', title, description),
  clear: () => {
    items = [];
    emit();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => items;

const icons = { success: CircleCheck, error: CircleAlert, info: Info };
const iconColor = { success: 'text-success-solid', error: 'text-danger-text', info: 'text-brand-600' };

function ToastCard({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const timeout = window.setTimeout(() => dismissToast(item.id), item.tone === 'error' ? 8000 : 5000);
    return () => window.clearTimeout(timeout);
  }, [item.id, item.tone, paused]);
  const Icon = icons[item.tone];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="ap-popover pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-lg"
    >
      <Icon aria-hidden size={18} className={cx('mt-px shrink-0', iconColor[item.tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[13px] text-neutral-600">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label="Hinweis schließen"
        className="-mt-0.5 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}

/** Renders toasts in polite (success/info) and assertive (error) live regions. */
export function Toaster() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const polite = current.filter((item) => item.tone !== 'error');
  const assertive = current.filter((item) => item.tone === 'error');
  return (
    <div className="no-print pointer-events-none fixed right-0 bottom-0 z-[60] flex w-full max-w-[420px] flex-col gap-2 p-4 sm:right-2 sm:bottom-2">
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {polite.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
        {assertive.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
