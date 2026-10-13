import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import QuotationEditorScreen from '@/features/quotation-editor/QuotationEditorScreen';
import { validateDraft } from '@/features/quotation-editor/LineItemEditor';
import { restoreSession } from '@/lib/session';

import { mockApi } from './helpers/api';
import { auth, c, CUSTOMER_ID, customer, customerListItem, page, quotation, QUOTATION_ID, settings, taxRates } from './helpers/fixtures';
import { renderScreen, resetAll } from './helpers/render';

async function signedIn(routes: Record<string, unknown> = {}) {
  const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  SecureStore.__store.set('angebotpilot.refreshToken', 'refresh-1');
  const mock = mockApi({
    'POST /auth/refresh': { body: auth() },
    [`GET ${c('/settings')}`]: { body: settings },
    [`GET ${c('/tax-rates')}`]: { body: taxRates },
    [`GET ${c('/customers')}`]: { body: page([customerListItem]) },
    [`GET ${c(`/customers/${CUSTOMER_ID}`)}`]: { body: customer },
    ...routes,
  } as never);
  await restoreSession();
  return mock;
}

async function addLine(title: string, quantity: string, price: string, discount?: string) {
  fireEvent.press(screen.getByTestId('add-line'));
  fireEvent.changeText(await screen.findByTestId('line-title'), title);
  fireEvent.changeText(screen.getByTestId('line-quantity'), quantity);
  fireEvent.changeText(screen.getByTestId('line-price'), price);
  if (discount) fireEvent.changeText(screen.getByTestId('line-discount'), discount);
  fireEvent.press(screen.getByTestId('line-save'));
  await waitFor(() => expect(screen.queryByTestId('line-title')).toBeNull());
}

beforeEach(() => resetAll());

describe('line item validation (German number input)', () => {
  const base = { title: 'Montage', description: '', quantity: '2,5', unit: 'Std.', unitPriceNet: '1.234,56', discountPercent: '', taxRatePercent: '19' };

  it('parses German decimals and thousands separators', () => {
    expect(validateDraft(base).value).toMatchObject({ quantity: 2.5, unitPriceNet: 1234.56, discountPercent: 0, taxRatePercent: 19 });
  });

  it.each([
    [{ quantity: '' }, 'quantity', 'Bitte Menge angeben.'],
    [{ quantity: 'zwei' }, 'quantity', 'Bitte eine Zahl eingeben, z. B. 2,5.'],
    [{ quantity: '0' }, 'quantity', 'Die Menge muss größer als 0 sein.'],
    [{ unitPriceNet: '-5' }, 'unitPriceNet', 'Der Preis darf nicht negativ sein.'],
    [{ discountPercent: '120' }, 'discountPercent', 'Höchstens 100 %.'],
    [{ title: '  ' }, 'title', 'Bitte Bezeichnung angeben.'],
  ])('rejects %o', (patch, field, message) => {
    const result = validateDraft({ ...base, ...patch });
    expect(result.value).toBeUndefined();
    expect(result.errors[field as keyof typeof result.errors]).toBe(message);
  });
});

describe('create quotation', () => {
  it('walks through the steps, edits line items with live totals and saves the draft', async () => {
    const mock = await signedIn({
      [`POST ${c('/quotations')}`]: { status: 201, body: quotation('Draft') },
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Draft') },
    });
    const router = renderScreen({ 'quotation-editor': QuotationEditorScreen, 'quotation/[id]': () => null }, '/quotation-editor');

    // Step 1: customer via searchable picker
    fireEvent.press(await screen.findByTestId('pick-customer'));
    fireEvent.press(await screen.findByTestId(`customer-card-${CUSTOMER_ID}`));
    expect(await screen.findByTestId('selected-customer')).toBeTruthy();

    // Step 2: basics – defaults from company settings
    fireEvent.press(screen.getByTestId('step-next'));
    fireEvent.changeText(await screen.findByTestId('editor-title'), 'Beleuchtung Verkaufsraum');

    // Step 3: line items
    fireEvent.press(screen.getByTestId('step-next'));
    await addLine('LED-Panel 60×60', '4', '120');
    await addLine('Montage', '2,5', '1.000,00', '10');
    // 480 + 2.250 = 2.730 net; 19 % = 518,70 → 3.248,70 gross
    expect(screen.getByTestId('totals-gross')).toHaveTextContent('3.248,70 €');
    expect(screen.getByTestId('totals-net')).toHaveTextContent('Netto 2.730,00 € · USt. 518,70 €');
    expect(screen.getByTestId('line-net-1')).toHaveTextContent('2.250,00 €');

    // edit line 1 (quantity 4 → 5)
    fireEvent.press(screen.getByTestId('line-edit-0'));
    fireEvent.changeText(await screen.findByTestId('line-quantity'), '5');
    fireEvent.press(screen.getByTestId('line-save'));
    await waitFor(() => expect(screen.getByTestId('line-net-0')).toHaveTextContent('600,00 €'));

    // duplicate, move and delete
    fireEvent.press(screen.getByTestId('line-duplicate-1'));
    expect(screen.getByTestId('line-card-2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('line-up-1'));
    expect(within(screen.getByTestId('line-card-0')).getByText('Montage')).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    fireEvent.press(screen.getByTestId('line-delete-2'));
    alert.mockRestore();
    expect(screen.queryByTestId('line-card-2')).toBeNull();
    expect(screen.getByTestId('totals-gross')).toHaveTextContent('3.391,50 €'); // 600 + 2.250 = 2.850 net

    // Step 4 + save
    fireEvent.press(screen.getByTestId('step-next'));
    fireEvent.press(await screen.findByTestId('editor-save'));
    await waitFor(() => expect(mock.callsTo(`POST ${c('/quotations')}`)).toHaveLength(1));
    const body = mock.callsTo(`POST ${c('/quotations')}`)[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      customerId: CUSTOMER_ID, title: 'Beleuchtung Verkaufsraum', taxMode: 'Standard', paymentTerms: '14 Tage netto',
      introText: 'vielen Dank für Ihre Anfrage.',
      lineItems: [
        { title: 'Montage', quantity: 2.5, unitPriceNet: 1000, discountPercent: 10, taxRatePercent: 19, unit: 'Stk.', description: null },
        { title: 'LED-Panel 60×60', quantity: 5, unitPriceNet: 120, discountPercent: 0, taxRatePercent: 19 },
      ],
    });
    await waitFor(() => expect(router.getPathname()).toBe(`/quotation/${QUOTATION_ID}`));
  }, 60000);

  it('jumps to the first step with errors and does not save an empty quotation', async () => {
    const mock = await signedIn();
    renderScreen({ 'quotation-editor': QuotationEditorScreen }, '/quotation-editor');
    fireEvent.press(await screen.findByTestId('editor-save-header'));
    expect(await screen.findByText('Bitte Kunden auswählen.')).toBeTruthy();
    expect(await screen.findByText('Bitte prüfen Sie die markierten Angaben.')).toBeTruthy();
    expect(screen.getByLabelText(/Schritt 3 von 4: Positionen, enthält Fehler/)).toBeTruthy();
    expect(mock.callsTo(`POST ${c('/quotations')}`)).toHaveLength(0);
  });

  it('preselects the customer when started from the customer detail', async () => {
    await signedIn();
    renderScreen({ 'quotation-editor': QuotationEditorScreen }, `/quotation-editor?customerId=${CUSTOMER_ID}`);
    expect(await screen.findByTestId('selected-customer')).toHaveTextContent(/Bäckerei Sonnenschein GmbH/);
  });
});

describe('edit draft', () => {
  it('saves with rowVersion and shows a conflict message on 409', async () => {
    const mock = await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Draft') },
      [`PUT ${c(`/quotations/${QUOTATION_ID}`)}`]: { status: 409, body: { status: 409, code: 'concurrency_conflict' } },
    });
    renderScreen({ 'quotation-editor': QuotationEditorScreen }, `/quotation-editor?id=${QUOTATION_ID}`);
    fireEvent.press(await screen.findByTestId('editor-save-header'));
    expect(await screen.findByText(/Das Angebot wurde zwischenzeitlich geändert/)).toBeTruthy();
    expect(mock.callsTo(`PUT ${c(`/quotations/${QUOTATION_ID}`)}`)[0]!.body).toMatchObject({ rowVersion: quotation('Draft').rowVersion });
  });

  it('refuses to edit quotations that are no longer drafts', async () => {
    await signedIn({ [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Sent') } });
    renderScreen({ 'quotation-editor': QuotationEditorScreen }, `/quotation-editor?id=${QUOTATION_ID}`);
    expect(await screen.findByText(/Nur Entwürfe können bearbeitet werden/)).toBeTruthy();
  });
});
