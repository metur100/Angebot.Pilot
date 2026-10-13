import { ChevronDown, type LucideIcon } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { controlBase, useFieldControl } from './Field';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  /** Text shown inside the right edge (e.g. "€" or "%"). */
  suffix?: string;
  inputSize?: 'sm' | 'md';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon: Icon, suffix, inputSize = 'md', ...props },
  ref,
) {
  const a11y = useFieldControl(props);
  const height = inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9';
  if (!Icon && !suffix) {
    return <input ref={ref} className={cx(controlBase, height, className)} {...props} {...a11y} />;
  }
  return (
    <div className="relative min-w-0">
      {Icon && <Icon aria-hidden size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400" />}
      <input
        ref={ref}
        className={cx(controlBase, height, Icon && 'pl-9', suffix && 'pr-8', className)}
        {...props}
        {...a11y}
      />
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-neutral-500">
          {suffix}
        </span>
      )}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  const a11y = useFieldControl(props);
  return <textarea ref={ref} rows={rows} className={cx(controlBase, 'min-h-[60px] py-2 leading-5', className)} {...props} {...a11y} />;
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, inputSize = 'md', ...props }, ref) {
  const a11y = useFieldControl(props);
  return (
    <div className={cx('relative min-w-0', className)}>
      <select
        ref={ref}
        className={cx(controlBase, inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9', 'appearance-none pr-9')}
        {...props}
        {...a11y}
      >
        {children}
      </select>
      <ChevronDown aria-hidden size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500" />
    </div>
  );
});
