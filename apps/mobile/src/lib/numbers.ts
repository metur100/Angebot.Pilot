// Editable number strings for inputs, in the notation of the UI language: German "1234,5" / English "1234.5".
import { formatNumberInput, getLocale, parseNumberInput } from '@angebotpilot/api-contracts';

/** Number → editable input string (no thousands separator, up to 3 decimals). 1234.5 → "1234,5" / "1234.5". */
export function toInput(value: number | null | undefined): string {
  return formatNumberInput(value, 3);
}

/** Money → editable input with two decimals. 6.9 → "6,90" / "6.90". */
export function toMoneyInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const fixed = value.toFixed(2);
  return getLocale() === 'de' ? fixed.replace('.', ',') : fixed;
}

/** Parses a typed decimal in the UI notation. Returns null for empty input, NaN for invalid input. */
export function fromInput(input: string): number | null {
  if (input.trim() === '') return null;
  return parseNumberInput(input);
}

/** Example amount for placeholders/hints: "1.234,56" / "1,234.56". */
export function exampleAmount(): string {
  return getLocale() === 'de' ? '1.234,56' : '1,234.56';
}

/** Rounds to the given number of decimals (avoids binary noise before sending to the API). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
