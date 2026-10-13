import { parseNumberInput } from '@angebotpilot/api-contracts';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { currentIntlLocale } from '@/lib/i18n';
import { controlBase, useFieldControl } from './Field';

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> {
  /** NaN represents an empty or invalid entry. */
  value: number;
  onValueChange: (value: number) => void;
  minFractionDigits?: number;
  maxFractionDigits?: number;
  suffix?: string;
  inputSize?: 'sm' | 'md';
  align?: 'left' | 'right';
}

function formatDisplay(value: number, min: number, max: number, grouping: boolean) {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(currentIntlLocale(), { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping }).format(value);
}

/**
 * Text input for numbers in the UI language: German accepts "1.234,56", "1234,56" and "1234.56", English "1,234.56" and
 * "1234.56" (see parseNumberInput). The value passed to onValueChange is always a plain number.
 * Shows the formatted value when not focused and the raw text while editing.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, minFractionDigits = 0, maxFractionDigits = 2, suffix, inputSize = 'md', align = 'right', className, onFocus, onBlur, ...props },
  ref,
) {
  const a11y = useFieldControl(props);
  const [editing, setEditing] = useState<string | null>(null);
  const display = editing ?? formatDisplay(value, minFractionDigits, maxFractionDigits, true);

  return (
    <div className="relative min-w-0">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={display}
        onFocus={(event) => {
          setEditing(formatDisplay(value, 0, maxFractionDigits, false));
          onFocus?.(event);
        }}
        onChange={(event) => {
          const text = event.target.value;
          setEditing(text);
          onValueChange(parseNumberInput(text));
        }}
        onBlur={(event) => {
          setEditing(null);
          onBlur?.(event);
        }}
        className={cx(
          controlBase,
          'tabular',
          inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9',
          align === 'right' && 'text-right',
          suffix && 'pr-7',
          className,
        )}
        {...props}
        {...a11y}
      />
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] text-neutral-500">
          {suffix}
        </span>
      )}
    </div>
  );
});
