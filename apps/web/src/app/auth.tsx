import { getLocale, isLocale, type AuthResponse, type LoginRequest, type MeDto, type RegisterRequest } from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { applyLocale, tr } from '@/lib/i18n';
import { session, type Persistence } from '@/lib/session';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  user: MeDto | null;
  login: (request: Omit<LoginRequest, 'client'>, remember: boolean) => Promise<MeDto>;
  register: (request: Omit<RegisterRequest, 'client'>) => Promise<MeDto>;
  logout: () => Promise<void>;
  /** Reloads /me (e.g. after creating a company or accepting an invitation). */
  reloadUser: () => Promise<MeDto | null>;
  setUser: (user: MeDto) => void;
  /** Retries the startup session restore after a network error. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(() => (session.hasStoredSession() ? 'loading' : 'anonymous'));
  const [user, setUserState] = useState<MeDto | null>(null);
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const applyAuth = useCallback((response: AuthResponse, persistence: Persistence) => {
    session.store(response, persistence);
    setUserState(response.user);
    setStatus('authenticated');
    return response.user;
  }, []);

  // Signed in, the language stored on the user wins (set at registration or by switching it in the app).
  const userLanguage = user?.language;
  useEffect(() => {
    if (isLocale(userLanguage) && userLanguage !== getLocale()) applyLocale(userLanguage);
  }, [userLanguage]);

  // Session events from background refreshes (API client 401 handling).
  useEffect(() => {
    session.setEvents({
      onRefreshed: (refreshedUser) => setUserState(refreshedUser),
      onExpired: () => {
        const wasAuthenticated = statusRef.current === 'authenticated';
        setUserState(null);
        setStatus('anonymous');
        queryClient.clear();
        if (wasAuthenticated) toast.info(tr('Sitzung abgelaufen', 'Session expired'), tr('Bitte melden Sie sich erneut an.', 'Please sign in again.'));
      },
    });
    return () => session.setEvents({});
  }, [queryClient]);

  // Restore the session from the stored refresh token on startup.
  useEffect(() => {
    if (!session.hasStoredSession()) return;
    let cancelled = false;
    session
      .refresh()
      .then((response) => {
        if (cancelled) return;
        if (response) {
          setUserState(response.user);
          setStatus('authenticated');
        } else {
          setStatus('anonymous');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Another tab logged out or rotated the token.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ap.refreshToken' && event.newValue === null && statusRef.current === 'authenticated' && !session.hasStoredSession()) {
        session.clear();
        setUserState(null);
        setStatus('anonymous');
        queryClient.clear();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  const login = useCallback(
    async (request: Omit<LoginRequest, 'client'>, remember: boolean) => {
      const response = await api.auth.login({ ...request, client: 'Web' });
      queryClient.clear();
      return applyAuth(response, remember ? 'local' : 'session');
    },
    [applyAuth, queryClient],
  );

  const register = useCallback(
    async (request: Omit<RegisterRequest, 'client'>) => {
      const response = await api.auth.register({ language: getLocale(), ...request, client: 'Web' });
      queryClient.clear();
      return applyAuth(response, 'session');
    },
    [applyAuth, queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = session.getRefreshToken();
    try {
      await api.auth.logout({ refreshToken });
    } catch {
      // Logging out locally is what matters; the server token expires anyway.
    }
    session.clear();
    queryClient.clear();
    setUserState(null);
    setStatus('anonymous');
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    const me = await api.me.get();
    setUserState(me);
    return me;
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, reloadUser, setUser: setUserState, retry }),
    [status, user, login, register, logout, reloadUser, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The authenticated user (only inside protected routes). */
export function useUser(): MeDto {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires an authenticated session');
  return user;
}
