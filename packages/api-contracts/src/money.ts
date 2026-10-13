import Big from 'big.js';
import type { LineItemInput, TaxMode, TotalsDto } from './types';
import { getLocale, intlLocale, type Locale } from './locale';

// Client-side preview of the server calculation (apps/api/.../QuotationCalculator.cs).
// The server is authoritative; this exists so editors can show live totals.
// Rounding: commercial rounding (half away from zero) to 2 decimals; VAT per tax-rate group.

const HALF_UP = 1; // Big.roundHalfUp — rounds half away from zero

function round2(value: Big): Big {
  return value.round(2, HALF_UP);
}

function big(value: number | string | null | undefined): Big {
  if (value === null || value === undefined || value === '') return new Big(0);
  try {
    return new Big(typeof value === 'number' ? value.toString() : value.replace(',', '.'));
  } catch {
    return new Big(0);
  }
}

export interface LineCalculation {
  beforeDiscount: number;
  discount: number;
  net: number;
}

export function calculateLine(quantity: number, unitPriceNet: number, discountPercent: number): LineCalculation {
  const before = round2(big(quantity).times(big(unitPriceNet)));
  const discount = round2(before.times(big(discountPercent)).div(100));
  return { beforeDiscount: before.toNumber(), discount: discount.toNumber(), net: before.minus(discount).toNumber() };
}

export function calculateTotals(lines: readonly Pick<LineItemInput, 'quantity' | 'unitPriceNet' | 'discountPercent' | 'taxRatePercent'>[], taxMode: TaxMode): TotalsDto {
  let subtotal = new Big(0);
  let discountTotal = new Big(0);
  let netTotal = new Big(0);
  const netByRate = new Map<string, Big>();

  for (const line of lines) {
    const before = round2(big(line.quantity).times(big(line.unitPriceNet)));
    const discount = round2(before.times(big(line.discountPercent)).div(100));
    const net = before.minus(discount);
    subtotal = subtotal.plus(before);
    discountTotal = discountTotal.plus(discount);
    netTotal = netTotal.plus(net);
    const rate = taxMode === 'Standard' ? big(line.taxRatePercent).toString() : '0';
    netByRate.set(rate, (netByRate.get(rate) ?? new Big(0)).plus(net));
  }

  const taxGroups = [...netByRate.entries()]
    .map(([rate, net]) => ({ rate: new Big(rate), net }))
    .sort((a, b) => b.rate.cmp(a.rate))
    .map(({ rate, net }) => ({
      ratePercent: rate.toNumber(),
      netAmount: net.toNumber(),
      taxAmount: round2(net.times(rate).div(100)).toNumber(),
    }));
  const taxTotal = taxGroups.reduce((sum, g) => sum.plus(g.taxAmount), new Big(0));

  return {
    subtotalBeforeDiscount: subtotal.toNumber(),
    discountTotal: discountTotal.toNumber(),
    netTotal: netTotal.toNumber(),
    taxGroups,
    taxTotal: taxTotal.toNumber(),
    grossTotal: netTotal.plus(taxTotal).toNumber(),
  };
}

// ---------- Formatting (follows the UI locale, see locale.ts) ----------

const formatters = new Map<Locale, { eur: Intl.NumberFormat; decimal: Intl.NumberFormat; percent: Intl.NumberFormat }>();

function fmt() {
  const locale = getLocale();
  let f = formatters.get(locale);
  if (!f) {
    const tag = intlLocale[locale];
    f = {
      eur: new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' }),
      decimal: new Intl.NumberFormat(tag, { maximumFractionDigits: 3 }),
      percent: new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }),
    };
    formatters.set(locale, f);
  }
  return f;
}

/** 1234.5 → "1.234,50 €" (de) / "€1,234.50" (en) */
export function formatEur(value: number | null | undefined): string {
  return fmt().eur.format(value ?? 0);
}

/** 2.5 → "2,5" (de) / "2.5" (en) */
export function formatQuantity(value: number): string {
  return fmt().decimal.format(value);
}

/** 19 → "19 %" (de) / "19%" (en) */
export function formatPercent(value: number): string {
  return getLocale() === 'en' ? `${fmt().percent.format(value)}%` : `${fmt().percent.format(value)} %`;
}

/** Parses German user input such as "1.234,56" or "1234.56" into a number; returns NaN when invalid. */
export function parseGermanNumber(input: string): number {
  const trimmed = input.trim().replace(/\s|€|%/g, '');
  if (trimmed === '') return Number.NaN;
  let normalised = trimmed;
  if (trimmed.includes(',')) {
    normalised = trimmed.replace(/\./g, '').replace(',', '.');
  }
  return /^-?\d+(\.\d+)?$/.test(normalised) ? Number(normalised) : Number.NaN;
}

/**
 * Parses a number typed in the current UI locale; returns NaN when invalid. German accepts "1.234,56" and
 * "1234.56"; English accepts "1,234.56" and "1234.56" (a lone comma is read as a decimal separator, e.g. "2,5").
 */
export function parseNumberInput(input: string): number {
  if (getLocale() === 'de') return parseGermanNumber(input);
  const trimmed = input.trim().replace(/\s|€|%/g, '');
  if (trimmed === '') return Number.NaN;
  let normalised = trimmed;
  if (trimmed.includes('.') || /,\d{3}(,|$)/.test(trimmed)) {
    normalised = trimmed.replace(/,/g, '');
  } else if (trimmed.includes(',')) {
    normalised = trimmed.replace(',', '.');
  }
  return /^-?\d+(\.\d+)?$/.test(normalised) ? Number(normalised) : Number.NaN;
}

/** Formats a number for an input field in the current UI locale without grouping: 1234.5 → "1234,5" / "1234.5". */
export function formatNumberInput(value: number | null | undefined, maximumFractionDigits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(intlLocale[getLocale()], { maximumFractionDigits, useGrouping: false }).format(value);
}

/** "2026-10-12" → "12.10.2026" (de) / "12/10/2026" (en); no timezone conversion for date-only values. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '–';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return getLocale() === 'en' ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
}

/** Formats an ISO timestamp in the company time zone, e.g. "12.10.2026, 14:05" (de) / "12/10/2026, 14:05" (en). */
export function formatDateTime(iso: string | null | undefined, timeZone = 'Europe/Berlin'): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat(intlLocale[getLocale()], {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/** Today's date (yyyy-MM-dd) in the given time zone. */
export function todayIso(timeZone = 'Europe/Berlin', now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
