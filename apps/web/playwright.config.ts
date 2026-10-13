import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests against the REAL local API (default http://localhost:5080, Development environment with the capture
 * email sink). The web app is built like production (CSP included) and served by `vite preview` on :4173, which the
 * API's development CORS policy allows.
 *
 *   API running → npm run e2e            (from apps/web)
 *   E2E_API_URL / E2E_WEB_URL override the defaults.
 */
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:5080';
const webUrl = process.env.E2E_WEB_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: '../../tests/web-e2e',
  testIgnore: ['**/smoke.deployed.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: webUrl,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  metadata: { apiUrl },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
      // The long business workflow runs on desktop; mobile covers layout, navigation and accessibility.
      grepInvert: /@desktop-only/,
    },
  ],
  webServer: process.env.E2E_WEB_URL
    ? undefined
    : {
        command: 'npx vite build && npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { VITE_BASE_PATH: '/', VITE_API_BASE_URL: apiUrl },
      },
});
