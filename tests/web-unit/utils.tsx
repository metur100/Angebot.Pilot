import { render, screen } from '@testing-library/react';
import { App } from '@/app/App';
import { COMPANY_KEY } from '@/app/company';
import { createQueryClient } from '@/lib/queryClient';
import { REFRESH_TOKEN_KEY } from '@/lib/session';
import { DEMO_IDS } from '@/mocks/db';

export const API = 'http://api.test/api/v1';

/** Simulates a stored "Angemeldet bleiben" session for a seeded mock user. */
export function signInAs(userId: string = DEMO_IDS.userId, companyId: string = DEMO_IDS.companyId) {
  window.localStorage.setItem(REFRESH_TOKEN_KEY, `mock-refresh.${userId}.unit-test`);
  window.localStorage.setItem(COMPANY_KEY, companyId);
}

/** Renders the complete app (router, auth, query client) at a hash route against the MSW mock API. */
export function renderApp(hashPath: string) {
  window.location.hash = `#${hashPath}`;
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 }, mutations: { retry: false } });
  const result = render(<App queryClient={queryClient} />);
  return { ...result, queryClient };
}

/** Waits until a page heading with the given name is visible (lazy routes + data loading). */
export async function findHeading(name: string | RegExp) {
  return screen.findByRole('heading', { level: 1, name }, { timeout: 15000 });
}
