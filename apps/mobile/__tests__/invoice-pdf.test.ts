import { PdfError, shareInvoicePdf, shareInvoiceXml } from '@/lib/pdf';
import { login } from '@/lib/session';

import { BASE, mockApi } from './helpers/api';
import { auth, COMPANY_ID, INVOICE_ID } from './helpers/fixtures';
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

describe('invoice documents', () => {
  it('shares the invoice PDF with the bearer token', async () => {
    await shareInvoicePdf(COMPANY_ID, INVOICE_ID, 'Rechnung_RE-2026-0001');
    const [url, dest, options] = FileSystem.File.downloadFileAsync.mock.calls[0]!;
    expect(url).toBe(`${BASE}/companies/${COMPANY_ID}/invoices/${INVOICE_ID}/pdf`);
    expect((dest as { uri: string }).uri).toBe('file:///cache/Rechnung_RE-2026-0001.pdf');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer access-1', Accept: 'application/pdf' });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/Rechnung_RE-2026-0001.pdf', expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
  });

  it('shares the e-invoice XML as application/xml (UTI public.xml)', async () => {
    await shareInvoiceXml(COMPANY_ID, INVOICE_ID, 'Rechnung_RE-2026-0001');
    const [url, dest, options] = FileSystem.File.downloadFileAsync.mock.calls[0]!;
    expect(url).toBe(`${BASE}/companies/${COMPANY_ID}/invoices/${INVOICE_ID}/xml`);
    expect((dest as { uri: string }).uri).toBe('file:///cache/Rechnung_RE-2026-0001.xml');
    expect(options.headers).toMatchObject({ Accept: 'application/xml' });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/Rechnung_RE-2026-0001.xml', expect.objectContaining({ mimeType: 'application/xml', UTI: 'public.xml' }));
  });

  it('refreshes once on 401 and maps a missing XML to a German message', async () => {
    FileSystem.File.downloadFileAsync
      .mockRejectedValueOnce(new Error('UnableToDownload: response has status: 401'))
      .mockRejectedValueOnce(new Error('UnableToDownload: response has status: 404'));
    const promise = shareInvoiceXml(COMPANY_ID, INVOICE_ID, 'Rechnungsentwurf');
    await expect(promise).rejects.toBeInstanceOf(PdfError);
    await expect(promise).rejects.toThrow(/Die E-Rechnung \(XML\) wurde nicht gefunden/);
    expect(FileSystem.File.downloadFileAsync).toHaveBeenCalledTimes(2);
    expect(FileSystem.File.downloadFileAsync.mock.calls[1]![2].headers.Authorization).toBe('Bearer access-2');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
