import type { QuotationStatus } from '@angebotpilot/api-contracts';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { availableActions } from '@/features/quotation-detail/actions';
import QuotationDetailScreen from '@/features/quotation-detail/QuotationDetailScreen';
import { restoreSession } from '@/lib/session';

import { mockApi } from './helpers/api';
import { auth, c, job, quotation, QUOTATION_ID } from './helpers/fixtures';
import { renderScreen, resetAll } from './helpers/render';

const names = (status: QuotationStatus, extra: Parameters<typeof quotation>[1] = {}) => {
  const { primary, more } = availableActions(quotation(status, extra));
  return { primary: primary.map((a) => a.action), more: more.map((a) => a.action) };
};

describe('actions by status (from allowedTransitions)', () => {
  it('Draft: send + edit, delete, no public link', () => {
    expect(names('Draft')).toEqual({ primary: ['send', 'edit'], more: ['pdf', 'duplicate', 'cancel', 'delete'] });
  });
  it('Sent: record accept/reject, resend, revise, public link, cancel', () => {
    expect(names('Sent')).toEqual({ primary: ['accept', 'reject'], more: ['resend', 'revise', 'pdf', 'publicLink', 'duplicate', 'cancel'] });
  });
  it('Accepted: convert to job, or open the job once converted', () => {
    expect(names('Accepted').primary).toEqual(['convert']);
    expect(names('Accepted', { jobId: 'j-1' }).primary).toEqual(['openJob']);
    expect(names('Accepted').more).not.toContain('cancel');
  });
  it('Expired: late acceptance + revision; Rejected: revision only', () => {
    expect(names('Expired').primary).toEqual(['accept']);
    expect(names('Expired').more).toContain('revise');
    expect(names('Rejected')).toEqual({ primary: [], more: ['revise', 'pdf', 'publicLink', 'duplicate'] });
  });
  it('Cancelled: only PDF and duplicate', () => {
    expect(names('Cancelled')).toEqual({ primary: [], more: ['pdf', 'duplicate'] });
  });
});

async function signedIn(routes: Record<string, unknown>) {
  const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  SecureStore.__store.set('angebotpilot.refreshToken', 'refresh-1');
  const mock = mockApi({
    'POST /auth/refresh': { body: auth() },
    [`GET ${c(`/quotations/${QUOTATION_ID}/events`)}`]: { body: [{ id: 'e1', type: 'EmailHandedOff', occurredAt: '2026-10-01T09:00:05Z', actorType: 'System', actorName: null, details: null }] },
    [`GET ${c(`/quotations/${QUOTATION_ID}/deliveries`)}`]: {
      body: [{ id: 'd1', kind: 'QuotationSent', toAddress: 'info@sonnenschein.example', subject: 'Angebot', status: 'HandedOff', attempts: 1, createdAt: '2026-10-01T09:00:00Z', handedOffAt: '2026-10-01T09:00:05Z', nextAttemptAt: null, lastError: null }],
    },
    [`GET ${c(`/quotations/${QUOTATION_ID}/follow-ups`)}`]: { body: [] },
    ...routes,
  } as never);
  await restoreSession();
  return mock;
}

beforeEach(() => resetAll());

describe('quotation detail', () => {
  it('shows status as text + icon, totals, line items and labels deliveries as "An Mailserver übergeben"', async () => {
    await signedIn({ [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Sent') } });
    renderScreen({ 'quotation/[id]': QuotationDetailScreen }, `/quotation/${QUOTATION_ID}`);
    expect(await screen.findByTestId('detail-gross')).toHaveTextContent('571,20 €');
    expect(screen.getAllByLabelText('Status: Versendet').length).toBeGreaterThan(0);
    expect(screen.getByText('LED-Panel 60×60')).toBeTruthy();
    expect(screen.getByText('USt. 19 % auf 480,00 €')).toBeTruthy();
    expect(await screen.findByLabelText('Status: An Mailserver übergeben')).toBeTruthy();
    expect(screen.getByText('E-Mail an Mailserver übergeben')).toBeTruthy();
    expect(screen.queryByText(/zugestellt/i)).toBeNull();
    expect(screen.getByTestId('action-accept')).toBeTruthy();
    expect(screen.getByTestId('action-reject')).toBeTruthy();
    expect(screen.queryByTestId('action-edit')).toBeNull();
  });

  it('records a phone acceptance with note', async () => {
    let current = quotation('Sent');
    const mock = await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: () => ({ body: current }),
      [`POST ${c(`/quotations/${QUOTATION_ID}/accept`)}`]: () => {
        current = quotation('Accepted', { decidedAt: '2026-10-12T10:00:00Z', decidedByActor: 'User' });
        return { body: current };
      },
    });
    renderScreen({ 'quotation/[id]': QuotationDetailScreen }, `/quotation/${QUOTATION_ID}`);
    fireEvent.press(await screen.findByTestId('action-accept'));
    fireEvent.changeText(await screen.findByTestId('decision-note'), 'Telefonisch zugesagt');
    fireEvent.press(screen.getByTestId('decision-submit'));
    await waitFor(() => expect(mock.callsTo(`POST ${c(`/quotations/${QUOTATION_ID}/accept`)}`)[0]?.body).toEqual({ note: 'Telefonisch zugesagt' }));
    expect(await screen.findByTestId('action-convert')).toBeTruthy();
  });

  it('sends a draft by e-mail with the customer address prefilled', async () => {
    let current = quotation('Draft');
    const mock = await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: () => ({ body: current }),
      [`POST ${c(`/quotations/${QUOTATION_ID}/send`)}`]: () => {
        current = quotation('Sent');
        return { body: { quotation: current, publicUrl: null, emailDeliveryId: 'd1' } };
      },
    });
    renderScreen({ 'quotation/[id]': QuotationDetailScreen }, `/quotation/${QUOTATION_ID}`);
    fireEvent.press(await screen.findByTestId('action-send'));
    expect(await screen.findByTestId('send-recipient')).toHaveProp('value', 'info@sonnenschein.example');
    fireEvent.press(screen.getByTestId('send-submit'));
    await waitFor(() => expect(mock.callsTo(`POST ${c(`/quotations/${QUOTATION_ID}/send`)}`)).toHaveLength(1));
    expect(mock.callsTo(`POST ${c(`/quotations/${QUOTATION_ID}/send`)}`)[0]!.body).toMatchObject({
      mode: 'Email', recipientEmail: 'info@sonnenschein.example', includePublicLink: true, scheduleFollowUps: true, attachPdf: true,
    });
    expect(await screen.findByTestId('action-accept')).toBeTruthy();
  });

  it('converts an accepted quotation into a job and opens it', async () => {
    const mock = await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Accepted') },
      [`POST ${c(`/quotations/${QUOTATION_ID}/convert-to-job`)}`]: { status: 201, body: job },
    });
    const router = renderScreen({ 'quotation/[id]': QuotationDetailScreen, 'job/[id]': () => null }, `/quotation/${QUOTATION_ID}`);
    fireEvent.press(await screen.findByTestId('action-convert'));
    fireEvent.press(await screen.findByTestId('convert-submit'));
    await waitFor(() => expect(router.getPathname()).toBe('/job/j-1'));
    expect(mock.callsTo(`POST ${c(`/quotations/${QUOTATION_ID}/convert-to-job`)}`)[0]!.body).toMatchObject({ title: 'Beleuchtung Verkaufsraum', dueDate: null });
  });

  it('shows API errors of actions instead of failing silently', async () => {
    await signedIn({
      [`GET ${c(`/quotations/${QUOTATION_ID}`)}`]: { body: quotation('Draft') },
      [`POST ${c(`/quotations/${QUOTATION_ID}/duplicate`)}`]: { status: 402, body: { status: 402, detail: 'Ihr Testzeitraum ist abgelaufen.' } },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderScreen({ 'quotation/[id]': QuotationDetailScreen }, `/quotation/${QUOTATION_ID}`);
    fireEvent.press(await screen.findByTestId('quotation-more'));
    jest.useFakeTimers();
    fireEvent.press(await screen.findByTestId('option-duplicate'));
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Aktion fehlgeschlagen', 'Ihr Testzeitraum ist abgelaufen.'));
    alert.mockRestore();
  });
});
