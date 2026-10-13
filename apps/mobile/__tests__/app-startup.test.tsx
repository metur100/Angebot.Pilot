import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { SECURE_KEYS, sessionStore } from '@/lib/session';

import { mockApi } from './helpers/api';
import { auth, c, dashboard, page } from './helpers/fixtures';
import { resetAll } from './helpers/render';

const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };

function signedInRoutes() {
  return {
    'POST /auth/refresh': { body: auth() },
    [`GET ${c('/dashboard')}`]: { body: dashboard },
    [`GET ${c('/notifications/unread-count')}`]: { body: { count: 3 } },
    [`GET ${c('/quotations')}`]: { body: page([]) },
  };
}

beforeEach(() => resetAll());

describe('app startup', () => {
  it('shows the login when no session is stored', async () => {
    mockApi();
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('login-email')).toBeTruthy();
    expect(screen.getByText('Angebote erstellen, nachfassen, Aufträge gewinnen.')).toBeTruthy();
  });

  it('restores a stored session and opens the dashboard with real numbers', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mockApi(signedInRoutes());
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('kpi-sent')).toBeTruthy();
    expect(screen.getByLabelText('Versendet / offen: 2')).toBeTruthy();
    expect(screen.getByLabelText(/Abschlussquote: 33,33 %/)).toBeTruthy();
    expect(screen.getByLabelText('Benachrichtigungen, 3 ungelesen')).toBeTruthy();
  });

  it('shows "–" for the conversion rate when nothing was decided yet (never fake numbers)', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mockApi({ ...signedInRoutes(), [`GET ${c('/dashboard')}`]: { body: { ...dashboard, conversionRatePercent: null } } });
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByLabelText(/Abschlussquote: –/)).toBeTruthy();
  });

  it('offers a retry on the splash screen when the server is unreachable', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    const mock = mockApi({ 'POST /auth/refresh': new TypeError('Network request failed') });
    renderRouter('./src/app', { initialUrl: '/' });
    const retry = await screen.findByTestId('splash-retry');
    expect(mock.callsTo('POST /auth/refresh')).toHaveLength(1);
    mock.on('POST /auth/refresh', { body: auth() });
    Object.entries(signedInRoutes()).forEach(([k, v]) => mock.on(k, v));
    fireEvent.press(retry);
    expect(await screen.findByTestId('kpi-sent')).toBeTruthy();
  });

  it('logs in and routes to the dashboard; wrong credentials show an inline error', async () => {
    const mock = mockApi({ 'POST /auth/login': { status: 401, body: { status: 401, detail: 'E-Mail-Adresse oder Passwort ist falsch.' } } });
    renderRouter('./src/app', { initialUrl: '/' });
    fireEvent.changeText(await screen.findByTestId('login-email'), 'anna@elektro-muster.de');
    fireEvent.changeText(screen.getByTestId('login-password'), 'falsch');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('E-Mail-Adresse oder Passwort ist falsch.')).toBeTruthy();

    mock.on('POST /auth/login', { body: auth() });
    Object.entries(signedInRoutes()).forEach(([k, v]) => mock.on(k, v));
    fireEvent.changeText(screen.getByTestId('login-password'), 'Richtig12345');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('kpi-sent')).toBeTruthy();
    expect(mock.callsTo('POST /auth/login')[1]?.body).toMatchObject({ client: 'Mobile' });
  });

  it('validates the login form before calling the API', async () => {
    const mock = mockApi();
    renderRouter('./src/app', { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('login-submit'));
    expect(await screen.findByText('Bitte E-Mail-Adresse angeben.')).toBeTruthy();
    expect(screen.getByText('Bitte Passwort eingeben.')).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });

  it('returns to the login with a hint when the session expires while using the app', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    const mock = mockApi(signedInRoutes());
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('kpi-sent')).toBeTruthy();

    mock.on(`GET ${c('/dashboard')}`, { status: 401 });
    mock.on('POST /auth/refresh', { status: 401, body: { status: 401 } });
    fireEvent(screen.getByTestId('dashboard'), 'refresh');
    expect(await screen.findByTestId('session-expired')).toBeTruthy();
    expect(SecureStore.__store.size).toBe(0);
    await waitFor(() => expect(sessionStore.getState().status).toBe('signedOut'));
  });

  it('sends users without a company to onboarding', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mockApi({ 'POST /auth/refresh': { body: auth({ user: { ...auth().user, companies: [] } }) } });
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('company-submit')).toBeTruthy();
    fireEvent.press(screen.getByTestId('company-submit'));
    expect(await screen.findByText('Bitte Firmennamen angeben.')).toBeTruthy();
  });
});
