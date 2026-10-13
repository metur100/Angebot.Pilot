import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, DEMO, expectNoHorizontalOverflow, expectNoSeriousA11yViolations, goto, login, registerViaApi, uniqueEmail } from './helpers';

// English UI and dark mode. Read-only with the seeded demo account; the language switch is saved on the demo user,
// so every test resets it to German afterwards.
//
// Optional review screenshots: WEB_SHOTS_DIR=<folder> npx playwright test i18n-theme --project=desktop-chromium

const SHOTS = process.env.WEB_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Sets the demo user's stored UI language back to German (servers without the field ignore it). */
async function resetDemoLanguage(request: APIRequestContext) {
  const auth = await request.post(`${API}/auth/login`, { data: { email: DEMO.email, password: DEMO.password, client: 'Web' } });
  if (!auth.ok()) return;
  const body = (await auth.json()) as { accessToken: string; refreshToken: string; user: { displayName: string } };
  await request.patch(`${API}/me`, {
    headers: { Authorization: `Bearer ${body.accessToken}` },
    data: { displayName: body.user.displayName, language: 'de' },
  });
  await request.post(`${API}/auth/logout`, { data: { refreshToken: body.refreshToken } });
}

/**
 * axe scan of an open popup only. Radix hides the rest of the page with aria-hidden while a modal menu/dialog is open
 * (focus is trapped), which axe reports as aria-hidden-focus for the page behind it – not a colour issue.
 */
async function expectAccessiblePopup(page: Page, selector: string, context: string) {
  const results = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `axe violations on ${context}`).toEqual([]);
}

/** Switches the language in the signed-in user menu. */
async function switchLanguage(page: Page, menuName: RegExp, language: 'Deutsch' | 'English') {
  await page.getByRole('button', { name: menuName }).click();
  await page.getByRole('menuitemradio', { name: language }).click();
}

/** Starts the page with a stored theme (as if chosen earlier); index.html applies it before the first paint. */
async function useStoredTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => window.localStorage.setItem('ap.theme', value), theme);
}

test.afterEach(async ({ request }) => {
  await resetDemoLanguage(request);
});

test.describe('English UI', () => {
  test('signed out: the login page switches to English and remembers it', async ({ page }) => {
    await goto(page, '/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
    await page.getByRole('group', { name: 'Sprache' }).getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Email address')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await goto(page, '/registrieren');
    await expect(page.getByRole('heading', { level: 1, name: 'Create account' })).toBeVisible();
  });

  test('signed in: dashboard, quotations and invoice detail in English @desktop-only', async ({ page }) => {
    await login(page, DEMO.email, DEMO.password);
    await switchLanguage(page, /^Benutzermenü/, 'English');

    await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const name of ['Dashboard', 'Quotations', 'Customers', 'Jobs', 'Invoices', 'Templates']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }

    await nav.getByRole('link', { name: 'Quotations' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Quotations' })).toBeVisible();
    await expect(page.getByRole('link', { name: /New quotation/ }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Customer' }).first()).toBeVisible();

    await goto(page, '/rechnungen');
    await expect(page.getByRole('heading', { level: 1, name: 'Invoices' })).toBeVisible();
    await page.getByRole('link', { name: /RE-\d{4}-\d{4}/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /RE-\d{4}-\d{4}/ })).toBeVisible();
    await expect(page.getByText('Payments', { exact: false }).first()).toBeVisible();
    // Amounts use English formatting (€1,234.56).
    await expect(page.getByText(/€\d{1,3}(,\d{3})*\.\d{2}/).first()).toBeVisible();

    // Back to German: the menu offers the language under its own name.
    await switchLanguage(page, /^User menu/, 'Deutsch');
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });
});

test.describe('dark mode', () => {
  test('the theme switch on the login page applies dark mode without reload', async ({ page }) => {
    await goto(page, '/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('group', { name: 'Farbschema' }).getByRole('button', { name: 'Dunkel' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171B23');
  });

  test('follows the operating system when set to system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await goto(page, '/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  for (const path of ['/login', '/registrieren', '/passwort-vergessen']) {
    test(`${path} has no serious accessibility violations in dark mode`, async ({ page }) => {
      await useStoredTheme(page, 'dark');
      await goto(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousA11yViolations(page, `${path} (dark)`);
    });
  }

  test.describe('signed in', () => {
    const pages: [string, RegExp][] = [
      ['/dashboard', /Guten (Morgen|Tag|Abend)/],
      ['/angebote', /^Angebote$/],
      ['/angebote/neu', /^Neues Angebot$/],
      ['/kunden', /^Kunden$/],
      ['/auftraege', /^Aufträge$/],
      ['/rechnungen', /^Rechnungen$/],
      ['/rechnungen/neu', /^Neue Rechnung$/],
      ['/vorlagen', /^Vorlagen$/],
      ['/team', /^Team$/],
      ['/einstellungen/firma', /^Einstellungen$/],
      ['/einstellungen/dokumente', /^Einstellungen$/],
      ['/einstellungen/benachrichtigungen', /^Einstellungen$/],
      ['/einstellungen/abo', /^Einstellungen$/],
      ['/einstellungen/konto', /^Einstellungen$/],
    ];

    test.beforeEach(async ({ page }) => {
      await useStoredTheme(page, 'dark');
      await login(page, DEMO.email, DEMO.password);
    });

    for (const [path, heading] of pages) {
      test(`${path} has no serious accessibility violations in dark mode`, async ({ page }) => {
        await goto(page, path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoSeriousA11yViolations(page, `${path} (dark)`);
        await expectNoHorizontalOverflow(page, `${path} (dark)`);
      });
    }

    test('quotation and invoice details are accessible in dark mode; the document preview stays paper-white', async ({ page }) => {
      await goto(page, '/angebote');
      await page.getByRole('link', { name: /AN-\d{4}-\d{4}/ }).first().click();
      await expect(page.getByRole('tab', { name: 'Verlauf' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoSeriousA11yViolations(page, 'quotation detail (dark)');

      const detailUrl = page.url();
      await page.goto(detailUrl.replace(/#\/angebote\/([^/?]+).*/, '#/angebote/$1/vorschau'));
      const article = page.getByRole('article');
      await expect(article).toBeVisible();
      expect(await article.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
      await expectNoSeriousA11yViolations(page, 'quotation preview (dark)');

      await goto(page, '/rechnungen');
      await page.getByRole('link', { name: /RE-\d{4}-\d{4}/ }).first().click();
      await expect(page.getByRole('heading', { level: 1, name: /RE-\d{4}-\d{4}/ })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoSeriousA11yViolations(page, 'invoice detail (dark)');
    });

    test('menus and dialogs are accessible in dark mode', async ({ page }) => {
      await goto(page, '/dashboard');
      await page.getByRole('button', { name: /^Benutzermenü/ }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expectAccessiblePopup(page, '[role="menu"]', 'user menu (dark)');
      await page.keyboard.press('Escape');

      await goto(page, '/team');
      await page.getByRole('button', { name: /einladen/i }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectAccessiblePopup(page, '[role="dialog"]', 'invite dialog (dark)');
    });
  });
});

// Review screenshots (English, light and dark) of the main pages – only written when WEB_SHOTS_DIR is set.
test('English screenshots in light and dark @desktop-only', async ({ browser }) => {
  test.skip(!SHOTS, 'Set WEB_SHOTS_DIR to write review screenshots.');
  test.setTimeout(300_000);
  for (const theme of ['light', 'dark'] as const) {
    // Theme preference 'system' (default) following the emulated OS setting.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, locale: 'de-DE' });
    const page = await context.newPage();
    await page.addInitScript(() => window.localStorage.setItem('ap.locale', 'en'));
    await goto(page, '/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await shot(page, `${theme}-login`);
    await page.getByLabel('Email address').fill(DEMO.email);
    await page.getByLabel('Password', { exact: true }).fill(DEMO.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await shot(page, `${theme}-dashboard`);

    for (const [path, name] of [
      ['/angebote', 'quotations'],
      ['/angebote/neu', 'quotation-editor'],
      ['/kunden', 'customers'],
      ['/auftraege', 'jobs'],
      ['/rechnungen', 'invoices'],
      ['/vorlagen', 'templates'],
      ['/team', 'team'],
      ['/einstellungen/firma', 'settings-company'],
      ['/einstellungen/dokumente', 'settings-documents'],
      ['/einstellungen/benachrichtigungen', 'settings-notifications'],
      ['/einstellungen/abo', 'settings-subscription'],
      ['/einstellungen/konto', 'settings-account'],
    ] as const) {
      await goto(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await shot(page, `${theme}-${name}`);
    }

    await goto(page, '/angebote');
    await page.getByRole('link', { name: /AN-\d{4}-\d{4}/ }).first().click();
    await expect(page.getByRole('tab').first()).toBeVisible();
    await shot(page, `${theme}-quotation-detail`);
    const detailUrl = page.url();
    await page.goto(detailUrl.replace(/#\/angebote\/([^/?]+).*/, '#/angebote/$1/vorschau'));
    await expect(page.getByRole('article')).toBeVisible();
    await shot(page, `${theme}-quotation-preview`);

    await goto(page, '/rechnungen');
    await page.getByRole('link', { name: /RE-\d{4}-\d{4}/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, `${theme}-invoice-detail`);

    await goto(page, '/kunden');
    await page.getByRole('link').filter({ hasText: /GmbH|KG|e\.K\./ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, `${theme}-customer-detail`);

    await page.getByRole('button', { name: /^User menu/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await shot(page, `${theme}-user-menu`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^User menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await context.close();
  }
});

test('public quotation page: English for the customer, accessible in dark mode, document stays German and white', async ({ page, request }) => {
  const owner = await registerViaApi(request, uniqueEmail('i18n-public'), 'Elektro Sommer GmbH');
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
      title: 'Treppenhausbeleuchtung',
      lineItems: [{ title: 'LED-Wandleuchte', quantity: 12, unit: 'Stk.', unitPriceNet: 1089.5, discountPercent: 0, taxRatePercent: 19 }],
    },
  });
  expect(quotation.ok(), await quotation.text()).toBeTruthy();
  const quotationId = ((await quotation.json()) as { id: string }).id;
  const sent = await request.post(`${API}/companies/${owner.companyId}/quotations/${quotationId}/send`, {
    headers: owner.headers,
    data: { mode: 'Manual', includePublicLink: true, scheduleFollowUps: false },
  });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  const token = /\/q\/([A-Za-z0-9_-]{20,})/.exec(((await sent.json()) as { publicUrl: string }).publicUrl)?.[1] ?? '';

  await useStoredTheme(page, 'dark');
  await goto(page, `/q/${token}`);
  await expect(page.getByRole('button', { name: /Angebot annehmen/ }).first()).toBeVisible();
  await page.getByRole('group', { name: 'Sprache' }).getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Accept quotation/ }).first()).toBeVisible();
  const article = page.getByRole('article');
  await expect(article).toHaveAttribute('lang', 'de');
  await expect(article).toContainText('Gültig bis');
  expect(await article.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.waitForLoadState('networkidle');
  await expectNoSeriousA11yViolations(page, 'public quotation page (en, dark)');
  if (SHOTS && test.info().project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shot(page, 'dark-public-quotation');
  }
});
