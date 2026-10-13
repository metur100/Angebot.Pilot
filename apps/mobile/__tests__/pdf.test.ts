import { PdfError, sharePublicPdf, shareQuotationPdf } from '@/lib/pdf';
import { login } from '@/lib/session';

import { BASE, mockApi } from './helpers/api';
import { auth, COMPANY_ID, QUOTATION_ID, TOKEN } from './helpers/fixtures';
import { resetAll } from './helpers/render';

const FileSystem = jest.requireMock('expo-file-system') as { File: { downloadFileAsync: jest.Mock } };
const Sharing = jest.requireMock('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };

beforeEach(async () => {
  resetAll();
  FileSystem.File.downloadFileAsync.mockReset().mockImplementation(async (_url: string, dest: unknown) => dest);
  Sharing.shareAsync.mockClear();
  Sharing.isAvailableAsync.mockResolvedValue(true);
  mockApi({ 'POST /auth/login': { body: auth() }, 'POST /auth/refresh': { body: auth({ accessToken: 'access-2' }) } });
  await login('anna@elektro-muster.de', 'Geheim12345');
});

describe('PDF download and share', () => {
  it('downloads the internal PDF with the bearer token into the cache and opens the share sheet', async () => {
    await shareQuotationPdf(COMPANY_ID, QUOTATION_ID, 'AN-2026-0007');
    const [url, dest, options] = FileSystem.File.downloadFileAsync.mock.calls[0]!;
    expect(url).toBe(`${BASE}/companies/${COMPANY_ID}/quotations/${QUOTATION_ID}/pdf`);
    expect((dest as { uri: string }).uri).toBe('file:///cache/Angebot_AN-2026-0007.pdf');
    expect(options).toMatchObject({ idempotent: true, headers: { Authorization: 'Bearer access-1', Accept: 'application/pdf', 'X-AngebotPilot-Client': 'mobile' } });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/Angebot_AN-2026-0007.pdf', expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
  });

  it('refreshes an expired access token once and retries', async () => {
    FileSystem.File.downloadFileAsync
      .mockRejectedValueOnce(new Error('UnableToDownload: response has status: 401'))
      .mockImplementationOnce(async (_u: string, d: unknown) => d);
    await shareQuotationPdf(COMPANY_ID, QUOTATION_ID, 'AN-2026-0007');
    expect(FileSystem.File.downloadFileAsync).toHaveBeenCalledTimes(2);
    expect(FileSystem.File.downloadFileAsync.mock.calls[1]![2].headers.Authorization).toBe('Bearer access-2');
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['UnableToDownload: response has status: 404', 'Das PDF wurde nicht gefunden.'],
    ['UnableToDownload: response has status: 500', 'Das PDF konnte auf dem Server nicht erzeugt werden. Bitte später erneut versuchen.'],
    ['java.net.UnknownHostException', 'Das PDF konnte nicht heruntergeladen werden. Bitte prüfen Sie Ihre Internetverbindung.'],
  ])('maps "%s" to a German message and does not open the share sheet', async (raw, message) => {
    FileSystem.File.downloadFileAsync.mockRejectedValue(new Error(raw));
    const promise = shareQuotationPdf(COMPANY_ID, QUOTATION_ID, 'AN-2026-0007');
    await expect(promise).rejects.toBeInstanceOf(PdfError);
    await expect(promise).rejects.toThrow(message);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('reports when sharing is unavailable on the device', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(false);
    await expect(shareQuotationPdf(COMPANY_ID, QUOTATION_ID, 'AN-1')).rejects.toThrow(/keine App zum Teilen oder Öffnen/);
  });

  it('downloads the public PDF without an Authorization header', async () => {
    await sharePublicPdf(TOKEN, 'AN-2026-0007');
    const [url, , options] = FileSystem.File.downloadFileAsync.mock.calls[0]!;
    expect(url).toBe(`${BASE}/public/quotations/${TOKEN}/pdf`);
    expect(options.headers.Authorization).toBeUndefined();
  });
});
