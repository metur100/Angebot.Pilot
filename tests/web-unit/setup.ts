import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { toast } from '@/components/ui/Toast';
import { networkStatus } from '@/lib/networkStatus';
import { session } from '@/lib/session';
import { resetMockDb } from '@/mocks/db';
import { server } from './server';

// Lazy routes + mock API round trips can take a moment on cold, parallel test runs.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks a few browser APIs that Radix UI and our hooks rely on.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => undefined;
}
window.scrollTo = () => undefined;

// The MSW mock backend (apps/web/src/mocks) answers all API calls with realistic DTOs.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
  session.clear();
  session.setEvents({});
  toast.clear();
  networkStatus.setApiUnreachable(false);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = '';
});
afterAll(() => server.close());
