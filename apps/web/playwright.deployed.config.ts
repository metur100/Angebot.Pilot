import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against a deployed environment. Does not use dev-only endpoints (no email sink) and does not create data
 * unless E2E_USER/E2E_PASSWORD are given (then it only signs in and reads).
 *
 *   E2E_WEB_URL=https://metur100.github.io/Angebot.Pilot.App/ E2E_API_URL=https://angebotpilot.runasp.net npm run e2e:deployed
 */
const webUrl = process.env.E2E_WEB_URL;
if (!webUrl) throw new Error('E2E_WEB_URL is required, e.g. https://metur100.github.io/Angebot.Pilot.App/');

export default defineConfig({
  testDir: '../../tests/web-e2e',
  testMatch: ['**/smoke.deployed.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 1,
  reporter: [['list']],
  outputDir: 'test-results-deployed',
  use: {
    baseURL: webUrl.endsWith('/') ? webUrl : `${webUrl}/`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
