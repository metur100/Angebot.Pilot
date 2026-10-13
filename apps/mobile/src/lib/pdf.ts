// Downloads a quotation PDF into the cache directory and opens the system share sheet ("Öffnen mit", Drucken,
// Mail, Drive, …). Internal PDFs need the bearer token, so they are fetched with the API client's auth headers.
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

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleaned || 'Angebot'}.pdf`;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && /\b401\b/.test(error.message);
}

export async function downloadPdf(url: string, fileName: string, headers: Record<string, string>): Promise<File> {
  const target = new File(Paths.cache, safeFileName(fileName));
  try {
    if (target.exists) target.delete();
  } catch {
    // ignore – the download overwrites with idempotent: true
  }
  return File.downloadFileAsync(url, target, { headers, idempotent: true });
}

async function share(file: File) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new PdfError('Auf diesem Gerät ist keine App zum Teilen oder Öffnen von PDF-Dateien verfügbar.');
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'PDF öffnen oder teilen' });
}

function toPdfError(error: unknown): PdfError {
  if (error instanceof PdfError) return error;
  const message = error instanceof Error ? error.message : '';
  if (/\b404\b/.test(message)) return new PdfError('Das PDF wurde nicht gefunden.', error);
  if (/\b40[13]\b/.test(message)) return new PdfError('Für dieses PDF fehlt die Berechtigung. Bitte melden Sie sich erneut an.', error);
  if (/\b5\d\d\b/.test(message)) return new PdfError('Das PDF konnte auf dem Server nicht erzeugt werden. Bitte später erneut versuchen.', error);
  return new PdfError('Das PDF konnte nicht heruntergeladen werden. Bitte prüfen Sie Ihre Internetverbindung.', error);
}

/** Internal quotation PDF (authenticated). Retries once after refreshing an expired access token. */
export async function shareQuotationPdf(companyId: string, quotationId: string, number: string): Promise<void> {
  const url = api.quotations.pdfUrl(companyId, quotationId);
  let file: File;
  try {
    try {
      file = await downloadPdf(url, `Angebot_${number}`, { ...api.authHeaders(), Accept: 'application/pdf' });
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      const token = await refreshSession();
      if (!token) throw error;
      file = await downloadPdf(url, `Angebot_${number}`, { ...api.authHeaders(), Accept: 'application/pdf' });
    }
    await share(file);
  } catch (error) {
    throw toPdfError(error);
  }
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
    await share(file);
  } catch (error) {
    throw toPdfError(error);
  }
}
