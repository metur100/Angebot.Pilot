import { formatEur, type InvoiceStatus, type MembershipRole } from '@angebotpilot/api-contracts';

import { validatePaymentAmount } from '@/features/invoices/ActionSheets';
import { availableInvoiceActions } from '@/features/invoices/actions';
import { invoiceQueryFor } from '@/features/invoices/InvoiceListScreen';
import { formatInvoiceAmount, invoiceFileName, invoiceHeaderTitle, invoiceLabel } from '@/lib/invoices';

import { invoice } from './helpers/fixtures';

const names = (status: InvoiceStatus, role: MembershipRole = 'Owner', extra: Parameters<typeof invoice>[1] = {}) => {
  const { primary, more } = availableInvoiceActions(invoice(status, { role, ...extra }));
  return { primary: primary.map((a) => a.action), more: more.map((a) => a.action) };
};

describe('invoice actions by status and role (from allowedActions)', () => {
  it('Draft (Owner/Admin): issue + edit; PDF preview, copy, delete', () => {
    expect(names('Draft')).toEqual({ primary: ['issue', 'edit'], more: ['pdf', 'duplicate', 'delete'] });
    expect(names('Draft', 'Admin').primary).toContain('issue');
    expect(availableInvoiceActions(invoice('Draft')).more[0]!.label).toBe('PDF-Vorschau teilen');
  });

  it('Draft (Employee): may edit, but not issue', () => {
    expect(names('Draft', 'Employee')).toEqual({ primary: ['edit'], more: ['pdf', 'duplicate', 'delete'] });
  });

  it('Issued, not yet sent: send + record payment; reminder, PDF, XML, copy, cancel', () => {
    expect(names('Issued')).toEqual({ primary: ['send', 'recordPayment'], more: ['remind', 'pdf', 'xml', 'duplicate', 'cancel'] });
  });

  it('Issued and sent: record payment first, "Erneut senden" in the sheet', () => {
    const { primary, more } = availableInvoiceActions(invoice('Issued', { sentAt: '2026-10-05T10:00:00Z' }));
    expect(primary.map((a) => a.action)).toEqual(['recordPayment']);
    expect(more.find((a) => a.action === 'send')?.label).toBe('Erneut senden');
  });

  it('Overdue: the payment reminder becomes a primary action', () => {
    expect(names('Issued', 'Owner', { sentAt: '2026-10-05T10:00:00Z', isOverdue: true, daysOverdue: 3 }).primary).toEqual(['recordPayment', 'remind']);
  });

  it('Issued (Employee): only PDF, XML and copy', () => {
    expect(names('Issued', 'Employee')).toEqual({ primary: [], more: ['pdf', 'xml', 'duplicate'] });
  });

  it('PartiallyPaid: still open for payments', () => {
    expect(names('PartiallyPaid').primary).toContain('recordPayment');
  });

  it('Paid: no payment actions, but resend and cancellation remain possible', () => {
    expect(names('Paid')).toEqual({ primary: ['send'], more: ['pdf', 'xml', 'duplicate', 'cancel'] });
  });

  it('Cancelled: documents and copy only', () => {
    expect(names('Cancelled', 'Owner', { sentAt: '2026-10-05T10:00:00Z' })).toEqual({ primary: [], more: ['send', 'pdf', 'xml', 'duplicate'] });
  });

  it('Cancellation invoice (Stornorechnung): can be sent, never paid, copied or cancelled', () => {
    expect(names('Issued', 'Owner', { kind: 'Cancellation', allowedActions: ['send'] })).toEqual({ primary: ['send'], more: ['pdf', 'xml'] });
  });

  it('XML is only offered once the e-invoice exists', () => {
    expect(names('Issued', 'Owner', { hasEInvoice: false }).more).not.toContain('xml');
  });
});

describe('invoice display helpers', () => {
  it('negates cancellation amounts with a real minus sign', () => {
    expect(formatInvoiceAmount(571.2, 'Invoice')).toBe(formatEur(571.2));
    expect(formatInvoiceAmount(571.2, 'Cancellation')).toBe(`−${formatEur(571.2)}`);
    expect(formatInvoiceAmount(0, 'Cancellation')).toBe(formatEur(0));
  });

  it('labels drafts, invoices and cancellations', () => {
    expect(invoiceLabel({ number: null, kind: 'Invoice' })).toBe('Entwurf');
    expect(invoiceLabel({ number: 'RE-2026-0002', kind: 'Cancellation' })).toBe('Stornorechnung RE-2026-0002');
    expect(invoiceHeaderTitle({ number: null, kind: 'Invoice' })).toBe('Rechnungsentwurf');
    expect(invoiceFileName({ number: 'RE-2026-0001', kind: 'Invoice' })).toBe('Rechnung_RE-2026-0001');
  });

  it('maps list filters to the API query', () => {
    expect(invoiceQueryFor('all')).toEqual({});
    expect(invoiceQueryFor('draft')).toEqual({ status: ['Draft'] });
    expect(invoiceQueryFor('open')).toEqual({ status: ['Issued', 'PartiallyPaid'] });
    expect(invoiceQueryFor('overdue')).toEqual({ overdue: true });
    expect(invoiceQueryFor('paid')).toEqual({ status: ['Paid'] });
    expect(invoiceQueryFor('cancelled')).toEqual({ status: ['Cancelled'] });
  });
});

describe('payment amount (German input)', () => {
  it.each([
    ['571,20', 571.2],
    ['1.000,5', 1000.5],
    ['200', 200],
  ])('accepts %s', (input, amount) => {
    expect(validatePaymentAmount(input, 1200)).toEqual({ amount });
  });

  it.each([
    ['', 'Bitte Betrag angeben.'],
    ['zwei', 'Bitte einen Betrag eingeben, z. B. 1.234,56.'],
    ['0', 'Der Betrag muss größer als 0 € sein.'],
    ['600', `Höchstens der offene Betrag von ${formatEur(571.2)}.`],
  ])('rejects "%s"', (input, error) => {
    expect(validatePaymentAmount(input, 571.2)).toEqual({ error });
  });
});
