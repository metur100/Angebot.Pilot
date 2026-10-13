import { getLocale, setLocale } from '@angebotpilot/api-contracts';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { PREFERENCE_KEYS } from '@/lib/preferences';
import { SECURE_KEYS } from '@/lib/session';
import { fromInput, toInput, toMoneyInput } from '@/lib/numbers';
import { validatePaymentAmount } from '@/features/invoices/ActionSheets';

import { mockApi } from './helpers/api';
import { auth, c, dashboard, me, page } from './helpers/fixtures';
import { resetAll } from './helpers/render';

const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
const deviceLocale = jest.requireMock('@/lib/deviceLocale') as { deviceLocaleTags: jest.Mock };

function signedInRoutes(language: 'de' | 'en' = 'de') {
  return {
    'POST /auth/refresh': { body: auth({ user: { ...me, language } }) },
    [`GET ${c('/dashboard')}`]: { body: dashboard },
    [`GET ${c('/notifications/unread-count')}`]: { body: { count: 0 } },
    [`GET ${c('/quotations')}`]: { body: page([]) },
  };
}

beforeEach(() => {
  resetAll();
  deviceLocale.deviceLocaleTags.mockReturnValue(['de-DE']);
});

describe('UI language (signed out)', () => {
  it('switches the login screen to English in place and remembers the choice', async () => {
    mockApi();
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText('Angebote erstellen, nachfassen, Aufträge gewinnen.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('segment-en'));

    expect(await screen.findByText('Create quotations, follow up, win jobs.')).toBeTruthy();
    expect(screen.getByText('Sign up for free')).toBeTruthy();
    expect(getLocale()).toBe('en');
    await waitFor(() => expect(SecureStore.__store.get(PREFERENCE_KEYS.language)).toBe('en'));
  });

  it('starts in the stored language', async () => {
    SecureStore.__store.set(PREFERENCE_KEYS.language, 'en');
    mockApi();
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText('Create quotations, follow up, win jobs.')).toBeTruthy();
  });

  it('falls back to the device language when nothing is stored', async () => {
    deviceLocale.deviceLocaleTags.mockReturnValue(['en-US']);
    mockApi();
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText('Create quotations, follow up, win jobs.')).toBeTruthy();
  });

  it('shows English validation messages after switching', async () => {
    mockApi();
    renderRouter('./src/app', { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('segment-en'));
    fireEvent.press(await screen.findByTestId('login-submit'));
    expect(await screen.findByText('Please enter an email address.')).toBeTruthy();
  });

  it('sends the UI language on registration', async () => {
    const mock = mockApi({ 'POST /auth/register': { body: auth({ user: { ...me, language: 'en', companies: [] } }) } });
    renderRouter('./src/app', { initialUrl: '/register' });
    fireEvent.press(await screen.findByTestId('segment-en'));
    fireEvent.changeText(screen.getByTestId('register-name'), 'Anna Muster');
    fireEvent.changeText(screen.getByTestId('register-email'), 'anna@elektro-muster.de');
    fireEvent.changeText(screen.getByTestId('register-password'), 'Sicher12345');
    fireEvent.press(screen.getByTestId('register-terms'));
    fireEvent.press(screen.getByTestId('register-submit'));
    await waitFor(() => expect(mock.callsTo('POST /auth/register')).toHaveLength(1));
    expect(mock.callsTo('POST /auth/register')[0]?.body).toMatchObject({ language: 'en', client: 'Mobile' });
  });
});

describe('UI language (signed in)', () => {
  it('uses the language stored on the account after sign-in', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mockApi(signedInRoutes('en'));
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByLabelText('Sent / open: 2')).toBeTruthy();
    expect(SecureStore.__store.get(PREFERENCE_KEYS.language)).toBe('en');
  });

  it('saves a language change on the account (PATCH /me) and re-renders the tabs in English', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    const mock = mockApi({
      ...signedInRoutes('de'),
      'PATCH /me': (req) => ({ body: { ...me, language: (req.body as { language: 'de' | 'en' }).language } }),
    });
    renderRouter('./src/app', { initialUrl: '/more' });
    expect(await screen.findByText('Darstellung'.toUpperCase())).toBeTruthy();

    fireEvent.press(screen.getAllByTestId('segment-en')[0]!);

    await waitFor(() => expect(mock.callsTo('PATCH /me')).toHaveLength(1));
    expect(mock.callsTo('PATCH /me')[0]?.body).toEqual({ displayName: me.displayName, language: 'en' });
    expect(await screen.findByText('DISPLAY')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(screen.getAllByText('Quotations').length).toBeGreaterThan(0);
    expect(mock.callsTo('GET /me')).toHaveLength(0);
  });
});

describe('number input follows the UI language', () => {
  afterEach(() => setLocale('de'));

  it('formats and parses German and English notation', () => {
    expect(toInput(1234.5)).toBe('1234,5');
    expect(toMoneyInput(6.9)).toBe('6,90');
    expect(fromInput('1.234,56')).toBe(1234.56);
    setLocale('en');
    expect(toInput(1234.5)).toBe('1234.5');
    expect(toMoneyInput(6.9)).toBe('6.90');
    expect(fromInput('1,234.56')).toBe(1234.56);
    expect(validatePaymentAmount('abc', 100).error).toBe('Please enter an amount, e.g. 1,234.56.');
  });
});
