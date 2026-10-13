import { createApiClient } from '@angebotpilot/api-contracts';
import { API_BASE_URL } from './env';
import { session } from './session';

/** Singleton API client of the web app. Tokens come from the session manager. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  client: 'web',
  credentials: 'omit',
  getAccessToken: () => session.getAccessToken(),
  refreshAccessToken: () => session.refreshAccessToken(),
  onSessionExpired: () => session.expire(),
});

session.configure((refreshToken) => api.auth.refresh({ refreshToken }));
