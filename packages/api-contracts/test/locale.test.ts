import { afterEach, describe, expect, it } from 'vitest';
import {
  detectLocale, errorMessage, formatDate, formatEur, formatPercent, invoiceDisplayStatus, jobStatusLabel, loginSchema,
  NetworkError, parseNumberInput, paymentMethodSuggestions, setLocale,
} from '../src';

describe('locale', () => {
  afterEach(() => setLocale('de'));

  it('detects the language from browser tags and defaults to German', () => {
    expect(detectLocale(['en-US', 'de-DE'])).toBe('en');
    expect(detectLocale(['de-AT'])).toBe('de');
    expect(detectLocale(['fr-FR', 'en-GB'])).toBe('en');
    expect(detectLocale(['fr-FR'])).toBe('de');
    expect(detectLocale([])).toBe('de');
  });

  it('switches labels in place', () => {
    const labels = jobStatusLabel;
    expect(labels.InProgress).toBe('In Arbeit');
    setLocale('en');
    expect(labels.InProgress).toBe('In progress');
    expect(paymentMethodSuggestions[0]).toBe('Bank transfer');
    expect(invoiceDisplayStatus({ kind: 'Invoice', status: 'Issued', isOverdue: true }).label).toBe('Overdue');
    setLocale('de');
    expect(labels.InProgress).toBe('In Arbeit');
    expect(paymentMethodSuggestions[0]).toBe('Überweisung');
  });

  it('formats money, dates and percentages per locale', () => {
    expect(formatEur(1234.5)).toBe('1.234,50 €');
    expect(formatDate('2026-10-12')).toBe('12.10.2026');
    expect(formatPercent(19)).toBe('19 %');
    setLocale('en');
    expect(formatEur(1234.5)).toBe('€1,234.50');
    expect(formatDate('2026-10-12')).toBe('12/10/2026');
    expect(formatPercent(19)).toBe('19%');
  });

  it('parses numbers typed in the UI language', () => {
    expect(parseNumberInput('1.234,56')).toBe(1234.56);
    setLocale('en');
    expect(parseNumberInput('1,234.56')).toBe(1234.56);
    expect(parseNumberInput('1234.5')).toBe(1234.5);
    expect(parseNumberInput('2,5')).toBe(2.5);
    expect(parseNumberInput('1,234')).toBe(1234);
    expect(parseNumberInput('abc')).toBeNaN();
  });

  it('translates validation and error messages at use time', () => {
    setLocale('en');
    const result = loginSchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain('Please enter your password.');
    expect(errorMessage(new Error('x'))).toBe('An unexpected error occurred.');
    expect(new NetworkError().message).toBe('Cannot reach the server. Please check your internet connection.');
  });
});
