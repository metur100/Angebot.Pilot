import { customerSchema, lineItemSchema, parseGermanNumber, quotationSchema } from '@angebotpilot/api-contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumberInput } from '@/components/ui/NumberInput';
import { toCustomerRequest } from '@/features/customers/CustomerForm';
import { buildCustomerQuery } from '@/features/customers/CustomerListPage';
import { buildQuotationQuery, toggleStatus } from '@/features/quotations/QuotationListPage';
import { contrastWithWhite } from '@/lib/color';
import { errorMessage, toFormPath } from '@/lib/errors';
import { compactQuery } from '@/lib/listParams';
import { ApiError } from '@angebotpilot/api-contracts';

describe('German number parsing', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['0,5', 0.5],
    [' 19 % ', 19],
    ['12 €', 12],
  ])('parses %s', (input, expected) => {
    expect(parseGermanNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '--1'])('rejects %s', (input) => {
    expect(parseGermanNumber(input)).toBeNaN();
  });

  it('NumberInput accepts "1.234,56" and shows German formatting after blur', () => {
    function Harness() {
      const [value, setValue] = useState(Number.NaN);
      return (
        <>
          <NumberInput aria-label="Preis" value={value} onValueChange={setValue} minFractionDigits={2} />
          <output data-testid="value">{String(value)}</output>
        </>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Preis');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.234,56' } });
    expect(screen.getByTestId('value')).toHaveTextContent('1234.56');
    fireEvent.blur(input);
    expect(input).toHaveValue('1.234,56');
    fireEvent.focus(input);
    expect(input).toHaveValue('1234,56');
  });
});

describe('customer validation', () => {
  const base = { type: 'Business' as const, billingCountry: 'DE', hasServiceAddress: false, followUpOptOut: false };

  it('requires a company name for business customers', () => {
    const result = customerSchema.safeParse({ ...base, companyName: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('companyName');
  });

  it('requires a last name for private customers', () => {
    const result = customerSchema.safeParse({ ...base, type: 'Private', firstName: 'Anna' });
    expect(result.error?.issues[0]?.message).toBe('Bitte Nachnamen angeben.');
  });

  it('rejects invalid email addresses', () => {
    const result = customerSchema.safeParse({ ...base, companyName: 'Huber KG', email: 'keine-mail' });
    expect(result.error?.issues[0]?.path).toEqual(['email']);
  });

  it('maps form values to the API request (empty → null, conditional fields dropped)', () => {
    const parsed = customerSchema.parse({
      ...base,
      type: 'Private',
      companyName: 'Soll entfallen',
      lastName: ' Yilmaz ',
      email: '',
      vatId: 'DE123',
      serviceStreet: 'Weg 1',
    });
    const request = toCustomerRequest(parsed, 'rv1');
    expect(request).toMatchObject({ type: 'Private', companyName: null, lastName: 'Yilmaz', email: null, vatId: null, serviceStreet: null, rowVersion: 'rv1' });
  });
});

describe('quotation validation', () => {
  const line = { title: 'Montage', description: '', quantity: 2, unit: 'Std.', unitPriceNet: 65, discountPercent: 0, taxRatePercent: 19 };
  const quotation = {
    customerId: '489dac1b-da99-46b5-50df-08df289f0a52', // SQL Server sequential GUID as issued by the API
    title: 'Unterverteilung',
    issueDate: '2026-10-12',
    validUntil: '2026-11-11',
    taxMode: 'Standard' as const,
    lineItems: [line],
  };

  it('accepts a valid quotation with API GUIDs', () => {
    expect(quotationSchema.safeParse(quotation).success).toBe(true);
  });

  it('requires a customer, a title and at least one line item', () => {
    const result = quotationSchema.safeParse({ ...quotation, customerId: '', title: ' ', lineItems: [] });
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['customerId', 'title', 'lineItems']));
  });

  it('rejects validity before the issue date', () => {
    const result = quotationSchema.safeParse({ ...quotation, validUntil: '2026-10-01' });
    expect(result.error?.issues[0]?.message).toBe('Gültig bis muss nach dem Angebotsdatum liegen.');
  });

  it.each([
    [{ quantity: 0 }, 'Die Menge muss größer als 0 sein.'],
    [{ quantity: Number.NaN }, 'Bitte Menge angeben.'],
    [{ unitPriceNet: -1 }, 'Der Preis darf nicht negativ sein.'],
    [{ discountPercent: 120 }, 'Höchstens 100 %.'],
    [{ title: '' }, 'Bitte Bezeichnung angeben.'],
  ])('line item %o → %s', (patch, message) => {
    const result = lineItemSchema.safeParse({ ...line, ...patch });
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe('server error mapping', () => {
  it('converts server field paths to react-hook-form paths', () => {
    expect(toFormPath('lineItems[0].quantity')).toBe('lineItems.0.quantity');
    expect(toFormPath('LineItems[2].UnitPriceNet')).toBe('lineItems.2.unitPriceNet');
    expect(toFormPath('title')).toBe('title');
  });

  it('shows friendly German messages for plan limits and unverified email', () => {
    expect(errorMessage(new ApiError({ status: 402, code: 'quotation_limit' }))).toMatch(/Angebotskontingent/);
    expect(errorMessage(new ApiError({ status: 402, code: 'subscription_inactive' }))).toMatch(/Tarif/);
    expect(errorMessage(new ApiError({ status: 409, code: 'email_not_verified' }))).toMatch(/E-Mail-Adresse/);
    expect(errorMessage(new ApiError({ status: 409, code: 'concurrency_conflict' }))).toMatch(/zwischenzeitlich geändert/);
    expect(errorMessage(new ApiError({ status: 403 }))).toMatch(/Berechtigung/);
  });
});

describe('list query building', () => {
  it('builds the quotation list query from URL state', () => {
    expect(
      buildQuotationQuery({ q: ' AN-2026 ', status: 'Sent,Accepted,Bogus', customer: 'c1', from: '2026-10-01', to: '', sort: '-grossTotal', page: '3' }),
    ).toEqual({ search: 'AN-2026', status: ['Sent', 'Accepted'], customerId: 'c1', from: '2026-10-01', sort: '-grossTotal', page: 3, pageSize: 20 });
  });

  it('drops empty filters', () => {
    expect(buildQuotationQuery({ q: '', status: '', customer: '', from: '', to: '', sort: '-updatedAt', page: '1' })).toEqual({
      sort: '-updatedAt',
      page: 1,
      pageSize: 20,
    });
    expect(compactQuery({ a: '', b: [], c: undefined, d: 0, e: 'x' })).toEqual({ d: 0, e: 'x' });
  });

  it('toggles status chips in a stable order', () => {
    expect(toggleStatus('', 'Accepted')).toBe('Accepted');
    expect(toggleStatus('Accepted', 'Draft')).toBe('Draft,Accepted');
    expect(toggleStatus('Draft,Accepted', 'Draft')).toBe('Accepted');
  });

  it('builds the customer list query', () => {
    expect(buildCustomerQuery({ q: 'huber', type: 'Business', status: 'archived', sort: '-name', page: '2' })).toEqual({
      search: 'huber',
      type: 'Business',
      status: 'archived',
      sort: '-name',
      page: 2,
      pageSize: 20,
    });
  });
});

describe('brand colour contrast', () => {
  it('flags light brand colours for white text', () => {
    expect(contrastWithWhite('#2F45D8')!).toBeGreaterThan(4.5);
    expect(contrastWithWhite('#FFD400')!).toBeLessThan(4.5);
    expect(contrastWithWhite('nope')).toBeNull();
  });
});
