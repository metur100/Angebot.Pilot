import { expect, test } from '@playwright/test';

// Smoke checks for a deployed environment (no dev-only endpoints, no data changes).

test('login page loads with legal links and CSP', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  await page.goto('./#/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Impressum' }).first()).toHaveAttribute('href', /impressum\.html$/);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  if (process.env.E2E_API_URL) expect(csp).toContain(new URL(process.env.E2E_API_URL).origin);
  expect(errors).toEqual([]);
});

test('deep links work with hash routing', async ({ page }) => {
  await page.goto('./#/registrieren');
  await expect(page.getByRole('heading', { level: 1, name: 'Konto erstellen' })).toBeVisible();
  await page.goto('./#/gibt-es-nicht');
  await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible();
});

test('unknown public link shows a friendly message (API reachable)', async ({ page }) => {
  await page.goto('./#/q/smoke-test-token-000000000000000000');
  await expect(page.getByRole('heading', { name: /Link ungültig|nicht mehr verfügbar/ })).toBeVisible();
});

test('sign-in works when credentials are provided', async ({ page }) => {
  test.skip(!process.env.E2E_USER || !process.env.E2E_PASSWORD, 'E2E_USER/E2E_PASSWORD not set');
  await page.goto('./#/login');
  await page.getByLabel('E-Mail-Adresse').fill(process.env.E2E_USER ?? '');
  await page.getByLabel('Passwort', { exact: true }).fill(process.env.E2E_PASSWORD ?? '');
  await page.getByLabel('Angemeldet bleiben').uncheck();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/#\/(dashboard|onboarding)/);
});
