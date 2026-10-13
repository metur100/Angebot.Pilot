import { CircleAlert } from 'lucide-react';
import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { tr } from '@/lib/i18n';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Accessibility props for a control rendered inside a <Field>. */
export function useFieldControl(props: Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid'> & { id?: string }) {
  const field = useContext(FieldContext);
  if (!field) return { id: props.id, 'aria-describedby': props['aria-describedby'], 'aria-invalid': props['aria-invalid'] };
  return {
    id: props.id ?? field.id,
    'aria-describedby': cx(field.describedBy, props['aria-describedby']) || undefined,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
    'aria-required': field.required || undefined,
  };
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  optional?: boolean;
  id?: string;
  className?: string;
  /** Visually hide the label (it stays available to assistive technology). */
  hideLabel?: boolean;
  /** Extra element aligned right of the label (e.g. a help popover). */
  labelAside?: ReactNode;
}

export function Field({ label, children, hint, error, required, optional, id, className, hideLabel, labelAside }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `f${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return (
    <FieldContext.Provider
      value={{ id: controlId, describedBy: cx(errorId, hintId) || undefined, invalid: Boolean(error), required: Boolean(required) }}
    >
      <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
        <div className={cx('flex items-center justify-between gap-2', hideLabel && 'sr-only')}>
          <label htmlFor={controlId} className="text-[13px] font-medium text-neutral-800">
            {label}
            {required && (
              <span aria-hidden className="ml-0.5 text-danger-text">
                *
              </span>
            )}
            {optional && <span className="ml-1.5 font-normal text-neutral-500">{tr('optional', 'optional')}</span>}
          </label>
          {labelAside}
        </div>
        {children}
        {error && (
          <p id={errorId} className="flex items-start gap-1.5 text-[13px] text-danger-text">
            <CircleAlert aria-hidden size={14} className="mt-[3px] shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {hint && (
          <p id={hintId} className="text-[13px] leading-[18px] text-neutral-500">
            {hint}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export const controlBase =
  'block w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-sm ' +
  'placeholder:text-neutral-400 transition-[border-color,box-shadow] ' +
  'hover:border-neutral-400 focus:border-brand-500 focus:shadow-focus focus:outline-none focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 read-only:bg-neutral-50 ' +
  'aria-invalid:border-danger-text aria-invalid:focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger-text)_18%,transparent)]';
