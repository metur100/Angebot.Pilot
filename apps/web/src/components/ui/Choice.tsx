import { Switch as RadixSwitch } from 'radix-ui';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  error?: string | undefined;
}

/** Native checkbox with label and optional description, styled with brand tokens. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, error, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `cb${autoId}`;
  const descId = description ? `${inputId}-desc` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-describedby={cx(errId, descId) || undefined}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-brand-600 disabled:cursor-not-allowed"
          {...props}
        />
        <div className="min-w-0">
          <label htmlFor={inputId} className="cursor-pointer text-sm leading-5 text-neutral-800">
            {label}
          </label>
          {description && (
            <p id={descId} className="mt-0.5 text-[13px] leading-[18px] text-neutral-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p id={errId} className="pl-6.5 text-[13px] text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
});

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** Toggle switch (Radix) with a visible label. */
export function Switch({ checked, onCheckedChange, label, description, disabled, id, className }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? `sw${autoId}`;
  const descId = description ? `${switchId}-desc` : undefined;
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={switchId} className="text-sm font-medium text-neutral-800">
          {label}
        </label>
        {description && (
          <p id={descId} className="mt-0.5 text-[13px] leading-[18px] text-neutral-500">
            {description}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={descId}
        className={cx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
          'disabled:cursor-not-allowed disabled:opacity-55',
          checked ? 'bg-brand-600' : 'bg-neutral-300',
        )}
      >
        <RadixSwitch.Thumb
          className={cx(
            'block size-4 rounded-full bg-on-brand shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </RadixSwitch.Root>
    </div>
  );
}

interface RadioCardOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

interface RadioCardsProps<T extends string> {
  name: string;
  legend: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: RadioCardOption<T>[];
  columns?: 1 | 2 | 3;
  hideLegend?: boolean;
  disabled?: boolean;
}

/** Large selectable cards backed by native radio inputs (keyboard accessible by default). */
export function RadioCards<T extends string>({ name, legend, value, onChange, options, columns = 2, hideLegend, disabled }: RadioCardsProps<T>) {
  const autoId = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className={cx('mb-1.5 text-[13px] font-medium text-neutral-800', hideLegend && 'sr-only')}>{legend}</legend>
      <div className={cx('grid gap-2', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>
        {options.map((option) => {
          const optionId = `${name}-${autoId}-${option.value}`;
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cx(
                'relative flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500',
                selected ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-neutral-200 hover:border-neutral-300',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-brand-600"
              />
              {option.icon}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900">{option.label}</span>
                {option.description && <span className="mt-0.5 block text-[13px] leading-[18px] text-neutral-500">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
