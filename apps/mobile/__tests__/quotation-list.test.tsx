import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import QuotationsScreen from '@/app/(app)/(tabs)/quotations';
import { restoreSession } from '@/lib/session';

import { mockApi } from './helpers/api';
import { auth, c, page, quotationListItem } from './helpers/fixtures';
import { renderScreen, resetAll } from './helpers/render';

async function signedIn(routes: Record<string, unknown>) {
  const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  SecureStore.__store.set('angebotpilot.refreshToken', 'refresh-1');
  const mock = mockApi({ 'POST /auth/refresh': { body: auth() }, ...routes } as never);
  await restoreSession();
  return mock;
}

beforeEach(() => resetAll());

describe('quotation list', () => {
  it('renders quotations as cards with number, customer, status text and German amounts', async () => {
    await signedIn({ [`GET ${c('/quotations')}`]: { body: page([quotationListItem(1, 'Sent'), quotationListItem(2, 'Accepted')], 2) } });
    renderScreen({ quotations: QuotationsScreen, 'quotation/[id]': () => null }, '/quotations');
    expect(await screen.findByTestId('quotation-card-q-1')).toBeTruthy();
    expect(screen.getByText('AN-2026-001')).toBeTruthy();
    expect(screen.getByText('Elektroinstallation Halle 2')).toBeTruthy();
    expect(screen.getByLabelText('Status: Versendet')).toBeTruthy();
    expect(screen.getByLabelText('Status: Angenommen')).toBeTruthy();
    expect(screen.getByText('1.190,00 €')).toBeTruthy();
    expect(screen.getByText('2 Angebote')).toBeTruthy();
  });

  it('filters by status via chips and passes the filter to the API', async () => {
    const mock = await signedIn({ [`GET ${c('/quotations')}`]: (req: { query: URLSearchParams }) => ({
      body: page(req.query.get('status') === 'Draft' ? [quotationListItem(3, 'Draft')] : [quotationListItem(1)]),
    }) });
    renderScreen({ quotations: QuotationsScreen }, '/quotations');
    await screen.findByTestId('quotation-card-q-1');
    fireEvent.press(screen.getByTestId('chip-Draft'));
    expect(await screen.findByTestId('quotation-card-q-3')).toBeTruthy();
    const last = mock.callsTo(`GET ${c('/quotations')}`).at(-1)!;
    expect(last.query.get('status')).toBe('Draft');
    expect(last.query.get('sort')).toBe('-updatedAt');
  });

  it('applies a status passed from the dashboard (?status=Accepted)', async () => {
    const mock = await signedIn({ [`GET ${c('/quotations')}`]: { body: page([quotationListItem(2, 'Accepted')]) } });
    renderScreen({ quotations: QuotationsScreen }, '/quotations?status=Accepted');
    await screen.findByTestId('quotation-card-q-2');
    expect(mock.callsTo(`GET ${c('/quotations')}`)[0]!.query.get('status')).toBe('Accepted');
    expect(screen.getByLabelText('Filter Angenommen').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('loads the next page when scrolling to the end (infinite scroll)', async () => {
    const mock = await signedIn({ [`GET ${c('/quotations')}`]: (req: { query: URLSearchParams }) => {
      const p = Number(req.query.get('page'));
      return { body: page(p === 1 ? Array.from({ length: 20 }, (_, i) => quotationListItem(i + 1)) : [quotationListItem(99)], 21, p) };
    } });
    renderScreen({ quotations: QuotationsScreen }, '/quotations');
    await screen.findByTestId('quotation-card-q-1');
    fireEvent(screen.getByTestId('quotation-list'), 'endReached');
    await waitFor(() => expect(mock.callsTo(`GET ${c('/quotations')}`).some((r) => r.query.get('page') === '2')).toBe(true));
  });

  it('shows a guiding empty state for new companies', async () => {
    await signedIn({ [`GET ${c('/quotations')}`]: { body: page([]) } });
    renderScreen({ quotations: QuotationsScreen }, '/quotations');
    expect(await screen.findByText('Noch keine Angebote')).toBeTruthy();
    expect(screen.getByText('Angebot erstellen')).toBeTruthy();
  });

  it('shows the network error with a working retry', async () => {
    const mock = await signedIn({ [`GET ${c('/quotations')}`]: new TypeError('Network request failed') });
    renderScreen({ quotations: QuotationsScreen }, '/quotations');
    expect(await screen.findByText(/Keine Verbindung zum Server/, {}, { timeout: 15000 })).toBeTruthy();
    mock.on(`GET ${c('/quotations')}`, { body: page([quotationListItem(1)]) });
    fireEvent.press(screen.getByText('Erneut versuchen'));
    expect(await screen.findByTestId('quotation-card-q-1')).toBeTruthy();
  }, 30000);
});
