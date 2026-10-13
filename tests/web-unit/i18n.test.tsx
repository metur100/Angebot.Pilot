import { formatEur, getLocale } from '@angebotpilot/api-contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLocale, LOCALE_KEY, LocaleBoundary, LocaleProvider, tr, useLocale } from '@/lib/i18n';
import { db, DEMO_IDS } from '@/mocks/db';
import { server } from './server';
import { findHeading, renderApp, signInAs } from './utils';

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', { configurable: true, get: () => languages });
  Object.defineProperty(window.navigator, 'language', { configurable: true, get: () => languages[0] });
}

afterEach(() => setBrowserLanguages(['de-DE', 'de']));

let renders = 0;
function Probe() {
  const { locale, setLanguage } = useLocale();
  renders++;
  return (
    <div>
      <p>{tr('Angebote', 'Quotations')}</p>
      <p data-testid="amount">{formatEur(1234.5)}</p>
      <button type="button" onClick={() => setLanguage(locale === 'de' ? 'en' : 'de')}>
        switch
      </button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <LocaleProvider>
      <LocaleBoundary>
        <Probe />
      </LocaleBoundary>
    </LocaleProvider>,
  );

describe('LocaleProvider', () => {
  it('starts in the browser language when nothing is stored', () => {
    setBrowserLanguages(['en-US', 'en']);
    renderProbe();
    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('Quotations')).toBeInTheDocument();
    expect(screen.getByTestId('amount')).toHaveTextContent('€1,234.50');
  });

  it('falls back to German for other browser languages', () => {
    setBrowserLanguages(['fr-FR', 'it']);
    renderProbe();
    expect(getLocale()).toBe('de');
    expect(screen.getByText('Angebote')).toBeInTheDocument();
  });

  it('prefers the language remembered in this browser', () => {
    setBrowserLanguages(['de-DE']);
    localStorage.setItem(LOCALE_KEY, 'en');
    renderProbe();
    expect(getLocale()).toBe('en');
    expect(screen.getByText('Quotations')).toBeInTheDocument();
  });

  it('switches the language in place, remembers it and updates <html lang>', async () => {
    const user = userEvent.setup();
    renderProbe();
    expect(screen.getByText('Angebote')).toBeInTheDocument();
    expect(screen.getByTestId('amount')).toHaveTextContent('1.234,50 €');

    renders = 0;
    await user.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByText('Quotations')).toBeInTheDocument();
    expect(screen.getByTestId('amount')).toHaveTextContent('€1,234.50');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(renders).toBeGreaterThan(0);

    applyLocale('de');
    await screen.findByText('Angebote');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });
});

describe('language of a signed-in user', () => {
  it('uses the language stored on the user over the browser choice', async () => {
    localStorage.setItem(LOCALE_KEY, 'de');
    db.users.find((u) => u.id === DEMO_IDS.userId)!.language = 'en';
    signInAs();
    renderApp('/angebote');
    await findHeading('Quotations');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument();
  });

  it('saves a language switch to the profile', async () => {
    const user = userEvent.setup();
    let patched: unknown = null;
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH' && request.url.endsWith('/me')) patched = await request.clone().json();
    });
    signInAs();
    renderApp('/einstellungen/konto');
    await findHeading('Einstellungen');
    await user.click(screen.getByRole('button', { name: 'English' }));

    await findHeading('Settings');
    await waitFor(() => expect(patched).toMatchObject({ language: 'en' }));
    expect(db.users.find((u) => u.id === DEMO_IDS.userId)!.language).toBe('en');
    expect(getLocale()).toBe('en');
    server.events.removeAllListeners();
  });
});

describe('English UI', () => {
  const totalsText = () => (screen.getByTestId('totals-panel').textContent ?? '').replace(/\s+/g, ' ');

  it('calculates quotation totals from English number input', async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_KEY, 'en');
    db.users.find((u) => u.id === DEMO_IDS.userId)!.language = 'en';
    signInAs();
    renderApp('/angebote/neu');
    await findHeading('New quotation');

    const combobox = await screen.findByRole('combobox', { name: /^Customer/ });
    await user.type(combobox, 'Huber');
    await user.click(await screen.findByRole('option', { name: /Bäckerei Huber KG/ }, { timeout: 5000 }));
    await user.type(screen.getByLabelText(/^Subject/), 'Shop lighting');

    const fill = async (index: number, values: { title: string; qty: string; price: string; discount?: string }) => {
      const scope = within(screen.getAllByTestId('line-item')[index]!);
      await user.type(scope.getByLabelText(/^Item/), values.title);
      const qty = scope.getByLabelText('Quantity');
      await user.clear(qty);
      await user.type(qty, values.qty);
      await user.type(scope.getByLabelText('Net unit price'), values.price);
      if (values.discount) {
        const discount = scope.getByLabelText('Discount');
        await user.clear(discount);
        await user.type(discount, values.discount);
      }
    };
    await fill(0, { title: 'LED spot', qty: '3', price: '19.99' });
    await user.click(screen.getByRole('button', { name: 'Add line item' }));
    await fill(1, { title: 'Installation', qty: '2.5', price: '1,048', discount: '10' });

    // 3 × 19.99 = 59.97; 2.5 × 1,048 = 2,620.00 − 10 % = 2,358.00 → net 2,417.97, VAT 19 % 459.41, gross 2,877.38
    await waitFor(() => expect(totalsText()).toContain('€2,417.97'));
    expect(totalsText()).toContain('€459.41');
    expect(screen.getByTestId('sticky-gross')).toHaveTextContent('€2,877.38');
    expect(totalsText()).toMatch(/Live preview/);
  });

  it('renders the invoice list and statuses in English', async () => {
    localStorage.setItem(LOCALE_KEY, 'en');
    db.users.find((u) => u.id === DEMO_IDS.userId)!.language = 'en';
    signInAs();
    renderApp('/rechnungen');
    await findHeading('Invoices');
    expect(document.title).toBe('Invoices · AngebotPilot');
    expect(await screen.findAllByText(/^(Paid|Open|Overdue|Draft|Partially paid)/)).not.toHaveLength(0);
    expect(screen.queryByText('Rechnungen')).not.toBeInTheDocument();
  });
});
