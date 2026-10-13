/** Triggers a browser download for a blob. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** File-name friendly date stamp, e.g. 2026-10-12. */
export function fileStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** File-name friendly document number (e.g. "RE-2026-0001"; other characters become "_"). */
export function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Loads a document from the API (e.g. the e-invoice XML) and saves it under the given name.
 * The content type is forced when given, so browsers do not try to render XML inline.
 */
export async function downloadDocument(load: () => Promise<Blob>, fileName: string, contentType?: string): Promise<void> {
  const blob = await load();
  downloadBlob(contentType && blob.type !== contentType ? new Blob([blob], { type: contentType }) : blob, fileName);
}
