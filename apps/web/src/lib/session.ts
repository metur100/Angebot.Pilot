import { ApiError, type AuthResponse, type MeDto } from '@angebotpilot/api-contracts';

/**
 * Token handling for the cross-origin web app (GitHub Pages → API):
 * - The access token lives in memory only.
 * - The refresh token is returned in the response body and stored in localStorage ("Angemeldet bleiben")
 *   or sessionStorage (until the browser tab is closed).
 * - Refresh tokens rotate: every refresh response replaces the stored token.
 * - Concurrent refresh attempts share one in-flight request (single flight), otherwise the rotated token
 *   would be presented twice and the server would treat it as reuse.
 */
export const REFRESH_TOKEN_KEY = 'ap.refreshToken';

export type Persistence = 'local' | 'session';

type RefreshCall = (refreshToken: string) => Promise<AuthResponse>;

export interface SessionEvents {
  /** A refresh produced a new access token and (possibly updated) user. */
  onRefreshed?: (user: MeDto) => void;
  /** The session ended (refresh token rejected or missing). */
  onExpired?: () => void;
}

function safeStorage(kind: Persistence): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export class SessionManager {
  private accessToken: string | null = null;
  private inflight: Promise<AuthResponse | null> | null = null;
  private refreshCall: RefreshCall | null = null;
  private events: SessionEvents = {};

  configure(refreshCall: RefreshCall, events: SessionEvents = {}) {
    this.refreshCall = refreshCall;
    this.events = events;
  }

  setEvents(events: SessionEvents) {
    this.events = events;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return safeStorage('local')?.getItem(REFRESH_TOKEN_KEY) ?? safeStorage('session')?.getItem(REFRESH_TOKEN_KEY) ?? null;
  }

  /** Where the refresh token is currently stored. */
  getPersistence(): Persistence | null {
    if (safeStorage('local')?.getItem(REFRESH_TOKEN_KEY)) return 'local';
    if (safeStorage('session')?.getItem(REFRESH_TOKEN_KEY)) return 'session';
    return null;
  }

  hasStoredSession(): boolean {
    return this.getRefreshToken() !== null;
  }

  /** Stores the tokens of a login/register/refresh response. */
  store(response: AuthResponse, persistence: Persistence = this.getPersistence() ?? 'session') {
    this.accessToken = response.accessToken;
    if (response.refreshToken) {
      const other: Persistence = persistence === 'local' ? 'session' : 'local';
      safeStorage(other)?.removeItem(REFRESH_TOKEN_KEY);
      safeStorage(persistence)?.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    }
  }

  clear() {
    this.accessToken = null;
    this.inflight = null;
    safeStorage('local')?.removeItem(REFRESH_TOKEN_KEY);
    safeStorage('session')?.removeItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Exchanges the stored refresh token for a new token pair. Concurrent callers share one request.
   * Resolves null when there is no valid session. Network errors are re-thrown (the session is kept,
   * so a temporary outage does not log the user out).
   */
  refresh(): Promise<AuthResponse | null> {
    if (this.inflight) return this.inflight;
    const refreshToken = this.getRefreshToken();
    if (!refreshToken || !this.refreshCall) {
      return Promise.resolve(null);
    }
    const persistence = this.getPersistence() ?? 'session';
    const call = this.refreshCall;
    this.inflight = (async () => {
      try {
        const response = await call(refreshToken);
        this.store(response, persistence);
        this.events.onRefreshed?.(response.user);
        return response;
      } catch (error) {
        if (error instanceof ApiError) {
          this.clear();
          this.events.onExpired?.();
          return null;
        }
        throw error;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Used by the API client on 401: returns a fresh access token or null. */
  async refreshAccessToken(): Promise<string | null> {
    const response = await this.refresh();
    return response?.accessToken ?? null;
  }

  expire() {
    const hadSession = this.accessToken !== null || this.hasStoredSession();
    this.clear();
    if (hadSession) this.events.onExpired?.();
  }
}

export const session = new SessionManager();
