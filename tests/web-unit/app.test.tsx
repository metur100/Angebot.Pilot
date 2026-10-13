import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { db, DEMO_IDS, DEMO_PUBLIC_TOKEN } from '@/mocks/db';
import { server } from './server';
import { API, findHeading, renderApp, signInAs } from './utils';

const totalsText = () => (screen.getByTestId('totals-panel').textContent ?? '').replace(/\s+/g, ' ');

describe('quotation editor', () => {
  it('calculates totals live with German input and shows server totals after saving', async () => {
    const user = userEvent.setup();
    signInAs();
    renderApp('/angebote/neu');
    await findHeading('Neues Angebot');

    // Customer combobox
    const combobox = await screen.findByRole('combobox', { name: /^Kunde/ });
    await user.type(combobox, 'Huber');
    await user.click(await screen.findByRole('option', { name: /Bäckerei Huber KG/ }, { timeout: 5000 }));
    await screen.findByText('Bäckerei Huber KG');
    await user.type(screen.getByLabelText(/^Betreff/), 'Ladenbeleuchtung');

    const fill = async (index: number, values: { title: string; qty: string; price: string; discount?: string; rate?: string }) => {
      const item = screen.getAllByTestId('line-item')[index]!;
      const scope = within(item);
      await user.type(scope.getByLabelText(/^Bezeichnung/), values.title);
      const qty = scope.getByLabelText('Menge');
      await user.clear(qty);
      await user.type(qty, values.qty);
      await user.type(scope.getByLabelText('Einzelpreis netto'), values.price);
      if (values.discount) {
        const discount = scope.getByLabelText('Rabatt');
        await user.clear(discount);
        await user.type(discount, values.discount);
      }
      if (values.rate) await user.selectOptions(scope.getByLabelText('USt.'), values.rate);
    };

    // Same figures as the contracts' calculator test (mirrors the server calculator).
    await fill(0, { title: 'LED-Spot', qty: '3', price: '19,99' });
    await user.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await fill(1, { title: 'Montage', qty: '2,5', price: '48', discount: '10' });
    await user.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await fill(2, { title: 'Fachbuch', qty: '1', price: '12,35', rate: '7' });

    await waitFor(() => expect(totalsText()).toContain('192,32 €'));
    const totals = totalsText();
    expect(totals).toContain('− 12,00 €');
    expect(totals).toContain('180,32 €');
    expect(totals).toContain('31,91 €');
    expect(totals).toContain('0,86 €');
    expect(totals).toContain('213,09 €');
    expect(screen.getByTestId('sticky-gross')).toHaveTextContent('213,09 €');
    expect(totals).toMatch(/Live-Vorschau/);

    await user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));
    await findHeading(/Angebot AN-\d{4}-\d{4} bearbeiten/);
    await waitFor(() => expect(totalsText()).toMatch(/vom Server berechnet/));
    expect(totalsText()).toContain('213,09 €');
    expect(window.location.hash).toMatch(/#\/angebote\/[0-9a-f-]+\/bearbeiten/);
  });

  it('shows inline validation errors and blocks saving', async () => {
    const user = userEvent.setup();
    signInAs();
    renderApp('/angebote/neu');
    await findHeading('Neues Angebot');
    await user.click(await screen.findByRole('button', { name: /Entwurf speichern/ }));
    expect(await screen.findByText('Bitte Kunden auswählen.')).toBeInTheDocument();
    expect(screen.getByText('Bitte Betreff angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte Bezeichnung angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte Preis angeben.')).toBeInTheDocument();
  });

  it('maps server field errors to the line item fields', async () => {
    const user = userEvent.setup();
    const draft = db.quotations.find((q) => q.companyId === DEMO_IDS.companyId && q.status === 'Draft')!;
    server.use(
      http.put(`${API}/companies/:companyId/quotations/:id`, () =>
        HttpResponse.json(
          { status: 400, title: 'Bad Request', code: 'validation_failed', detail: 'Bitte prüfen Sie Ihre Eingaben.', errors: { 'lineItems[0].unitPriceNet': ['Preis ist zu hoch.'] } },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    signInAs();
    renderApp(`/angebote/${draft.id}/bearbeiten`);
    await findHeading(`Angebot ${draft.number} bearbeiten`);
    await user.type(screen.getByLabelText(/^Betreff/), ' X');
    await user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));
    const firstItem = screen.getAllByTestId('line-item')[0]!;
    expect(await within(firstItem).findByText('Preis ist zu hoch.')).toBeInTheDocument();
  });

  it('offers to reload when the draft was changed concurrently (409)', async () => {
    const user = userEvent.setup();
    const draft = db.quotations.find((q) => q.companyId === DEMO_IDS.companyId && q.status === 'Draft')!;
    server.use(
      http.put(`${API}/companies/:companyId/quotations/:id`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict', code: 'concurrency_conflict' }, { status: 409 }),
      ),
    );
    signInAs();
    renderApp(`/angebote/${draft.id}/bearbeiten`);
    await findHeading(`Angebot ${draft.number} bearbeiten`);
    await user.type(screen.getByLabelText(/^Betreff/), ' geändert');
    await user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Das Angebot wurde zwischenzeitlich geändert' });
    await user.click(within(dialog).getByRole('button', { name: 'Aktuelle Fassung laden' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText(/^Betreff/)).toHaveValue(draft.title);
  });
});

describe('API failure handling', () => {
  it('shows the offline banner and an error state with retry on network errors', async () => {
    signInAs();
    server.use(http.get(`${API}/companies/:companyId/customers`, () => HttpResponse.error()));
    renderApp('/kunden');
    await findHeading('Kunden');
    expect((await screen.findAllByText(/Keine Verbindung zum Server/, undefined, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Erneut versuchen' }).length).toBeGreaterThan(0);
  });

  it('explains missing permissions (403) instead of crashing', async () => {
    signInAs();
    server.use(
      http.get(`${API}/companies/:companyId/customers`, () =>
        HttpResponse.json({ status: 403, title: 'Forbidden', code: 'forbidden', detail: 'Für diese Aktion fehlt Ihnen die Berechtigung.' }, { status: 403 }),
      ),
    );
    renderApp('/kunden');
    expect(await screen.findByText('Für diese Aktion fehlt Ihnen die Berechtigung.', undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  it('shows a friendly message for plan limits (402) when creating a quotation', async () => {
    const user = userEvent.setup();
    signInAs();
    server.use(
      http.post(`${API}/companies/:companyId/quotations`, () =>
        HttpResponse.json({ status: 402, title: 'Payment Required', code: 'quotation_limit' }, { status: 402 }),
      ),
    );
    renderApp('/angebote/neu');
    await findHeading('Neues Angebot');
    await user.type(await screen.findByRole('combobox', { name: /^Kunde/ }), 'Huber');
    await user.click(await screen.findByRole('option', { name: /Bäckerei Huber KG/ }, { timeout: 5000 }));
    await user.type(screen.getByLabelText(/^Betreff/), 'Test');
    const item = within(screen.getAllByTestId('line-item')[0]!);
    await user.type(item.getByLabelText(/^Bezeichnung/), 'Montage');
    await user.type(item.getByLabelText('Einzelpreis netto'), '50');
    await user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));
    expect(await screen.findByText(/Angebotskontingent Ihres Tarifs ist ausgeschöpft/)).toBeInTheDocument();
  });
});

describe('role-based visibility', () => {
  it('disables admin-only actions for employees and explains why', async () => {
    signInAs(DEMO_IDS.employeeUserId);
    renderApp('/kunden');
    await findHeading('Kunden');
    expect(screen.getByRole('button', { name: /CSV exportieren/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Warum ist diese Aktion nicht verfügbar?' })).toBeInTheDocument();
  });

  it('enables CSV export and team management for owners', async () => {
    signInAs(DEMO_IDS.userId);
    renderApp('/kunden');
    await findHeading('Kunden');
    expect(screen.getByRole('button', { name: /CSV exportieren/ })).toBeEnabled();
  });

  it('shows the team page read-only for employees', async () => {
    signInAs(DEMO_IDS.employeeUserId);
    renderApp('/team');
    await findHeading('Team');
    expect(screen.getByText('Nur Lesezugriff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mitglied einladen/ })).toBeDisabled();
  });
});

describe('public customer page', () => {
  it('accepts a quotation with name and binding confirmation', async () => {
    const user = userEvent.setup();
    renderApp(`/q/${DEMO_PUBLIC_TOKEN}`);
    await user.click(await screen.findByRole('button', { name: /Angebot annehmen/ }, { timeout: 8000 }));
    const dialog = await screen.findByRole('dialog', { name: 'Angebot verbindlich annehmen' });
    await user.click(within(dialog).getByRole('button', { name: 'Jetzt verbindlich annehmen' }));
    expect(within(dialog).getByText('Bitte geben Sie Ihren vollständigen Namen an.')).toBeInTheDocument();
    expect(within(dialog).getByText('Bitte bestätigen Sie die verbindliche Annahme.')).toBeInTheDocument();
    expect(within(dialog).getByText(/keine qualifizierte elektronische Signatur/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Ihr vollständiger Name/), 'Thomas Wagner');
    await user.click(within(dialog).getByLabelText(/Ich nehme dieses Angebot verbindlich an/));
    await user.click(within(dialog).getByRole('button', { name: 'Jetzt verbindlich annehmen' }));
    expect(await screen.findByRole('heading', { name: /Ihre Annahme ist eingegangen/ })).toBeInTheDocument();
    expect(window.location.hash).toContain('/bestaetigt');
    const quotation = db.quotations.find((q) => q.publicToken === DEMO_PUBLIC_TOKEN)!;
    expect(quotation.status).toBe('Accepted');
    expect(quotation.decisionName).toBe('Thomas Wagner');
  });

  it('rejects a quotation with an optional reason', async () => {
    const user = userEvent.setup();
    renderApp(`/q/${DEMO_PUBLIC_TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Ablehnen' }, { timeout: 8000 }));
    const dialog = await screen.findByRole('dialog', { name: 'Angebot ablehnen' });
    await user.type(within(dialog).getByLabelText(/Grund/), 'Zu teuer');
    await user.click(within(dialog).getByRole('button', { name: 'Angebot ablehnen' }));
    expect(await screen.findByRole('heading', { name: 'Ihre Ablehnung wurde übermittelt' })).toBeInTheDocument();
  });

  it('disables decisions for already decided quotations', async () => {
    const quotation = db.quotations.find((q) => q.publicToken === DEMO_PUBLIC_TOKEN)!;
    quotation.status = 'Accepted';
    quotation.decidedAt = new Date().toISOString();
    renderApp(`/q/${DEMO_PUBLIC_TOKEN}`);
    expect(await screen.findByText('Angebot angenommen', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Angebot annehmen/ })).not.toBeInTheDocument();
  });

  it('asks before opting out of reminders (never automatically)', async () => {
    const user = userEvent.setup();
    let optOutCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/opt-out')) optOutCalls++;
    });
    renderApp(`/q/${DEMO_PUBLIC_TOKEN}?abmelden=1`);
    expect(await screen.findByText('Keine weiteren Erinnerungen zu diesem Angebot erhalten?', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(optOutCalls).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Ja, keine Erinnerungen mehr' }));
    expect(await screen.findByText('Sie erhalten keine Erinnerungen mehr zu diesem Angebot')).toBeInTheDocument();
    expect(optOutCalls).toBe(1);
    server.events.removeAllListeners();
  });

  it('shows a friendly page for invalid links', async () => {
    renderApp('/q/unbekannter-token-000000000000000');
    expect(await screen.findByRole('heading', { name: 'Link ungültig' }, { timeout: 8000 })).toBeInTheDocument();
  });
});
