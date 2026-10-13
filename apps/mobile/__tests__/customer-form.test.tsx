import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import CustomerFormScreen from '@/features/customers/CustomerFormScreen';
import { restoreSession } from '@/lib/session';

import { mockApi } from './helpers/api';
import { auth, c, customer, CUSTOMER_ID } from './helpers/fixtures';
import { renderScreen, resetAll } from './helpers/render';

async function signedIn(extra: Record<string, unknown> = {}) {
  const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  SecureStore.__store.set('angebotpilot.refreshToken', 'refresh-1');
  const mock = mockApi({ 'POST /auth/refresh': { body: auth() }, ...extra } as never);
  await restoreSession();
  return mock;
}

beforeEach(() => resetAll());

describe('customer form', () => {
  it('requires a company name for business customers and does not call the API', async () => {
    const mock = await signedIn();
    renderScreen({ 'customer-form': CustomerFormScreen, 'customer/[id]': () => null }, '/customer-form');
    fireEvent.press(await screen.findByTestId('customer-submit'));
    expect(await screen.findByText('Bitte Firmennamen angeben.')).toBeTruthy();
    expect(mock.callsTo(`POST ${c('/customers')}`)).toHaveLength(0);
  });

  it('requires a last name for private customers and validates the e-mail address', async () => {
    await signedIn();
    renderScreen({ 'customer-form': CustomerFormScreen, 'customer/[id]': () => null }, '/customer-form');
    fireEvent.press(await screen.findByTestId('segment-Private'));
    fireEvent.changeText(screen.getByTestId('customer-email'), 'kein-at-zeichen');
    fireEvent.press(screen.getByTestId('customer-submit'));
    expect(await screen.findByText('Bitte Nachnamen angeben.')).toBeTruthy();
    expect(screen.getByText('Bitte gültige E-Mail-Adresse angeben.')).toBeTruthy();
    expect(screen.queryByTestId('customer-companyName')).toBeNull();
  });

  it('creates a business customer with null for empty optional fields and opens it', async () => {
    const mock = await signedIn({ [`POST ${c('/customers')}`]: { status: 201, body: customer }, [`GET ${c(`/customers/${CUSTOMER_ID}`)}`]: { body: customer } });
    const router = renderScreen({ 'customer-form': CustomerFormScreen, 'customer/[id]': () => null }, '/customer-form');
    fireEvent.changeText(await screen.findByTestId('customer-companyName'), 'Bäckerei Sonnenschein GmbH');
    fireEvent.changeText(screen.getByTestId('customer-email'), 'info@sonnenschein.example');
    fireEvent.changeText(screen.getByTestId('customer-billingPostalCode'), '10115');
    fireEvent.press(screen.getByTestId('customer-submit'));
    await waitFor(() => expect(mock.callsTo(`POST ${c('/customers')}`)).toHaveLength(1));
    expect(mock.callsTo(`POST ${c('/customers')}`)[0]!.body).toMatchObject({
      type: 'Business', companyName: 'Bäckerei Sonnenschein GmbH', email: 'info@sonnenschein.example', billingPostalCode: '10115',
      billingCountry: 'DE', phone: null, lastName: null, hasServiceAddress: false, followUpOptOut: false, rowVersion: null,
    });
    await waitFor(() => expect(router.getPathname()).toBe(`/customer/${CUSTOMER_ID}`));
  });

  it('shows server-side field errors next to the field', async () => {
    await signedIn({
      [`POST ${c('/customers')}`]: { status: 400, body: { status: 400, code: 'validation_failed', errors: { vatId: ['Ungültige USt-IdNr.'] } } },
    });
    renderScreen({ 'customer-form': CustomerFormScreen, 'customer/[id]': () => null }, '/customer-form');
    fireEvent.changeText(await screen.findByTestId('customer-companyName'), 'Firma');
    fireEvent.changeText(screen.getByTestId('customer-vatId'), 'XX1');
    fireEvent.press(screen.getByTestId('customer-submit'));
    expect(await screen.findByText('Ungültige USt-IdNr.')).toBeTruthy();
  });

  it('sends the rowVersion when editing and reports concurrency conflicts', async () => {
    const mock = await signedIn({
      [`GET ${c(`/customers/${CUSTOMER_ID}`)}`]: { body: customer },
      [`PUT ${c(`/customers/${CUSTOMER_ID}`)}`]: { status: 409, body: { status: 409, code: 'concurrency_conflict' } },
    });
    renderScreen({ 'customer-form': CustomerFormScreen }, `/customer-form?id=${CUSTOMER_ID}`);
    fireEvent.changeText(await screen.findByTestId('customer-phone'), '+49 30 999');
    fireEvent.press(screen.getByTestId('customer-submit'));
    expect(await screen.findByText(/zwischenzeitlich geändert/)).toBeTruthy();
    expect(mock.callsTo(`PUT ${c(`/customers/${CUSTOMER_ID}`)}`)[0]!.body).toMatchObject({ rowVersion: customer.rowVersion, phone: '+49 30 999' });
  });
});
