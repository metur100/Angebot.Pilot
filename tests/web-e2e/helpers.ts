import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:5080').replace(/\/$/, '');
export const API = `${API_URL}/api/v1`;

/**
 * Seeded demo account of the development API (read-mostly – used for read-only checks and screenshots).
 * `dotnet run -- seed-demo` prints the password (or uses DEMO_PASSWORD); pass it as E2E_DEMO_PASSWORD.
 */
export const DEMO = {
  email: process.env.E2E_DEMO_EMAIL ?? 'demo@angebotpilot.example',
  get password(): string {
    const value = process.env.E2E_DEMO_PASSWORD;
    if (!value) throw new Error('Set E2E_DEMO_PASSWORD to the password of the seeded demo account.');
    return value;
  },
};

export const PASSWORD = 'E2e-Passwort-2026';

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.example`;
}

/** Navigates to a hash route of the app (baseURL may contain a path such as /Angebot.Pilot.App/). */
export async function goto(page: Page, hashPath: string) {
  await page.goto(`./#${hashPath}`);
}

export async function login(page: Page, email: string, password: string) {
  await goto(page, '/login');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/#\/(dashboard|onboarding)/);
}

interface DevEmail {
  id: string;
  to: string;
  subject: string;
  bodyText: string;
  createdAt: string;
}

/** Polls the development email sink (emails are dispatched asynchronously). */
export async function waitForEmail(request: APIRequestContext, to: string, match: (mail: DevEmail) => boolean, timeoutMs = 30_000): Promise<DevEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`${API}/dev/emails`, { params: { to } });
    if (response.ok()) {
      const mails = (await response.json()) as DevEmail[];
      const found = mails.find(match);
      if (found) return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`No matching email for ${to} within ${timeoutMs} ms`);
}

/** Extracts a query/token value from a link in an email body. */
export function linkToken(body: string, pattern: RegExp): string {
  const match = pattern.exec(body);
  if (!match?.[1]) throw new Error(`Link ${pattern} not found in email:\n${body}`);
  return match[1];
}

/** Registers a user + company directly via the API (for secondary actors). */
export async function registerViaApi(request: APIRequestContext, email: string, companyName: string) {
  const register = await request.post(`${API}/auth/register`, {
    data: { email, password: PASSWORD, displayName: 'Zweite Testperson', acceptTerms: true, client: 'Web' },
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const auth = (await register.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const company = await request.post(`${API}/companies`, { headers, data: { name: companyName, defaultTaxMode: 'Standard' } });
  expect(company.ok(), await company.text()).toBeTruthy();
  return { headers, companyId: ((await company.json()) as { id: string }).id };
}

/** axe-core scan; fails on serious/critical violations (WCAG 2.1 A/AA rules). */
export async function expectNoSeriousA11yViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `axe violations on ${context}`).toEqual([]);
}

/** Asserts that the page does not scroll horizontally. */
export async function expectNoHorizontalOverflow(page: Page, context: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${context}`).toBeLessThanOrEqual(clientWidth + 1);
}
