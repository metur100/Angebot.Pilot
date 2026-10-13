// Dev-only: starts the MSW service worker (VITE_USE_MOCKS=true or `npm run dev:mock`). Never imported in production builds.
import { setupWorker } from 'msw/browser';
import { resetMockDb } from './db';
import { handlers } from './handlers';

declare global {
  interface Window {
    __apMock?: { reset: typeof resetMockDb };
  }
}

export async function startMockWorker() {
  const worker = setupWorker(...handlers);
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
  window.__apMock = { reset: resetMockDb };
  console.info('[AngebotPilot] Mock-API aktiv (MSW). Demo-Login: demo@angebotpilot.de / Demo12345!');
}
