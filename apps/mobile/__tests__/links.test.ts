import { ApiError, NetworkError } from '@angebotpilot/api-contracts';

import { redirectSystemPath } from '@/app/+native-intent';
import { resolveScan } from '@/features/scanner/resolveScan';
import { publicQuotationPath, tokenFromInput } from '@/lib/links';

import { COMPANY_ID, TOKEN } from './helpers/fixtures';

describe('deep links and QR payloads', () => {
  it.each([
    [`angebotpilot://q/${TOKEN}`, `/q/${TOKEN}`],
    [`https://metur100.github.io/Angebot.Pilot.App/#/q/${TOKEN}`, `/q/${TOKEN}`],
    [`https://angebotpilot.runasp.net/q/${TOKEN}?utm=qr`, `/q/${TOKEN}`],
    [TOKEN, `/q/${TOKEN}`],
    [`  ${TOKEN}\n`, `/q/${TOKEN}`],
  ])('%s → %s', (input, expected) => {
    expect(publicQuotationPath(input)).toBe(expected);
  });

  it.each(['', 'https://example.com/', 'angebotpilot://q/short', 'WIFI:S:Gast;T:WPA;P:geheim;;', 'https://evil.example/q/<script>'])(
    'rejects %p',
    (input) => {
      expect(tokenFromInput(input)).toBeNull();
    },
  );

  it('rewrites incoming system links to the public quotation route and leaves others untouched', () => {
    expect(redirectSystemPath({ path: `angebotpilot://q/${TOKEN}`, initial: true })).toBe(`/q/${TOKEN}`);
    expect(redirectSystemPath({ path: `https://metur100.github.io/Angebot.Pilot.App/#/q/${TOKEN}`, initial: false })).toBe(`/q/${TOKEN}`);
    expect(redirectSystemPath({ path: '/quotations', initial: false })).toBe('/quotations');
  });
});

describe('QR scan resolution', () => {
  const apiWith = (lookup: jest.Mock) => ({ quotations: { lookupByToken: lookup } }) as never;

  it('opens the internal detail for quotations of the current company', async () => {
    const lookup = jest.fn().mockResolvedValue({ quotationId: 'q-42' });
    await expect(resolveScan(apiWith(lookup), COMPANY_ID, `https://metur100.github.io/Angebot.Pilot.App/#/q/${TOKEN}`)).resolves.toEqual({
      kind: 'internal',
      path: '/quotation/q-42',
    });
    expect(lookup).toHaveBeenCalledWith(COMPANY_ID, { token: TOKEN });
  });

  it('falls back to the public screen for quotations of other companies (404)', async () => {
    const lookup = jest.fn().mockRejectedValue(new ApiError({ status: 404 }));
    await expect(resolveScan(apiWith(lookup), COMPANY_ID, TOKEN)).resolves.toEqual({ kind: 'public', path: `/q/${TOKEN}` });
  });

  it('reports foreign QR codes without calling the API', async () => {
    const lookup = jest.fn();
    await expect(resolveScan(apiWith(lookup), COMPANY_ID, 'https://example.com')).resolves.toEqual({ kind: 'invalid' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('propagates network failures so the scanner can show them', async () => {
    const lookup = jest.fn().mockRejectedValue(new NetworkError());
    await expect(resolveScan(apiWith(lookup), COMPANY_ID, TOKEN)).rejects.toBeInstanceOf(NetworkError);
  });
});
