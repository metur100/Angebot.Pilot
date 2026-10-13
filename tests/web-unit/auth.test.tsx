import { ApiError, NetworkError, type AuthResponse } from '@angebotpilot/api-contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { session, SessionManager, REFRESH_TOKEN_KEY } from '@/lib/session';
import { DEMO_IDS, DEMO_USER } from '@/mocks/db';
import { server } from './server';
import { API, findHeading, renderApp, signInAs } from './utils';

function authResponse(refreshToken: string | null): AuthResponse {
  return {
    accessToken: `access-${refreshToken ?? 'x'}`,
    accessTokenExpiresAt: '2026-10-12T12:00:00Z',
    refreshToken,
    refreshTokenExpiresAt: '2026-11-12T12:00:00Z',
    user: { id: 'u1', email: 'a@b.de', displayName: 'A B', emailVerified: true, companies: [] },
  };
}

describe('SessionManager', () => {
  it('stores the refresh token in localStorage when "Angemeldet bleiben" is ticked', () => {
    const manager = new SessionManager();
    manager.store(authResponse('rt-local'), 'local');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt-local');
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(manager.getAccessToken()).toBe('access-rt-local');
  });

  it('stores the refresh token in sessionStorage otherwise and never persists the access token', () => {
    const manager = new SessionManager();
    manager.store(authResponse('rt-session'), 'session');
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt-session');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    const persisted = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(persisted).not.toContain('access-');
  });

  it('shares one refresh request between concurrent callers and stores the rotated token', async () => {
    const manager = new SessionManager();
    manager.store(authResponse('rt-1'), 'local');
    let resolve: (value: AuthResponse) => void = () => undefined;
    const call = vi.fn(() => new Promise<AuthResponse>((r) => (resolve = r)));
    manager.configure(call);

    const results = Promise.all([manager.refreshAccessToken(), manager.refreshAccessToken(), manager.refreshAccessToken()]);
    resolve(authResponse('rt-2'));
    const tokens = await results;

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('rt-1');
    expect(tokens).toEqual(['access-rt-2', 'access-rt-2', 'access-rt-2']);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt-2');
  });

  it('clears the session when the refresh token is rejected', async () => {
    const manager = new SessionManager();
    manager.store(authResponse('rt-old'), 'session');
    const onExpired = vi.fn();
    manager.configure(() => Promise.reject(new ApiError({ status: 401, code: 'invalid_refresh_token' })), { onExpired });
    await expect(manager.refresh()).resolves.toBeNull();
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(manager.getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('keeps the session on network errors (offline is not a logout)', async () => {
    const manager = new SessionManager();
    manager.store(authResponse('rt-keep'), 'local');
    manager.configure(() => Promise.reject(new NetworkError()));
    await expect(manager.refresh()).rejects.toBeInstanceOf(NetworkError);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt-keep');
  });
});

describe('login and logout', () => {
  it('logs in with "Angemeldet bleiben" and keeps the refresh token in localStorage', async () => {
    const user = userEvent.setup();
    let loginBody: unknown = null;
    server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith('/auth/login')) loginBody = await request.clone().json();
    });
    renderApp('/login');
    await findHeading('Anmelden');
    await user.type(screen.getByLabelText('E-Mail-Adresse'), DEMO_USER.email);
    await user.type(screen.getByLabelText('Passwort', { selector: 'input' }), DEMO_USER.password);
    expect(screen.getByLabelText('Angemeldet bleiben')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await findHeading(/Lena/);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toMatch(/^mock-refresh\./);
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(loginBody).toMatchObject({ email: DEMO_USER.email, client: 'Web' });
    server.events.removeAllListeners();
  });

  it('uses sessionStorage without "Angemeldet bleiben" and shows a German error for wrong passwords', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await findHeading('Anmelden');
    await user.type(screen.getByLabelText('E-Mail-Adresse'), DEMO_USER.email);
    await user.type(screen.getByLabelText('Passwort', { selector: 'input' }), 'falsch-12345');
    await user.click(screen.getByLabelText('Angemeldet bleiben'));
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByText(/Passwort ist falsch|falsch/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Passwort', { selector: 'input' }));
    await user.type(screen.getByLabelText('Passwort', { selector: 'input' }), DEMO_USER.password);
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    await findHeading(/Lena/);
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toMatch(/^mock-refresh\./);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it('restores the session from the stored refresh token on startup', async () => {
    signInAs();
    renderApp('/dashboard');
    await findHeading(/Lena/);
    // Rotation: the stored token was replaced by the refresh response.
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).not.toBe(`mock-refresh.${DEMO_IDS.userId}.unit-test`);
  });

  it('logout calls the API with the refresh token and clears storage', async () => {
    const user = userEvent.setup();
    const logoutBodies: unknown[] = [];
    server.use(
      http.post(`${API}/auth/logout`, async ({ request }) => {
        logoutBodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    signInAs();
    renderApp('/dashboard');
    await findHeading(/Lena/);
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    await user.click(screen.getByRole('button', { name: /Benutzermenü/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Abmelden' }));
    await findHeading('Anmelden');
    expect(logoutBodies).toEqual([{ refreshToken: stored }]);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(session.getAccessToken()).toBeNull();
  });

  it('redirects to login (keeping the target) when there is no session', async () => {
    renderApp('/kunden');
    await findHeading('Anmelden');
    expect(window.location.hash).toContain('next=%2Fkunden');
  });

  it('retries a request once after a 401 using the refreshed access token', async () => {
    signInAs();
    let customerCalls = 0;
    server.use(
      http.get(`${API}/companies/:companyId/customers`, () => {
        customerCalls++;
        if (customerCalls === 1) return HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 });
        return undefined; // fall through to the mock backend
      }),
    );
    renderApp('/kunden');
    await findHeading('Kunden');
    expect((await screen.findAllByText('Bäckerei Huber KG', undefined, { timeout: 8000 })).length).toBeGreaterThan(0);
    await waitFor(() => expect(customerCalls).toBeGreaterThanOrEqual(2));
  });
});
