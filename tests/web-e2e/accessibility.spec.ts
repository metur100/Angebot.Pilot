import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, expectNoSeriousA11yViolations, goto, login } from './helpers';

// Read-only checks with the seeded demo account (it must stay unchanged for the official screenshots).

test.describe('public pages', () => {
  for (const [path, heading] of [
    ['/login', 'Anmelden'],
    ['/registrieren', 'Konto erstellen'],
    ['/passwort-vergessen', 'Passwort vergessen?'],
  ] as const) {
    test(`${path} is accessible and responsive`, async ({ page }) => {
      await goto(page, path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expectNoSeriousA11yViolations(page, path);
      await expectNoHorizontalOverflow(page, path);
    });
  }

  test('legal links point to the landing site', async ({ page }) => {
    await goto(page, '/login');
    for (const name of ['Impressum', 'Datenschutz', 'AGB']) {
      await expect(page.getByRole('link', { name }).first()).toHaveAttribute('href', new RegExp(`${name === 'AGB' ? 'agb' : name.toLowerCase()}\\.html$`));
    }
  });

  test('invalid public links show a friendly page', async ({ page }) => {
    await goto(page, '/q/ungueltiger-token-0000000000000000');
    await expect(page.getByRole('heading', { name: /Link ungültig|nicht mehr verfügbar/ })).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'invalid public link');
  });
});

test.describe('signed-in pages (demo account)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO.email, DEMO.password);
  });

  const pages: [string, RegExp][] = [
    ['/dashboard', /Guten (Morgen|Tag|Abend)/],
    ['/angebote', /^Angebote$/],
    ['/kunden', /^Kunden$/],
    ['/auftraege', /^Aufträge$/],
    ['/rechnungen', /^Rechnungen$/],
    ['/rechnungen?ueberfaellig=1', /^Rechnungen$/],
    ['/vorlagen', /^Vorlagen$/],
    ['/team', /^Team$/],
    ['/einstellungen/firma', /^Einstellungen$/],
    ['/einstellungen/dokumente', /^Einstellungen$/],
    ['/einstellungen/abo', /^Einstellungen$/],
    ['/angebote/neu', /^Neues Angebot$/],
    ['/rechnungen/neu', /^Neue Rechnung$/],
  ];

  for (const [path, heading] of pages) {
    test(`${path} has no serious accessibility violations and no horizontal overflow`, async ({ page }) => {
      await goto(page, path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoSeriousA11yViolations(page, path);
      await expectNoHorizontalOverflow(page, path);
    });
  }

  test('quotation detail, preview and PDF render', async ({ page }) => {
    await goto(page, '/angebote');
    await page.getByRole('link', { name: /AN-\d{4}-\d{4}/ }).first().click();
    await expect(page.getByRole('tab', { name: 'Verlauf' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'quotation detail');
    await expectNoHorizontalOverflow(page, 'quotation detail');
    const detailUrl = page.url();
    await page.goto(detailUrl.replace(/#\/angebote\/([^/?]+).*/, '#/angebote/$1/vorschau'));
    await expect(page.getByRole('article')).toBeVisible();
    await page.goto(detailUrl.replace(/#\/angebote\/([^/?]+).*/, '#/angebote/$1/pdf'));
    await expect(page.getByTestId('pdf-page').first()).toBeVisible({ timeout: 30_000 });
  });

  test('mobile navigation opens as an off-canvas menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile only');
    await goto(page, '/dashboard');
    await page.getByRole('button', { name: 'Navigation öffnen' }).click();
    const nav = page.getByRole('dialog');
    await nav.getByRole('link', { name: 'Kunden' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kunden' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
