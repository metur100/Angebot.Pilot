import { addDaysIso, todayIso } from '@angebotpilot/api-contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { buildInvoiceQuery, invoiceListDefaults, toggleInvoiceStatus } from '@/features/invoices/InvoiceListPage';
import { dueDateFollowsIssueDate } from '@/features/invoices/schema';
import { db, DEMO_IDS } from '@/mocks/db';
import { server } from './server';
import { API, findHeading, renderApp, signInAs } from './utils';

const seeded = (title: string) => {
  const invoice = db.invoices.find((i) => i.title === title);
  if (!invoice) throw new Error(`Seeded invoice "${title}" not found`);
  return invoice;
};
const OVERDUE = 'Notdienst-Einsatz Störungsbeseitigung Küche';
const PAID = 'Reparatur Notbeleuchtung Wartezimmer';
const OPEN = 'Wartung Schaltanlagen Abfüllhalle';
const DRAFT = 'Elektroinstallation Backstube – neue Ofenzuleitungen';

const totalsText = () => (screen.getByTestId('totals-panel').textContent ?? '').replace(/\s+/g, ' ');

describe('invoice list query', () => {
  it('maps the URL state to the API query (overdue chip → overdue=true)', () => {
    expect(buildInvoiceQuery({ ...invoiceListDefaults, ueberfaellig: '1', status: 'Issued,PartiallyPaid,Bogus', q: ' RE-2026 ' })).toEqual({
      search: 'RE-2026',
      status: ['Issued', 'PartiallyPaid'],
      overdue: true,
      sort: '-updatedAt',
      page: 1,
      pageSize: 20,
    });
    expect(buildInvoiceQuery(invoiceListDefaults).overdue).toBeUndefined();
    expect(toggleInvoiceStatus('Paid', 'Draft')).toBe('Draft,Paid');
    expect(toggleInvoiceStatus('Draft,Paid', 'Draft')).toBe('Paid');
  });

  it('detects whether the due date still follows the issue date', () => {
    expect(dueDateFollowsIssueDate('2026-10-01', '2026-10-15', 14)).toBe(true);
    expect(dueDateFollowsIssueDate('2026-10-01', '2026-10-31', 14)).toBe(false);
  });
});

describe('invoice list page', () => {
  it('renders the seeded invoices and filters overdue ones via the chip', async () => {
    const user = userEvent.setup();
    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (/\/invoices(\?|$)/.test(request.url)) requested.push(request.url);
    });
    signInAs();
    renderApp('/rechnungen');
    await findHeading('Rechnungen');
    expect((await screen.findAllByText(OVERDUE)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(PAID).length).toBeGreaterThan(0);
    expect(screen.getAllByText(OPEN).length).toBeGreaterThan(0);
    // Drafts have no number yet.
    expect(screen.getAllByRole('link', { name: 'Entwurf' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Teilweise bezahlt · überfällig').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Überfällig' }));
    await waitFor(() => expect(screen.queryAllByText(PAID)).toHaveLength(0));
    expect(screen.getAllByText(OVERDUE).length).toBeGreaterThan(0);
    expect(window.location.hash).toContain('ueberfaellig=1');
    expect(requested.some((url) => url.includes('overdue=true'))).toBe(true);
    server.events.removeAllListeners();
  });
});

describe('invoice editor', () => {
  it('keeps the due date in sync with the issue date until it is edited and shows live totals', async () => {
    const user = userEvent.setup();
    signInAs();
    renderApp(`/rechnungen/neu?kunde=${seeded(OPEN).customerId}`);
    await findHeading('Neue Rechnung');
    const today = todayIso();
    const issue = screen.getByLabelText(/^Rechnungsdatum/);
    const due = screen.getByLabelText(/^Fällig am/);
    expect(issue).toHaveValue(today);
    expect(due).toHaveValue(addDaysIso(today, 14));
    expect(screen.getByText('Zahlungsziel: 14 Tage')).toBeInTheDocument();

    fireEvent.change(issue, { target: { value: '2026-03-02' } });
    expect(due).toHaveValue('2026-03-16');

    fireEvent.change(due, { target: { value: '2026-03-31' } });
    fireEvent.change(issue, { target: { value: '2026-03-03' } });
    expect(due).toHaveValue('2026-03-31');
    expect(screen.getByText(/Zahlungsziel: 28 Tage \(Standard: 14 Tage\)/)).toBeInTheDocument();

    // Service period toggle shows "von – bis".
    await user.click(screen.getByLabelText('Leistungszeitraum angeben'));
    expect(screen.getByLabelText(/^Leistung von/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Leistung bis/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Betreff/), 'Wartung Q1');
    const item = within(screen.getAllByTestId('line-item')[0]!);
    await user.type(item.getByLabelText(/^Bezeichnung/), 'Wartung');
    const qty = item.getByLabelText('Menge');
    await user.clear(qty);
    await user.type(qty, '2,5');
    await user.type(item.getByLabelText('Einzelpreis netto'), '48');
    await waitFor(() => expect(totalsText()).toContain('120,00 €'));
    expect(totalsText()).toContain('22,80 €');
    expect(screen.getByTestId('sticky-gross')).toHaveTextContent('142,80 €');

    // Period end is required once the toggle is on.
    await user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));
    expect(await screen.findByText('Bitte Ende des Leistungszeitraums angeben.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Leistung von/), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText(/^Leistung bis/), { target: { value: '2026-03-03' } });
    await user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));
    await findHeading('Rechnungsentwurf bearbeiten');
    await waitFor(() => expect(totalsText()).toMatch(/vom Server berechnet/));
    const saved = db.invoices.find((i) => i.title === 'Wartung Q1')!;
    expect(saved.number).toBeNull();
    expect(saved.status).toBe('Draft');
    expect(saved.dueDate).toBe('2026-03-31');
    expect(saved.serviceDateTo).toBe('2026-03-03');
  });

  it('offers "Speichern & Rechnung stellen" only to owners and admins', async () => {
    signInAs(DEMO_IDS.employeeUserId);
    renderApp(`/rechnungen/${seeded(DRAFT).id}/bearbeiten`);
    await findHeading('Rechnungsentwurf bearbeiten');
    expect(screen.getByRole('button', { name: /Entwurf speichern/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechnung stellen/ })).not.toBeInTheDocument();
  });
});

describe('invoice detail', () => {
  it('shows draft actions for a draft', async () => {
    signInAs();
    renderApp(`/rechnungen/${seeded(DRAFT).id}`);
    await findHeading('Rechnungsentwurf');
    expect(screen.getByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PDF-Vorschau' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechnung stellen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Zahlung erfassen/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AU-\d{4}-\d{4}/ })).toBeInTheDocument();
  });

  it('shows payment and follow-up actions for an issued invoice', async () => {
    const user = userEvent.setup();
    const open = seeded(OPEN);
    signInAs();
    renderApp(`/rechnungen/${open.id}`);
    await findHeading(open.number!);
    expect(screen.getByRole('button', { name: /Zahlung erfassen/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechnung stellen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /E-Rechnung \(XML\) herunterladen/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Zahlungserinnerung senden/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Kopieren/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Stornieren/ })).toBeInTheDocument();
  });

  it('hides "Rechnung stellen" and financial actions from employees', async () => {
    signInAs(DEMO_IDS.employeeUserId);
    renderApp(`/rechnungen/${seeded(DRAFT).id}`);
    await findHeading('Rechnungsentwurf');
    expect(screen.getByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechnung stellen' })).not.toBeInTheDocument();
  });

  it('hides payment actions of issued invoices from employees', async () => {
    const open = seeded(OPEN);
    signInAs(DEMO_IDS.employeeUserId);
    renderApp(`/rechnungen/${open.id}`);
    await findHeading(open.number!);
    expect(screen.getByRole('link', { name: 'PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Zahlung erfassen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Senden/ })).not.toBeInTheDocument();
  });

  it('shows the overdue alert with the open amount', async () => {
    const overdue = seeded(OVERDUE);
    signInAs();
    renderApp(`/rechnungen/${overdue.id}`);
    await findHeading(overdue.number!);
    expect(screen.getByText(/^Seit \d+ Tagen überfällig – offen: 522,25 €$/)).toBeInTheDocument();
  });

  it('lists missing information and blocks issuing while it is incomplete', async () => {
    const user = userEvent.setup();
    const draft = seeded(DRAFT);
    draft.serviceDateFrom = null;
    signInAs();
    renderApp(`/rechnungen/${draft.id}`);
    await findHeading('Rechnungsentwurf');
    expect(screen.getByText('Vor dem Stellen noch zu erledigen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rechnung stellen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechnung stellen?' });
    expect(within(dialog).getByText(/Leistungsdatum bzw. den Leistungszeitraum/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Entwurf bearbeiten/ })).toHaveAttribute('href', `#/rechnungen/${draft.id}/bearbeiten`);
    expect(within(dialog).getByRole('button', { name: 'Jetzt Rechnung stellen' })).toBeDisabled();
  });

  it('issues a draft and assigns the next invoice number', async () => {
    const user = userEvent.setup();
    const draft = seeded(DRAFT);
    signInAs();
    renderApp(`/rechnungen/${draft.id}`);
    await findHeading('Rechnungsentwurf');
    await user.click(screen.getByRole('button', { name: 'Rechnung stellen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechnung stellen?' });
    expect(within(dialog).getByText(/festgeschrieben \(GoBD\)/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Jetzt Rechnung stellen' }));
    await waitFor(() => expect(draft.number).toMatch(/^RE-\d{4}-\d{4}$/));
    await findHeading(draft.number!);
    expect(draft.status).toBe('Issued');
    const year = draft.issueDate.slice(0, 4);
    const sameYear = db.invoices.filter((i) => i.number?.startsWith(`RE-${year}-`)).length;
    expect(draft.number).toBe(`RE-${year}-${String(sameYear).padStart(4, '0')}`);
    expect(screen.getByRole('button', { name: /Senden …/ })).toBeInTheDocument();
  });

  it('opens the issue dialog after "Speichern & Rechnung stellen" (?stellen=1)', async () => {
    signInAs();
    renderApp(`/rechnungen/${seeded(DRAFT).id}?stellen=1`);
    expect(await screen.findByRole('dialog', { name: 'Rechnung stellen?' }, { timeout: 15000 })).toBeInTheDocument();
  });

  it('records a full payment and marks the invoice as paid', async () => {
    const user = userEvent.setup();
    const open = seeded(OPEN);
    signInAs();
    renderApp(`/rechnungen/${open.id}`);
    await findHeading(open.number!);
    await user.click(screen.getByRole('button', { name: /Zahlung erfassen/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Zahlung erfassen' });
    expect(within(dialog).getByLabelText(/^Zahlungsdatum/)).toHaveValue(todayIso());
    expect(within(dialog).getByText(/Entspricht dem offenen Betrag/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Zahlung speichern' }));
    await waitFor(() => expect(open.status).toBe('Paid'));
    expect(await screen.findByText(/^Bezahlt am /)).toBeInTheDocument();
    expect(screen.getAllByText('Bezahlt').length).toBeGreaterThan(0);
    expect(screen.getByTestId('open-amount')).toHaveTextContent('0,00 €');
  });

  it('rejects payments above the open amount', async () => {
    const user = userEvent.setup();
    const overdue = seeded(OVERDUE);
    signInAs();
    renderApp(`/rechnungen/${overdue.id}`);
    await findHeading(overdue.number!);
    await user.click(screen.getByRole('button', { name: /Zahlung erfassen/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Zahlung erfassen' });
    const amount = within(dialog).getByLabelText(/^Betrag/);
    await user.clear(amount);
    await user.type(amount, '9999');
    expect(within(dialog).getByText(/übersteigt den offenen Betrag von 522,25 €/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Zahlung speichern' }));
    expect(overdue.status).toBe('PartiallyPaid');
  });

  it('cancels an invoice with a cancellation invoice and links to it', async () => {
    const user = userEvent.setup();
    const paid = seeded(PAID);
    signInAs();
    renderApp(`/rechnungen/${paid.id}`);
    await findHeading(paid.number!);
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen' }));
    await user.click(await screen.findByRole('menuitem', { name: /Stornieren/ }));
    const dialog = await screen.findByRole('dialog', { name: `Rechnung ${paid.number!} stornieren?` });
    expect(within(dialog).getByText(/bereits 455,77 € gezahlt/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Grund/), 'Doppelt berechnet');
    await user.click(within(dialog).getByRole('button', { name: 'Stornorechnung erstellen' }));

    await waitFor(() => expect(paid.status).toBe('Cancelled'));
    const storno = db.invoices.find((i) => i.cancelledInvoiceId === paid.id)!;
    expect(storno.kind).toBe('Cancellation');
    expect(storno.number).toMatch(/^RE-\d{4}-\d{4}$/);
    const link = await screen.findByRole('link', { name: storno.number! });
    expect(screen.getByText(/^Storniert am/)).toBeInTheDocument();

    await user.click(link);
    await findHeading(storno.number!);
    expect(screen.getAllByText('Stornorechnung').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: paid.number! })).toBeInTheDocument();
    expect(screen.getByTestId('totals-gross')).toHaveTextContent('− 455,77 €');
  });
});

describe('invoice list filter semantics (mock API)', () => {
  it('lists cancellation invoices only when the filter contains "Cancelled"', async () => {
    const user = userEvent.setup();
    const paid = seeded(PAID);
    signInAs();
    renderApp(`/rechnungen/${paid.id}`);
    await findHeading(paid.number!);
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen' }));
    await user.click(await screen.findByRole('menuitem', { name: /Stornieren/ }));
    await user.click(await screen.findByRole('button', { name: 'Stornorechnung erstellen' }));
    await waitFor(() => expect(paid.status).toBe('Cancelled'));
    const storno = db.invoices.find((i) => i.cancelledInvoiceId === paid.id)!;
    expect(storno.status).toBe('Issued');

    const list = async (status: string) => {
      const response = await fetch(`${API}/companies/${DEMO_IDS.companyId}/invoices?status=${status}&pageSize=100`, {
        headers: { Authorization: `Bearer mock-access.${DEMO_IDS.userId}.test` },
      });
      return ((await response.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    };
    const open = await list('Issued,PartiallyPaid');
    expect(open).not.toContain(storno.id);
    expect(open).toContain(seeded(OPEN).id);
    const cancelled = await list('Cancelled');
    expect(cancelled).toEqual(expect.arrayContaining([paid.id, storno.id]));
  });
});

describe('invoices elsewhere in the app', () => {
  it('creates an invoice draft from a job', async () => {
    const user = userEvent.setup();
    const job = db.jobs.find((j) => j.status === 'InProgress')!;
    signInAs();
    renderApp(`/auftraege/${job.id}`);
    await findHeading(new RegExp(job.title));
    await user.click(screen.getByRole('button', { name: 'Rechnung erstellen' }));
    await findHeading('Rechnungsentwurf bearbeiten');
    const created = db.invoices.find((i) => i.jobId === job.id)!;
    expect(created.status).toBe('Draft');
    expect(created.lineItems.length).toBeGreaterThan(0);
    expect(window.location.hash).toBe(`#/rechnungen/${created.id}/bearbeiten`);
  });

  it('emphasises invoicing on a completed job and lists its invoices', async () => {
    const job = db.jobs.find((j) => j.status === 'Completed')!;
    db.invoices = db.invoices.filter((i) => i.jobId !== job.id);
    signInAs();
    renderApp(`/auftraege/${job.id}`);
    await findHeading(new RegExp(job.title));
    expect(screen.getByText('Bereit zur Abrechnung')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Rechnung zu diesem Auftrag.')).toBeInTheDocument();
  });

  it('shows invoice KPIs and overdue invoices on the dashboard', async () => {
    signInAs();
    renderApp('/dashboard');
    expect(await screen.findByText('Offene Rechnungen', undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Überfällig/ })).toHaveAttribute('href', '#/rechnungen?ueberfaellig=1');
    const card = screen.getByRole('heading', { name: 'Überfällige Rechnungen' }).closest('div.rounded-lg') as HTMLElement;
    expect(within(card).getByText('Gasthof Zur Post')).toBeInTheDocument();
  });

  it('lists the invoices of a customer with a "Neue Rechnung" link', async () => {
    const overdue = seeded(OVERDUE);
    signInAs();
    renderApp(`/kunden/${overdue.customerId}`);
    await findHeading('Gasthof Zur Post');
    expect(await screen.findByRole('link', { name: overdue.number! })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neue Rechnung' })).toHaveAttribute('href', `#/rechnungen/neu?kunde=${overdue.customerId}`);
  });
});
