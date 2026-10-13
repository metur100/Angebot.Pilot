import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, DEMO, goto, login, registerViaApi, uniqueEmail } from './helpers';

/**
 * Official screenshots (1440×900) from the REAL API with the seeded demo account (read-only – nothing is saved).
 *   SCREENSHOTS=1 npx playwright test screenshots --project=desktop-chromium
 * Output: screenshots/web/*.png
 */
// Spec files outside the web package are loaded as CommonJS by Playwright, so __dirname is available.
const OUT = join(__dirname, '..', '..', 'screenshots', 'web') + '/';

test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to capture the official screenshots.');
test.use({ viewport: { width: 1440, height: 900 } });

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

async function demoQuotations(request: APIRequestContext) {
  const auth = await request.post(`${API}/auth/login`, { data: { email: DEMO.email, password: DEMO.password, client: 'Web' } });
  const body = (await auth.json()) as { accessToken: string; refreshToken: string; user: { companies: { companyId: string }[] } };
  const companyId = body.user.companies[0]!.companyId;
  const list = await request.get(`${API}/companies/${companyId}/quotations`, {
    headers: { Authorization: `Bearer ${body.accessToken}` },
    params: { pageSize: 50 },
  });
  const items = ((await list.json()) as { items: { id: string; status: string; number: string }[] }).items;
  await request.post(`${API}/auth/logout`, { data: { refreshToken: body.refreshToken } });
  const byStatus = (status: string) => items.find((q) => q.status === status)?.id ?? '';
  return { draft: byStatus('Draft'), sent: items.filter((q) => q.status === 'Sent').map((q) => q.id) };
}

test('official screenshots @desktop-only', async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  await mkdir(OUT, { recursive: true });
  const ids = await demoQuotations(request);

  await goto(page, '/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
  await shot(page, 'login');
  // The marketing landing page lives in the separate landing repository; the app's entry page is the login.
  await shot(page, 'landing-page');

  await login(page, DEMO.email, DEMO.password);
  await expect(page.getByRole('heading', { level: 1, name: /Guten/ })).toBeVisible();
  await shot(page, 'dashboard');

  await goto(page, '/kunden');
  await expect(page.getByRole('heading', { level: 1, name: 'Kunden' })).toBeVisible();
  await shot(page, 'customers');

  await goto(page, `/angebote/${ids.draft}/bearbeiten`);
  await expect(page.getByText('Gespeichert – Beträge vom Server berechnet.')).toBeVisible();
  await page.getByRole('heading', { name: 'Positionen' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -420));
  await shot(page, 'quotation-editor');

  const sentId = ids.sent[ids.sent.length - 1] ?? ids.sent[0]!;
  await goto(page, `/angebote/${sentId}/vorschau`);
  await expect(page.getByRole('article')).toBeVisible();
  await shot(page, 'quotation-preview');

  await goto(page, `/angebote/${sentId}/pdf`);
  await expect(page.getByTestId('pdf-page').first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'quotation-pdf');

  await goto(page, `/angebote/${ids.sent[0]!}`);
  await page.getByRole('tab', { name: 'Erinnerungen' }).click();
  await expect(page.getByTestId('follow-ups')).toBeVisible();
  await page.getByRole('tab', { name: 'Erinnerungen' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -88));
  await shot(page, 'follow-up-history');

  await goto(page, '/auftraege');
  await expect(page.getByRole('heading', { level: 1, name: 'Aufträge' })).toBeVisible();
  await shot(page, 'jobs');

  await goto(page, '/einstellungen/dokumente');
  await expect(page.getByRole('heading', { name: 'Logo' })).toBeVisible();
  await shot(page, 'settings');

  // Customer view: a showcase quotation in a separate account (the demo data has no retrievable public link).
  const owner = await registerViaApi(request, uniqueEmail('showcase'), 'Elektro Sommer GmbH');
  const customer = await request.post(`${API}/companies/${owner.companyId}/customers`, {
    headers: owner.headers,
    data: {
      type: 'Business', companyName: 'Hausverwaltung Lindenhof GmbH', salutation: 'Frau', firstName: 'Petra', lastName: 'Lindner',
      email: 'p.lindner@lindenhof.example', billingStreet: 'Lindenallee 12', billingPostalCode: '50858', billingCity: 'Köln',
      billingCountry: 'DE', hasServiceAddress: false, followUpOptOut: false,
    },
  });
  const customerId = ((await customer.json()) as { id: string }).id;
  const quotation = await request.post(`${API}/companies/${owner.companyId}/quotations`, {
    headers: owner.headers,
    data: {
      customerId,
      title: 'Treppenhausbeleuchtung mit Bewegungsmeldern',
      introText: 'Sehr geehrte Frau Lindner,\nvielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen folgende Leistungen an:',
      closingText: 'Wir freuen uns auf Ihren Auftrag.',
      paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
      lineItems: [
        { title: 'LED-Wandleuchte mit Bewegungsmelder', description: 'IP44, 3000 K, inkl. Montagematerial', quantity: 12, unit: 'Stk.', unitPriceNet: 89.5, discountPercent: 5, taxRatePercent: 19 },
        { title: 'Leitungsverlegung NYM-J 3×1,5 mm²', quantity: 45, unit: 'm', unitPriceNet: 6.8, discountPercent: 0, taxRatePercent: 19 },
        { title: 'Montage und Inbetriebnahme', quantity: 9, unit: 'Std.', unitPriceNet: 62, discountPercent: 0, taxRatePercent: 19 },
      ],
    },
  });
  expect(quotation.ok(), await quotation.text()).toBeTruthy();
  const quotationId = ((await quotation.json()) as { id: string }).id;
  const sent = await request.post(`${API}/companies/${owner.companyId}/quotations/${quotationId}/send`, {
    headers: owner.headers,
    data: { mode: 'Manual', includePublicLink: true, scheduleFollowUps: false },
  });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  const publicUrl = ((await sent.json()) as { publicUrl: string }).publicUrl;
  const token = /\/q\/([A-Za-z0-9_-]{20,})/.exec(publicUrl)?.[1] ?? '';
  const customerPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })).newPage();
  await goto(customerPage, `/q/${token}`);
  await expect(customerPage.getByRole('button', { name: /Angebot annehmen/ })).toBeVisible();
  await shot(customerPage, 'public-quotation');
});
