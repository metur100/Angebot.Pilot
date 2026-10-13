import { queryClient } from '@/lib/queryClient';
import { api, login, logout, restoreSession, SECURE_KEYS, sessionStore } from '@/lib/session';

import { mockApi } from './helpers/api';
import { auth, c, dashboard } from './helpers/fixtures';
import { resetAll } from './helpers/render';

const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };

beforeEach(() => resetAll());

describe('session restore on app start', () => {
  it('goes to signed-out when no refresh token is stored', async () => {
    const mock = mockApi();
    await restoreSession();
    expect(sessionStore.getState().status).toBe('signedOut');
    expect(mock.calls).toHaveLength(0);
  });

  it('exchanges the stored refresh token and rotates it', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    const mock = mockApi({ 'POST /auth/refresh': { body: auth({ refreshToken: 'refresh-2' }) } });
    await restoreSession();
    expect(mock.callsTo('POST /auth/refresh')[0]?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(sessionStore.getState()).toMatchObject({ status: 'signedIn', activeCompanyId: auth().user.companies[0]!.companyId });
    expect(SecureStore.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-2');
  });

  it('wipes an invalid refresh token and shows the login with an "expired" hint', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'revoked');
    mockApi({ 'POST /auth/refresh': { status: 401, body: { status: 401, code: 'invalid_refresh_token' } } });
    await restoreSession();
    expect(sessionStore.getState()).toMatchObject({ status: 'signedOut', expired: true });
    expect(SecureStore.__store.has(SECURE_KEYS.refreshToken)).toBe(false);
  });

  it('keeps the token and reports "offline" when the server is unreachable', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mockApi({ 'POST /auth/refresh': new TypeError('Network request failed') });
    await restoreSession();
    expect(sessionStore.getState().status).toBe('offline');
    expect(SecureStore.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-1');
  });
});

describe('login / logout', () => {
  it('logs in as mobile client and stores only the refresh token', async () => {
    const mock = mockApi({ 'POST /auth/login': { body: auth() } });
    await login(' anna@elektro-muster.de ', 'Geheim12345');
    const call = mock.callsTo('POST /auth/login')[0]!;
    expect(call.body).toEqual({ email: 'anna@elektro-muster.de', password: 'Geheim12345', client: 'Mobile' });
    expect(call.headers['X-AngebotPilot-Client']).toBe('mobile');
    expect(SecureStore.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-2');
    expect([...SecureStore.__store.values()]).not.toContain('access-1'); // access token stays in memory
    expect(api.authHeaders().Authorization).toBe('Bearer access-1');
  });

  it('secure logout revokes the refresh token, wipes SecureStore and the query cache', async () => {
    const mock = mockApi({ 'POST /auth/login': { body: auth() }, 'POST /auth/logout': { status: 204 } });
    await login('anna@elektro-muster.de', 'Geheim12345');
    queryClient.setQueryData(['c', 'x', 'dashboard'], dashboard);
    await logout();
    expect(mock.callsTo('POST /auth/logout')[0]?.body).toEqual({ refreshToken: 'refresh-2' });
    expect(SecureStore.__store.size).toBe(0);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(sessionStore.getState()).toMatchObject({ status: 'signedOut', user: null, expired: false });
    expect(api.authHeaders().Authorization).toBeUndefined();
  });

  it('logs out locally even when the server cannot be reached', async () => {
    const mock = mockApi({ 'POST /auth/login': { body: auth() } });
    await login('anna@elektro-muster.de', 'Geheim12345');
    mock.on('POST /auth/logout', new TypeError('Network request failed'));
    await logout();
    expect(SecureStore.__store.size).toBe(0);
    expect(sessionStore.getState().status).toBe('signedOut');
  });
});

describe('token expiry during use', () => {
  it('refreshes once on 401 and retries the request', async () => {
    const mock = mockApi({ 'POST /auth/login': { body: auth() } });
    await login('anna@elektro-muster.de', 'Geheim12345');
    let first = true;
    mock.on(`GET ${c('/dashboard')}`, () => {
      if (first) {
        first = false;
        return { status: 401 };
      }
      return { body: dashboard };
    });
    mock.on('POST /auth/refresh', { body: auth({ accessToken: 'access-2', refreshToken: 'refresh-3' }) });
    const result = await api.companies.dashboard(auth().user.companies[0]!.companyId);
    expect(result.sentCount).toBe(2);
    const dashboardCalls = mock.callsTo(`GET ${c('/dashboard')}`);
    expect(dashboardCalls[1]?.headers.Authorization).toBe('Bearer access-2');
    expect(SecureStore.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-3');
  });

  it('signs out (back to login) when the session cannot be refreshed', async () => {
    const mock = mockApi({ 'POST /auth/login': { body: auth() } });
    await login('anna@elektro-muster.de', 'Geheim12345');
    mock.on(`GET ${c('/dashboard')}`, { status: 401 });
    mock.on('POST /auth/refresh', { status: 401, body: { status: 401 } });
    await expect(api.companies.dashboard(auth().user.companies[0]!.companyId)).rejects.toMatchObject({ status: 401 });
    await new Promise((r) => setTimeout(r, 0));
    expect(sessionStore.getState()).toMatchObject({ status: 'signedOut', expired: true });
    expect(SecureStore.__store.size).toBe(0);
  });

  it('does not sign out when the refresh fails only because the device is offline', async () => {
    const mock = mockApi({ 'POST /auth/login': { body: auth() } });
    await login('anna@elektro-muster.de', 'Geheim12345');
    mock.on(`GET ${c('/dashboard')}`, { status: 401 });
    mock.on('POST /auth/refresh', new TypeError('Network request failed'));
    await expect(api.companies.dashboard(auth().user.companies[0]!.companyId)).rejects.toBeTruthy();
    expect(sessionStore.getState().status).toBe('signedIn');
    expect(SecureStore.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-2');
  });
});
