import { formatEur, todayIso } from '@angebotpilot/api-contracts';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import DashboardScreen from '@/app/(app)/(tabs)/index';
import InvoiceDetailScreen from '@/features/invoices/InvoiceDetailScreen';
import InvoiceEditorScreen from '@/features/invoices/InvoiceEditorScreen';
import InvoiceListScreen from '@/features/invoices/InvoiceListScreen';
import JobDetailScreen from '@/features/jobs/JobDetailScreen';
import QuotationDetailScreen from '@/features/quotation-detail/QuotationDetailScreen';
import { restoreSession } from '@/lib/session';
import { colors } from '@/theme';

import { mockApi } from './helpers/api';
import {
  auth, c, CUSTOMER_ID, customer, customerListItem, dashboard, invoice, INVOICE_ID, invoiceListItem, job, me, page, quotation, QUOTATION_ID,
  settings, taxRates,
} from './helpers/fixtures';
import { renderScreen, resetAll } from './helpers/render';

async function signedIn(routes: Record<string, unknown>, role: 'Owner' | 'Employee' = 'Owner') {
  const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  SecureStore.__store.set('angebotpilot.refreshToken', 'refresh-1');
  const user = { ...me, companies: me.companies.map((m) => ({ ...m, role })) };
  const mock = mockApi({
    'POST /auth/refresh': { body: auth({ user }) },
    [`GET ${c(`/invoices/${INVOICE_ID}/events`)}`]: {
      body: [{ id: 'ie-1', type: 'Created', occurredAt: '2026-10-05T08:00:00Z', actorType: 'User', actorName: 'Anna Muster', details: null }],
    },
    ...routes,
  } as never);
  await restoreSession();
  return mock;
}

beforeEach(() => resetAll());

describe('invoice list', () => {
  it('renders invoices as cards: number or "Entwurf", status text, overdue in danger, negated cancellations', async () => {
    await signedIn({
      [`GET ${c('/invoices')}`]: {
        body: page([
          invoiceListItem(1, 'Draft'),
          invoiceListItem(2, 'Issued', { isOverdue: true, daysOverdue: 5 }),
          invoiceListItem(3, 'Issued', { kind: 'Cancellation', openAmount: 0 }),
          invoiceListItem(4, 'Paid'),
        ], 4),
      },
    });
    renderScreen({ invoices: InvoiceListScreen, 'invoice/[id]': () => null }, '/invoices');
    const draftCard = await screen.findByTestId('invoice-card-inv-1');
    expect(within(draftCard).getAllByText('Entwurf')).toHaveLength(2); // number placeholder + status badge
    expect(within(draftCard).getByText('Nummer wird beim Stellen vergeben')).toBeTruthy();
    expect(screen.getByLabelText('Status: Überfällig')).toBeTruthy();
    expect(screen.getByTestId('invoice-due-inv-2')).toHaveTextContent('5 Tage überfällig (fällig 15.10.2026)');
    expect(StyleSheet.flatten(screen.getByTestId('invoice-due-inv-2').props.style).color).toBe(colors.danger);
    expect(screen.getByText('Stornorechnung RE-2026-0003')).toBeTruthy();
    expect(screen.getByText(`−${formatEur(3570)}`)).toBeTruthy();
    expect(screen.getByLabelText('Status: Bezahlt')).toBeTruthy();
    expect(screen.getByText('4 Rechnungen')).toBeTruthy();
    expect(screen.getByTestId('fab-new-invoice')).toBeTruthy();
  });

  it('filters overdue invoices via chip (overdue=true) and adopts ?filter=open from the dashboard', async () => {
    const mock = await signedIn({ [`GET ${c('/invoices')}`]: { body: page([invoiceListItem(1)]) } });
    renderScreen({ invoices: InvoiceListScreen, 'invoice/[id]': () => null }, '/invoices?filter=open');
    await screen.findByTestId('invoice-card-inv-1');
    expect(mock.callsTo(`GET ${c('/invoices')}`)[0]!.query.get('status')).toBe('Issued,PartiallyPaid');
    expect(screen.getByLabelText('Filter Offen').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId('chip-overdue'));
    await waitFor(() => expect(mock.callsTo(`GET ${c('/invoices')}`).some((r) => r.query.get('overdue') === 'true')).toBe(true));
  });

  it('explains how invoices are created when there are none', async () => {
    await signedIn({ [`GET ${c('/invoices')}`]: { body: page([]) } });
    renderScreen({ invoices: InvoiceListScreen }, '/invoices');
    expect(await screen.findByText('Noch keine Rechnungen')).toBeTruthy();
    expect(screen.getByText(/aus einem angenommenen Angebot, aus einem Auftrag/)).toBeTruthy();
  });
});

describe('invoice detail', () => {
  it('shows "Rechnung stellen" for an Owner draft and issues it after confirmation', async () => {
    let current = invoice('Draft');
    const mock = await signedIn({
      [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: () => ({ body: current }),
      [`POST ${c(`/invoices/${INVOICE_ID}/issue`)}`]: () => {
        current = invoice('Issued');
        return { body: current };
      },
    });
    renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    expect(await screen.findByText('Rechnungsentwurf')).toBeTruthy();
    expect(screen.getByTestId('invoice-status-Draft')).toBeTruthy();
    fireEvent.press(screen.getByTestId('invoice-action-issue'));
    expect(await screen.findByText(/nächste fortlaufende Rechnungsnummer/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('issue-submit'));
    await waitFor(() => expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/issue`)}`)).toHaveLength(1));
    expect(await screen.findByTestId('invoice-action-send')).toBeTruthy();
    expect(screen.getByTestId('invoice-status-Issued')).toBeTruthy();
    expect(screen.getByTestId('invoice-action-xml')).toBeTruthy();
  });

  it('does not offer "Rechnung stellen" to employees', async () => {
    await signedIn({ [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: { body: invoice('Draft', { role: 'Employee' }) } }, 'Employee');
    renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    expect(await screen.findByTestId('invoice-action-edit')).toBeTruthy();
    expect(screen.queryByTestId('invoice-action-issue')).toBeNull();
    expect(screen.queryByText('Rechnung stellen')).toBeNull();
  });

  it('lists issue problems and blocks issuing while they exist', async () => {
    const problems = ['Die Rechnung enthält keine Positionen.', 'Bitte Steuernummer oder USt-IdNr. Ihrer Firma hinterlegen (Einstellungen → Firma).'];
    const mock = await signedIn({ [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: { body: invoice('Draft', { issueProblems: problems }) } });
    renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    expect(await screen.findByTestId('issue-problems')).toHaveTextContent(/keine Positionen/);
    fireEvent.press(screen.getByTestId('invoice-action-issue'));
    expect(await screen.findByTestId('issue-sheet-problems')).toHaveTextContent(/Steuernummer/);
    expect(screen.getByTestId('issue-submit').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('issue-submit'));
    expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/issue`)}`)).toHaveLength(0);
  });

  it('records a payment with amount prefilled from the open amount (German input)', async () => {
    let current = invoice('Issued', { sentAt: '2026-10-05T10:00:00Z' });
    const mock = await signedIn({
      [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: () => ({ body: current }),
      [`POST ${c(`/invoices/${INVOICE_ID}/payments`)}`]: () => {
        current = invoice('PartiallyPaid', { sentAt: '2026-10-05T10:00:00Z' });
        return { body: current };
      },
    });
    renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    fireEvent.press(await screen.findByTestId('invoice-action-recordPayment'));
    expect(await screen.findByTestId('payment-amount')).toHaveProp('value', '571,20');
    fireEvent.changeText(screen.getByTestId('payment-amount'), '1.200,00');
    fireEvent.press(screen.getByTestId('payment-submit'));
    expect(await screen.findByText(/Höchstens der offene Betrag/)).toBeTruthy();
    expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/payments`)}`)).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('payment-amount'), '200,50');
    fireEvent.press(screen.getByTestId('payment-method-Bar'));
    fireEvent.changeText(screen.getByTestId('payment-note'), 'Anzahlung');
    fireEvent.press(screen.getByTestId('payment-submit'));
    await waitFor(() => expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/payments`)}`)).toHaveLength(1));
    expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/payments`)}`)[0]!.body).toEqual({
      amount: 200.5, paidOn: todayIso(), method: 'Bar', note: 'Anzahlung',
    });
    expect(await screen.findByTestId('invoice-status-PartiallyPaid')).toBeTruthy();
    expect(screen.getByTestId('payment-pay-1')).toBeTruthy();
  });

  it('sends by e-mail with the customer address prefilled', async () => {
    const mock = await signedIn({
      [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: { body: invoice('Issued') },
      [`POST ${c(`/invoices/${INVOICE_ID}/send`)}`]: { body: { invoice: invoice('Issued', { sentAt: '2026-10-13T10:00:00Z' }), emailDeliveryId: 'd-1' } },
    });
    renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    fireEvent.press(await screen.findByTestId('invoice-action-send'));
    expect(await screen.findByTestId('invoice-send-recipient')).toHaveProp('value', 'info@sonnenschein.example');
    fireEvent.press(screen.getByTestId('invoice-send-submit'));
    await waitFor(() => expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/send`)}`)).toHaveLength(1));
    expect(mock.callsTo(`POST ${c(`/invoices/${INVOICE_ID}/send`)}`)[0]!.body).toMatchObject({
      mode: 'Email', recipientEmail: 'info@sonnenschein.example', subject: 'Rechnung RE-2026-0001 – Beleuchtung Verkaufsraum',
    });
  });

  it('links a cancelled invoice to its Stornorechnung and shows cancellations negated', async () => {
    await signedIn({
      [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: {
        body: invoice('Cancelled', { cancellationInvoiceId: 'storno-1', cancellationInvoiceNumber: 'RE-2026-0002', cancellationReason: 'Doppelt berechnet' }),
      },
    });
    const router = renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    expect(await screen.findByTestId('cancelled-alert')).toHaveTextContent(/Doppelt berechnet/);
    fireEvent.press(screen.getByTestId('open-cancellation-invoice'));
    await waitFor(() => expect(router.getPathname()).toBe('/invoice/storno-1'));
  });

  it('shows Stornorechnung amounts with a minus sign', async () => {
    await signedIn({
      [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: {
        body: invoice('Issued', { kind: 'Cancellation', cancelledInvoiceId: 'orig-1', cancelledInvoiceNumber: 'RE-2026-0001', number: 'RE-2026-0002' }),
      },
    });
    renderScreen({ 'invoice/[id]': InvoiceDetailScreen }, `/invoice/${INVOICE_ID}`);
    expect(await screen.findByTestId('invoice-gross')).toHaveTextContent(`−${formatEur(571.2)}`);
    expect(screen.getByTestId('cancellation-alert')).toHaveTextContent(/storniert Rechnung RE-2026-0001/);
    expect(screen.getByLabelText('Status: Stornorechnung')).toBeTruthy();
    expect(screen.queryByTestId('invoice-action-recordPayment')).toBeNull();
  });
});

describe('invoice editor', () => {
  it('creates a draft with due date from the payment days setting and the service date', async () => {
    const mock = await signedIn({
      [`GET ${c('/settings')}`]: { body: settings },
      [`GET ${c('/tax-rates')}`]: { body: taxRates },
      [`GET ${c('/customers')}`]: { body: page([customerListItem]) },
      [`GET ${c(`/customers/${CUSTOMER_ID}`)}`]: { body: customer },
      [`POST ${c('/invoices')}`]: { status: 201, body: invoice('Draft') },
    });
    const router = renderScreen({ 'invoice-editor': InvoiceEditorScreen, 'invoice/[id]': () => null }, `/invoice-editor?customerId=${CUSTOMER_ID}`);
    expect(await screen.findByTestId('selected-customer')).toHaveTextContent(/Bäckerei Sonnenschein GmbH/);
    fireEvent.press(screen.getByTestId('step-next'));
    expect(await screen.findByTestId('invoice-editor-payment-days')).toHaveTextContent('Zahlungsziel: 14 Tage');
    fireEvent.press(screen.getByTestId('step-next'));
    fireEvent.press(screen.getByTestId('add-line'));
    fireEvent.changeText(await screen.findByTestId('line-title'), 'Montage');
    fireEvent.changeText(screen.getByTestId('line-quantity'), '2');
    fireEvent.changeText(screen.getByTestId('line-price'), '100,00');
    fireEvent.press(screen.getByTestId('line-save'));
    await waitFor(() => expect(screen.getByTestId('totals-gross')).toHaveTextContent(formatEur(238)));
    fireEvent.press(screen.getByTestId('step-next'));
    fireEvent.press(await screen.findByTestId('invoice-editor-save'));
    await waitFor(() => expect(mock.callsTo(`POST ${c('/invoices')}`)).toHaveLength(1));
    const today = todayIso();
    expect(mock.callsTo(`POST ${c('/invoices')}`)[0]!.body).toMatchObject({
      customerId: CUSTOMER_ID, title: 'Rechnung', issueDate: today, serviceDateFrom: today, serviceDateTo: null, taxMode: 'Standard',
      introText: settings.invoiceIntroText, closingText: settings.invoiceClosingText, paymentTerms: null,
      lineItems: [{ title: 'Montage', quantity: 2, unitPriceNet: 100, taxRatePercent: 19, description: null }],
    });
    const body = mock.callsTo(`POST ${c('/invoices')}`)[0]!.body as { dueDate: string };
    expect(body.dueDate > today).toBe(true);
    await waitFor(() => expect(router.getPathname()).toBe(`/invoice/${INVOICE_ID}`));
  }, 60000);

  it('saves edits with rowVersion and reports concurrent changes', async () => {
    const mock = await signedIn({
      [`GET ${c('/tax-rates')}`]: { body: taxRates },
      [`GET ${c('/settings')}`]: { body: settings },
      [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: { body: invoice('Draft') },
      [`PUT ${c(`/invoices/${INVOICE_ID}`)}`]: { status: 409, body: { status: 409, code: 'concurrency_conflict' } },
    });
    renderScreen({ 'invoice-editor': InvoiceEditorScreen }, `/invoice-editor?id=${INVOICE_ID}`);
    fireEvent.press(await screen.findByTestId('invoice-editor-save-header'));
    expect(await screen.findByText(/Die Rechnung wurde zwischenzeitlich geändert/)).toBeTruthy();
    expect(mock.callsTo(`PUT ${c(`/invoices/${INVOICE_ID}`)}`)[0]!.body).toMatchObject({ rowVersion: invoice('Draft').rowVersion, serviceDateFrom: '2026-10-02' });
  });

  it('refuses to edit issued invoices', async () => {
    await signedIn({ [`GET ${c(`/invoices/${INVOICE_ID}`)}`]: { body: invoice('Issued') }, [`GET ${c('/settings')}`]: { body: settings } });
    renderScreen({ 'invoice-editor': InvoiceEditorScreen }, `/invoice-editor?id=${INVOICE_ID}`);
    expect(await screen.findByText(/Nur Rechnungsentwürfe können bearbeitet werden/)).toBeTruthy();
  });
});

describe('job detail → invoice', () => {
  it('lists the job invoices and creates a new draft via "Rechnung erstellen"', async () => {
    const mock = await signedIn({
      [`GET ${c('/jobs/j-1')}`]: { body: { ...job, invoices: [{ id: 'inv-9', number: 'RE-2026-0009', kind: 'Invoice', status: 'Paid', grossTotal: 571.2 }] } },
      [`POST ${c('/jobs/j-1/invoice')}`]: { status: 201, body: invoice('Draft') },
      [`GET ${c('/members')}`]: { body: [] },
    });
    const router = renderScreen({ 'job/[id]': JobDetailScreen, 'invoice-editor': () => null, 'invoice/[id]': () => null }, '/job/j-1');
    expect(await screen.findByTestId('invoice-link-inv-9')).toHaveTextContent(/RE-2026-0009/);
    fireEvent.press(screen.getByText('Rechnung erstellen'));
    await waitFor(() => expect(mock.callsTo(`POST ${c('/jobs/j-1/invoice')}`)).toHaveLength(1));
    await waitFor(() => expect(router.getPathname()).toBe('/invoice-editor'));
    expect(router.getSearchParams()).toMatchObject({ id: INVOICE_ID });
  });
});

describe('dashboard invoice KPIs', () => {
  it('shows open and overdue invoices and opens the list with the matching filter', async () => {
    await signedIn({
      [`GET ${c('/dashboard')}`]: {
        body: { ...dashboard, openInvoicesCount: 3, openInvoicesAmount: 2500, overdueInvoicesCount: 1, overdueInvoicesAmount: 571.2 },
      },
    });
    const router = renderScreen({ index: DashboardScreen, invoices: () => null }, '/');
    const overdue = await screen.findByTestId('kpi-overdue-invoices');
    expect(overdue).toHaveProp('accessibilityLabel', `Überfällig: ${formatEur(571.2)}, 1 Rechnung`);
    expect(screen.getByTestId('kpi-open-invoices')).toHaveProp('accessibilityLabel', `Offene Rechnungen: ${formatEur(2500)}, 3 Rechnungen`);
    fireEvent.press(overdue);
    await waitFor(() => expect(router.getPathname()).toBe('/invoices'));
    expect(router.getSearchParams()).toMatchObject({ filter: 'overdue' });
  });
});

describe('quotation detail → invoice', () => {
  it('offers "Rechnung erstellen" for accepted quotations next to the job conversion', async () => {
    const mock = await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Accepted') },
      [`GET ${c(`/quotations/${QUOTATION_ID}/events`)}`]: { body: [] },
      [`GET ${c(`/quotations/${QUOTATION_ID}/deliveries`)}`]: { body: [] },
      [`GET ${c(`/quotations/${QUOTATION_ID}/follow-ups`)}`]: { body: [] },
      [`POST ${c(`/quotations/${QUOTATION_ID}/invoice`)}`]: { status: 201, body: invoice('Draft') },
    });
    const router = renderScreen({ 'quotation/[id]': QuotationDetailScreen, 'invoice-editor': () => null }, `/quotation/${QUOTATION_ID}`);
    expect(await screen.findByTestId('action-convert')).toBeTruthy();
    fireEvent.press(screen.getByTestId('action-createInvoice'));
    await waitFor(() => expect(mock.callsTo(`POST ${c(`/quotations/${QUOTATION_ID}/invoice`)}`)).toHaveLength(1));
    await waitFor(() => expect(router.getPathname()).toBe('/invoice-editor'));
    expect(router.getSearchParams()).toMatchObject({ id: INVOICE_ID, created: '1' });
  });

  it('does not offer invoicing before the quotation is accepted', async () => {
    await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Sent') },
      [`GET ${c(`/quotations/${QUOTATION_ID}/events`)}`]: { body: [] },
      [`GET ${c(`/quotations/${QUOTATION_ID}/deliveries`)}`]: { body: [] },
      [`GET ${c(`/quotations/${QUOTATION_ID}/follow-ups`)}`]: { body: [] },
    });
    renderScreen({ 'quotation/[id]': QuotationDetailScreen }, `/quotation/${QUOTATION_ID}`);
    expect(await screen.findByTestId('action-accept')).toBeTruthy();
    expect(screen.queryByTestId('action-createInvoice')).toBeNull();
  });
});
