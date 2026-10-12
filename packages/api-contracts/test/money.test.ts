import { describe, expect, it } from 'vitest';
import { addDaysIso, calculateLine, calculateTotals, extractPublicToken, formatDate, formatEur, parseGermanNumber } from '../src';

// These cases mirror tests/api-unit/QuotationCalculatorTests.cs so client previews equal server totals.
describe('calculateTotals', () => {
  it('groups VAT per rate and rounds commercially', () => {
    const totals = calculateTotals(
      [
        { quantity: 3, unitPriceNet: 19.99, discountPercent: 0, taxRatePercent: 19 },
        { quantity: 2.5, unitPriceNet: 48, discountPercent: 10, taxRatePercent: 19 },
        { quantity: 1, unitPriceNet: 12.35, discountPercent: 0, taxRatePercent: 7 },
      ],
      'Standard',
    );
    expect(totals.subtotalBeforeDiscount).toBe(192.32);
    expect(totals.discountTotal).toBe(12);
    expect(totals.netTotal).toBe(180.32);
    expect(totals.taxGroups).toEqual([
      { ratePercent: 19, netAmount: 167.97, taxAmount: 31.91 },
      { ratePercent: 7, netAmount: 12.35, taxAmount: 0.86 },
    ]);
    expect(totals.taxTotal).toBe(32.77);
    expect(totals.grossTotal).toBe(213.09);
  });

  it('charges no VAT for small businesses', () => {
    const totals = calculateTotals([{ quantity: 1, unitPriceNet: 100, discountPercent: 0, taxRatePercent: 19 }], 'SmallBusiness');
    expect(totals.taxTotal).toBe(0);
    expect(totals.grossTotal).toBe(100);
  });

  it('rounds half away from zero', () => {
    expect(calculateLine(1, 0.125, 0).net).toBe(0.13);
    expect(calculateLine(3, 0.335, 0).net).toBe(1.01);
    expect(calculateTotals([{ quantity: 1, unitPriceNet: 0.5, discountPercent: 0, taxRatePercent: 19 }], 'Standard').taxTotal).toBe(0.1);
  });

  it('avoids binary floating point errors', () => {
    const totals = calculateTotals([{ quantity: 3, unitPriceNet: 0.1, discountPercent: 0, taxRatePercent: 0 }], 'Standard');
    expect(totals.netTotal).toBe(0.3);
  });
});

describe('formatting', () => {
  it('formats German currency and dates', () => {
    expect(formatEur(1234.5).replace(/\s/g, ' ')).toBe('1.234,50 €');
    expect(formatDate('2026-10-12')).toBe('12.10.2026');
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('parses German numbers', () => {
    expect(parseGermanNumber('1.234,56')).toBe(1234.56);
    expect(parseGermanNumber('12,5')).toBe(12.5);
    expect(parseGermanNumber('7.5')).toBe(7.5);
    expect(Number.isNaN(parseGermanNumber('abc'))).toBe(true);
  });

  it('extracts public link tokens', () => {
    expect(extractPublicToken('https://app.example/q/abcdefghijklmnopqrstuvwxyz012345')).toBe('abcdefghijklmnopqrstuvwxyz012345');
    expect(extractPublicToken('nope')).toBeNull();
  });
});
