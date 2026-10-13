import { expect, test } from '@playwright/test';
import {
  API,
  expectNoSeriousA11yViolations,
  goto,
  linkToken,
  PASSWORD,
  registerViaApi,
  uniqueEmail,
  waitForEmail,
} from './helpers';

/**
 * Full business workflow against the real API:
 * register → company → customer → quotation (multiple line items, totals) → PDF → send by email → events →
 * public link from the captured email → customer accepts → reminders cancelled → job → isolation → CSV export.
 */
test('complete quotation workflow @desktop-only', async ({ page, browser, request }) => {
  test.setTimeout(240_000);
  const ownerEmail = uniqueEmail('inhaber');
  const customerEmail = uniqueEmail('kunde');
  let customerId = '';
  let quotationId = '';
  let quotationNumber = '';
  let publicToken = '';

  await test.step('register a new account', async () => {
    await goto(page, '/registrieren');
    await page.getByLabel(/Ihr Name/).fill('Erika Test');
    await page.getByLabel(/E-Mail-Adresse/).fill(ownerEmail);
    await page.getByRole('textbox', { name: 'Passwort', exact: true }).fill(PASSWORD);
    await page.getByLabel(/Ich akzeptiere die/).check();
    await page.getByRole('button', { name: 'Konto erstellen' }).click();
    await expect(page.getByRole('heading', { name: 'Legen Sie Ihre Firma an' })).toBeVisible();
  });

  await test.step('create the company (onboarding)', async () => {
    await page.getByLabel(/Firmenname/).fill('E2E Elektro GmbH');
    await page.getByLabel(/Straße und Hausnummer/).fill('Teststraße 1');
    await page.getByLabel(/^PLZ/).fill('80331');
    await page.getByLabel(/^Ort/).fill('München');
    await page.getByRole('button', { name: 'Firma anlegen und loslegen' }).click();
    await expect(page).toHaveURL(/#\/dashboard/);
    await expect(page.getByText('Willkommen bei AngebotPilot – in drei Schritten zum ersten Angebot')).toBeVisible();
  });

  await test.step('verify the email address via the captured email', async () => {
    const mail = await waitForEmail(request, ownerEmail, (m) => m.bodyText.includes('verify-email'));
    const token = linkToken(mail.bodyText, /verify-email\?token=([^\s&]+)/);
    await goto(page, `/verify-email?token=${token}`);
    await expect(page.getByText('Ihre E-Mail-Adresse ist bestätigt.')).toBeVisible();
    await page.getByRole('link', { name: 'Weiter zum Dashboard' }).click();
    await expect(page.getByText('Bitte bestätigen Sie Ihre E-Mail-Adresse.')).toHaveCount(0);
  });

  await test.step('create a customer', async () => {
    await goto(page, '/kunden/neu');
    await page.getByLabel(/^Firmenname/).fill('Bäckerei E2E KG');
    await page.getByLabel(/^Nachname/).fill('Huber');
    await page.getByLabel(/^E-Mail/).fill(customerEmail);
    await page.getByLabel(/^Straße und Hausnummer/).fill('Marktplatz 3');
    await page.getByLabel(/^PLZ/).fill('80331');
    await page.getByLabel(/^Ort/).fill('München');
    await page.getByRole('button', { name: 'Kunde anlegen' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bäckerei E2E KG' })).toBeVisible();
    customerId = /#\/kunden\/([^/?]+)/.exec(page.url())?.[1] ?? '';
    expect(customerId).not.toBe('');
  });

  await test.step('create a quotation with several line items and verify totals', async () => {
    await goto(page, `/angebote/neu?kunde=${customerId}`);
    await expect(page.getByRole('heading', { name: 'Neues Angebot' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Neues Angebot' }).getByText('Bäckerei E2E KG')).toBeVisible();
    await page.getByLabel(/^Betreff/).fill('Ladenbeleuchtung E2E');

    const lines = [
      { title: 'LED-Spot', qty: '3', price: '19,99', discount: '0', rate: '19' },
      { title: 'Montage', qty: '2,5', price: '48', discount: '10', rate: '19' },
      { title: 'Fachbuch Elektro', qty: '1', price: '12,35', discount: '0', rate: '7' },
    ];
    for (const [index, line] of lines.entries()) {
      if (index > 0) await page.getByRole('button', { name: 'Position hinzufügen' }).click();
      const n = index + 1;
      await page.getByLabel(`Bezeichnung, Position ${n}`).fill(line.title);
      await page.getByLabel(`Menge, Position ${n}`).fill(line.qty);
      await page.getByLabel(`Einzelpreis netto, Position ${n}`).fill(line.price);
      await page.getByLabel(`Rabatt in Prozent, Position ${n}`).fill(line.discount);
      await page.getByLabel(`USt.-Satz, Position ${n}`).selectOption(line.rate);
    }
    await expect(page.getByTestId('totals-net')).toHaveText(/180,32/);
    await expect(page.getByTestId('totals-vat-19')).toHaveText(/31,91/);
    await expect(page.getByTestId('totals-vat-7')).toHaveText(/0,86/);
    await expect(page.getByTestId('totals-gross')).toHaveText(/213,09/);

    await page.getByRole('button', { name: /Entwurf speichern/ }).click();
    await expect(page).toHaveURL(/#\/angebote\/[^/]+\/bearbeiten/);
    await expect(page.getByText('Gespeichert – Beträge vom Server berechnet.')).toBeVisible();
    await expect(page.getByTestId('totals-gross')).toHaveText(/213,09/);
    quotationId = /#\/angebote\/([^/]+)\/bearbeiten/.exec(page.url())?.[1] ?? '';
    quotationNumber = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').replace(/^Angebot\s+|\s+bearbeiten$/g, '').trim();
    expect(quotationNumber).toMatch(/\d/);
  });

  await test.step('PDF preview renders with pdf.js', async () => {
    await goto(page, `/angebote/${quotationId}/pdf`);
    await expect(page.getByTestId('pdf-page').first()).toBeVisible({ timeout: 30_000 });
    const box = await page.getByTestId('pdf-page').first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(400);
  });

  await test.step('send by email', async () => {
    await goto(page, `/angebote/${quotationId}`);
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/Empfänger/)).toHaveValue(customerEmail);
    await expect(dialog.getByText(/1\. Erinnerung/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Jetzt senden' }).click();
    await expect(page.getByRole('dialog', { name: 'Angebot versendet' })).toBeVisible();
    const url = await page.getByTestId('public-link-url').inputValue();
    publicToken = linkToken(url, /\/q\/([A-Za-z0-9_-]{20,})/);
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByText('Versendet', { exact: true }).first()).toBeVisible();
  });

  await test.step('status, events and delivery are visible', async () => {
    await page.reload();
    await expect(page.getByText('Per E-Mail versendet')).toBeVisible();
    await page.getByRole('tab', { name: 'E-Mail-Versand' }).click();
    await expect(page.getByText(customerEmail).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Erinnerungen' }).click();
    await expect(page.getByTestId('follow-ups').getByText('Geplant').first()).toBeVisible();
  });

  await test.step('the captured customer email links to the public page', async () => {
    const mail = await waitForEmail(request, customerEmail, (m) => /\/q\/[A-Za-z0-9_-]{20,}/.test(m.bodyText));
    expect(linkToken(mail.bodyText, /\/q\/([A-Za-z0-9_-]{20,})/)).toBe(publicToken);
  });

  await test.step('customer accepts on the public page', async () => {
    const customerContext = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
    const customer = await customerContext.newPage();
    await goto(customer, `/q/${publicToken}`);
    await expect(customer.getByRole('heading', { level: 1, name: 'Ihr Angebot von E2E Elektro GmbH' })).toBeVisible();
    await expect(customer.getByRole('article').getByRole('heading', { name: 'Ladenbeleuchtung E2E' })).toBeVisible();
    await expect(customer.getByText(/Das Öffnen dieser Seite wird/)).toBeVisible();
    await expectNoSeriousA11yViolations(customer, 'public quotation page');
    await customer.getByRole('button', { name: /Angebot annehmen/ }).click();
    const dialog = customer.getByRole('dialog', { name: 'Angebot verbindlich annehmen' });
    await dialog.getByLabel(/Ihr vollständiger Name/).fill('Josef Huber');
    await dialog.getByLabel(/Ich nehme dieses Angebot verbindlich an/).check();
    await dialog.getByRole('button', { name: 'Jetzt verbindlich annehmen' }).click();
    await expect(customer.getByRole('heading', { name: /Ihre Annahme ist eingegangen/ })).toBeVisible();
    await customerContext.close();
  });

  await test.step('quotation is accepted and reminders are cancelled', async () => {
    await page.reload();
    await expect(page.getByText(/Angenommen am/)).toBeVisible();
    await expect(page.getByText(/Online angenommen von Josef Huber/)).toBeVisible();
    await page.getByRole('tab', { name: 'Erinnerungen' }).click();
    const followUps = page.getByTestId('follow-ups');
    await expect(followUps.getByText('Abgebrochen').first()).toBeVisible();
    await expect(followUps.getByText('Geplant', { exact: true })).toHaveCount(0);
  });

  await test.step('convert to job; the job references the quotation', async () => {
    await page.getByRole('button', { name: 'In Auftrag umwandeln' }).click();
    const dialog = page.getByRole('dialog', { name: 'In Auftrag umwandeln' });
    await dialog.getByRole('button', { name: 'Auftrag erstellen' }).click();
    await expect(page).toHaveURL(/#\/auftraege\/[^/]+$/);
    await expect(page.getByRole('link', { name: quotationNumber })).toBeVisible();
    await page.getByRole('link', { name: quotationNumber }).click();
    await expect(page.getByRole('link', { name: 'Zum Auftrag' }).first()).toBeVisible();
  });

  await test.step('another user/company cannot access the quotation', async () => {
    const other = await registerViaApi(request, uniqueEmail('fremd'), 'Fremdfirma GmbH');
    // Access via the other user's own company scope and via the owner's company scope must both fail.
    const viaOwn = await request.get(`${API}/companies/${other.companyId}/quotations/${quotationId}`, { headers: other.headers });
    expect([403, 404]).toContain(viaOwn.status());
    const companies = await request.get(`${API}/me`, { headers: other.headers });
    expect(companies.ok()).toBeTruthy();
    const me = (await companies.json()) as { companies: { companyId: string }[] };
    expect(me.companies).toHaveLength(1);
    const ownerCompanyId = await page.evaluate(() => window.localStorage.getItem('ap.companyId'));
    const viaForeign = await request.get(`${API}/companies/${ownerCompanyId}/quotations/${quotationId}`, { headers: other.headers });
    expect([403, 404]).toContain(viaForeign.status());
  });

  await test.step('CSV export downloads', async () => {
    await goto(page, '/angebote');
    await expect(page.getByText(quotationNumber).first()).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV exportieren' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^angebote-.*\.csv$/);
    const path = await download.path();
    const { readFile } = await import('node:fs/promises');
    const csv = await readFile(path, 'utf8');
    expect(csv).toContain(quotationNumber);
  });
});
