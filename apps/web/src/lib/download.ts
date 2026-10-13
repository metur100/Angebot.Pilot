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
