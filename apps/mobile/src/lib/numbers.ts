import { parseGermanNumber } from '@angebotpilot/api-contracts';

/** Number → editable German input string (decimal comma, no thousands separator). 1234.5 → "1234,5". */
export function toInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return String(value).replace('.', ',');
}

/** Money → editable input with two decimals. 6.9 → "6,90". */
export function toMoneyInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toFixed(2).replace('.', ',');
}

/** Parses a German decimal input. Returns null for empty input, NaN for invalid input. */
export function fromInput(input: string): number | null {
  if (input.trim() === '') return null;
  return parseGermanNumber(input);
}

/** Rounds to the given number of decimals (avoids binary noise before sending to the API). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
