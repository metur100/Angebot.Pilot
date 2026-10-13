// Downloads documents (quotation/invoice PDFs, e-invoice XML) into the cache directory and opens the system share sheet
// ("Öffnen mit", Drucken, Mail, Drive, …). Internal documents need the bearer token, so they are fetched with the API
// client's auth headers.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { api, refreshSession } from './session';

export class PdfError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PdfError';
    this.cause = cause;
  }
}

interface DocumentKind {
  extension: string;
  mimeType: string;
  UTI: string;
  dialogTitle: string;
  messages: { unavailable: string; notFound: string; forbidden: string; server: string; network: string };
}

const PDF: DocumentKind = {
  extension: 'pdf',
  mimeType: 'application/pdf',
  UTI: 'com.adobe.pdf',
  dialogTitle: 'PDF öffnen oder teilen',
  messages: {
    unavailable: 'Auf diesem Gerät ist keine App zum Teilen oder Öffnen von PDF-Dateien verfügbar.',
    notFound: 'Das PDF wurde nicht gefunden.',
    forbidden: 'Für dieses PDF fehlt die Berechtigung. Bitte melden Sie sich erneut an.',
    server: 'Das PDF konnte auf dem Server nicht erzeugt werden. Bitte später erneut versuchen.',
    network: 'Das PDF konnte nicht heruntergeladen werden. Bitte prüfen Sie Ihre Internetverbindung.',
  },
};

const XML: DocumentKind = {
  extension: 'xml',
  mimeType: 'application/xml',
  UTI: 'public.xml',
  dialogTitle: 'E-Rechnung (XML) teilen',
  messages: {
    unavailable: 'Auf diesem Gerät ist keine App zum Teilen von XML-Dateien verfügbar.',
    notFound: 'Die E-Rechnung (XML) wurde nicht gefunden. Sie steht erst nach dem Stellen der Rechnung zur Verfügung.',
    forbidden: 'Für diese E-Rechnung fehlt die Berechtigung. Bitte melden Sie sich erneut an.',
    server: 'Die E-Rechnung konnte auf dem Server nicht erzeugt werden. Bitte später erneut versuchen.',
    network: 'Die E-Rechnung konnte nicht heruntergeladen werden. Bitte prüfen Sie Ihre Internetverbindung.',
  },
};

function safeFileName(name: string, extension: string, fallback = 'Angebot'): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleaned || fallback}.${extension}`;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && /\b401\b/.test(error.message);
}

async function downloadFile(url: string, fileName: string, headers: Record<string, string>, extension: string): Promise<File> {
  const target = new File(Paths.cache, safeFileName(fileName, extension));
  try {
    if (target.exists) target.delete();
  } catch {
    // ignore – the download overwrites with idempotent: true
  }
  return File.downloadFileAsync(url, target, { headers, idempotent: true });
}

export function downloadPdf(url: string, fileName: string, headers: Record<string, string>): Promise<File> {
  return downloadFile(url, fileName, headers, PDF.extension);
}

async function share(file: File, kind: DocumentKind) {
  if (!(await Sharing.isAvailableAsync())) throw new PdfError(kind.messages.unavailable);
  await Sharing.shareAsync(file.uri, { mimeType: kind.mimeType, UTI: kind.UTI, dialogTitle: kind.dialogTitle });
}

function toDocumentError(error: unknown, kind: DocumentKind): PdfError {
  if (error instanceof PdfError) return error;
  const message = error instanceof Error ? error.message : '';
  if (/\b404\b/.test(message)) return new PdfError(kind.messages.notFound, error);
  if (/\b40[13]\b/.test(message)) return new PdfError(kind.messages.forbidden, error);
  if (/\b5\d\d\b/.test(message)) return new PdfError(kind.messages.server, error);
  return new PdfError(kind.messages.network, error);
}

/** Authenticated download + share sheet. Retries once after refreshing an expired access token. */
async function shareAuthenticated(url: string, fileName: string, kind: DocumentKind): Promise<void> {
  const headers = () => ({ ...api.authHeaders(), Accept: kind.mimeType });
  let file: File;
  try {
    try {
      file = await downloadFile(url, fileName, headers(), kind.extension);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      const token = await refreshSession();
      if (!token) throw error;
      file = await downloadFile(url, fileName, headers(), kind.extension);
    }
    await share(file, kind);
  } catch (error) {
    throw toDocumentError(error, kind);
  }
}

/** Internal quotation PDF (authenticated). */
export function shareQuotationPdf(companyId: string, quotationId: string, number: string): Promise<void> {
  return shareAuthenticated(api.quotations.pdfUrl(companyId, quotationId), `Angebot_${number}`, PDF);
}

/** Invoice PDF: drafts come with a "Entwurf" watermark, issued invoices are the hybrid ZUGFeRD e-invoice. */
export function shareInvoicePdf(companyId: string, invoiceId: string, fileName: string): Promise<void> {
  return shareAuthenticated(api.invoices.pdfUrl(companyId, invoiceId), fileName, PDF);
}

/** E-invoice XML (UN/CEFACT CII, EN 16931) of an issued invoice. */
export function shareInvoiceXml(companyId: string, invoiceId: string, fileName: string): Promise<void> {
  return shareAuthenticated(api.invoices.xmlUrl(companyId, invoiceId), fileName, XML);
}

/** GDPR export of the signed-in user's data (JSON) → share sheet (save to Files/Drive, mail, …). */
export async function shareMyDataExport(): Promise<void> {
  const url = api.url('/me/export');
  const target = new File(Paths.cache, `AngebotPilot_Datenexport_${new Date().toISOString().slice(0, 10)}.json`);
  try {
    if (target.exists) target.delete();
    let file: File;
    try {
      file = await File.downloadFileAsync(url, target, { headers: api.authHeaders(), idempotent: true });
    } catch (error) {
      if (!isUnauthorized(error) || !(await refreshSession())) throw error;
      file = await File.downloadFileAsync(url, target, { headers: api.authHeaders(), idempotent: true });
    }
    if (!(await Sharing.isAvailableAsync())) throw new PdfError('Auf diesem Gerät ist Teilen nicht verfügbar.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Datenexport speichern oder teilen' });
  } catch (error) {
    if (error instanceof PdfError) throw error;
    throw new PdfError('Der Datenexport konnte nicht heruntergeladen werden. Bitte später erneut versuchen.', error);
  }
}

/** Public quotation PDF (token in the URL, no login). */
export async function sharePublicPdf(token: string, number: string): Promise<void> {
  try {
    const file = await downloadPdf(api.publicQuotation.pdfUrl(token), `Angebot_${number}`, {
      'X-AngebotPilot-Client': 'mobile',
      Accept: 'application/pdf',
    });
    await share(file, PDF);
  } catch (error) {
    throw toDocumentError(error, PDF);
  }
}
