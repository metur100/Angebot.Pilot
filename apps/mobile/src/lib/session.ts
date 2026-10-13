// Session handling for the mobile app.
//  - The access token lives in memory only.
//  - The refresh token is stored in the device keychain/keystore via expo-secure-store.
//  - Mobile login/register send client: 'Mobile' and receive the refresh token in the response body.
//  - Logout revokes the refresh token on the server, wipes SecureStore and clears the query cache.
import {
  ApiError,
  createApiClient,
  getLocale,
  NetworkError,
  type AuthResponse,
  type MeDto,
  type MembershipDto,
  type RegisterRequest,
} from '@angebotpilot/api-contracts';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { API_BASE_URL } from './config';
import { applyAccountLanguage } from './preferences';
import { queryClient } from './queryClient';

export const SECURE_KEYS = {
  refreshToken: 'angebotpilot.refreshToken',
  activeCompanyId: 'angebotpilot.activeCompanyId',
} as const;

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn' | 'offline';

export interface SessionState {
  status: SessionStatus;
  user: MeDto | null;
  activeCompanyId: string | null;
  /** True when the user was signed out because the session expired (shown on the login screen). */
  expired: boolean;
}

const initialState: SessionState = { status: 'restoring', user: null, activeCompanyId: null, expired: false };

let state: SessionState = initialState;
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let lastRefreshFailedOffline = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const sessionStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Test helper. */
  reset() {
    state = initialState;
    accessToken = null;
    refreshInFlight = null;
    lastRefreshFailedOffline = false;
    listeners.forEach((listener) => listener());
  },
};

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const stored = await SecureStore.getItemAsync(SECURE_KEYS.refreshToken);
      if (!stored) return null;
      try {
        const response = await api.auth.refresh({ refreshToken: stored });
        lastRefreshFailedOffline = false;
        await applyAuth(response);
        return response.accessToken;
      } catch (error) {
        lastRefreshFailedOffline = error instanceof NetworkError;
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  client: 'mobile',
  getAccessToken: () => accessToken,
  refreshAccessToken,
  onSessionExpired: () => {
    // A failed refresh because the device is offline is not an expired session.
    if (lastRefreshFailedOffline) return;
    void expireSession();
  },
});

/** Forces a token refresh (used before authenticated downloads that bypass the API client). */
export function refreshSession(): Promise<string | null> {
  return refreshAccessToken();
}

function pickCompany(user: MeDto, preferred: string | null): string | null {
  const companies = user.companies;
  if (preferred && companies.some((c) => c.companyId === preferred)) return preferred;
  return companies[0]?.companyId ?? null;
}

async function applyAuth(response: AuthResponse) {
  accessToken = response.accessToken;
  if (response.refreshToken) {
    await SecureStore.setItemAsync(SECURE_KEYS.refreshToken, response.refreshToken);
  }
  const preferred = state.activeCompanyId ?? (await SecureStore.getItemAsync(SECURE_KEYS.activeCompanyId));
  // After sign-in the language saved on the account wins over the device choice.
  applyAccountLanguage(response.user);
  setState({ user: response.user, activeCompanyId: pickCompany(response.user, preferred) });
}

async function wipeLocalSession() {
  accessToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_KEYS.refreshToken),
    SecureStore.deleteItemAsync(SECURE_KEYS.activeCompanyId),
  ]);
  queryClient.clear();
}

/** Restores the session on app start: stored refresh token → new access token → signed in. */
export async function restoreSession(): Promise<void> {
  setState({ status: 'restoring' });
  const stored = await SecureStore.getItemAsync(SECURE_KEYS.refreshToken);
  if (!stored) {
    setState({ status: 'signedOut', user: null, activeCompanyId: null });
    return;
  }
  try {
    const response = await api.auth.refresh({ refreshToken: stored });
    await applyAuth(response);
    setState({ status: 'signedIn', expired: false });
  } catch (error) {
    if (error instanceof NetworkError) {
      setState({ status: 'offline' });
      return;
    }
    await wipeLocalSession();
    setState({ status: 'signedOut', user: null, activeCompanyId: null, expired: error instanceof ApiError });
  }
}

export async function login(email: string, password: string): Promise<void> {
  const response = await api.auth.login({ email: email.trim(), password, client: 'Mobile' });
  await applyAuth(response);
  setState({ status: 'signedIn', expired: false });
}

export async function register(body: Omit<RegisterRequest, 'client'>): Promise<void> {
  // The account starts in the language the user registered in (verification email, later sign-ins).
  const response = await api.auth.register({ language: getLocale(), ...body, email: body.email.trim(), client: 'Mobile' });
  await applyAuth(response);
  setState({ status: 'signedIn', expired: false });
}

/** Secure logout: revoke the refresh token on the server (best effort), wipe SecureStore and the query cache. */
export async function logout(): Promise<void> {
  const stored = await SecureStore.getItemAsync(SECURE_KEYS.refreshToken);
  try {
    if (stored) await api.auth.logout({ refreshToken: stored });
  } catch {
    // The local session is removed regardless; an unreachable server must not keep the user signed in.
  }
  await wipeLocalSession();
  setState({ status: 'signedOut', user: null, activeCompanyId: null, expired: false });
}

/** Called when the API rejects the session even after a refresh attempt. */
export async function expireSession(): Promise<void> {
  if (state.status !== 'signedIn') return;
  await wipeLocalSession();
  setState({ status: 'signedOut', user: null, activeCompanyId: null, expired: true });
}

/** Called after the account was deleted on the server. */
export async function clearAfterAccountDeletion(): Promise<void> {
  await wipeLocalSession();
  setState({ status: 'signedOut', user: null, activeCompanyId: null, expired: false });
}

/** Reloads /me (e.g. after creating a company or accepting an invitation). */
export async function reloadUser(preferCompanyId?: string): Promise<MeDto> {
  const user = await api.me.get();
  const activeCompanyId = pickCompany(user, preferCompanyId ?? state.activeCompanyId);
  if (activeCompanyId) await SecureStore.setItemAsync(SECURE_KEYS.activeCompanyId, activeCompanyId);
  applyAccountLanguage(user);
  setState({ user, activeCompanyId });
  return user;
}

export function updateUser(user: MeDto) {
  applyAccountLanguage(user);
  setState({ user, activeCompanyId: pickCompany(user, state.activeCompanyId) });
}

export async function setActiveCompany(companyId: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.activeCompanyId, companyId);
  queryClient.clear();
  setState({ activeCompanyId: companyId });
}

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, sessionStore.getState);
}

export function useMembership(): MembershipDto | null {
  const { user, activeCompanyId } = useSession();
  return user?.companies.find((c) => c.companyId === activeCompanyId) ?? null;
}

/** The active company id. Screens inside the signed-in area can rely on it being set. */
export function useCompanyId(): string {
  return useSession().activeCompanyId ?? '';
}

export function canManageCompany(membership: MembershipDto | null): boolean {
  return membership?.role === 'Owner' || membership?.role === 'Admin';
}
