import { formatDateTime as formatDateTimeTz } from '@angebotpilot/api-contracts';

export { formatDate, formatEur, formatPercent, formatQuantity } from '@angebotpilot/api-contracts';

let displayTimeZone = 'Europe/Berlin';

/** Set from the selected company's time zone. */
export function setDisplayTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return;
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone });
    displayTimeZone = timeZone;
  } catch {
    // keep the previous value for unknown zones
  }
}

export function getDisplayTimeZone() {
  return displayTimeZone;
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDateTimeTz(iso, displayTimeZone);
}

const relative = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/** "vor 5 Minuten", "gestern", "in 3 Tagen" */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '–';
  const diffSeconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return 'gerade eben';
  if (abs < 3600) return relative.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 86400 * 30) return relative.format(Math.round(diffSeconds / 86400), 'day');
  return formatDateTime(iso);
}

/** Days from today (yyyy-MM-dd) until the given date; negative when in the past. */
export function daysUntil(isoDate: string, today: string): number {
  const toUtc = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(isoDate) - toUtc(today)) / 86_400_000);
}

const fileSize = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fileSize.format(bytes / 1024)} KB`;
  return `${fileSize.format(bytes / 1024 / 1024)} MB`;
}

/** German plural helper: plural(3, 'Angebot', 'Angebote') → "3 Angebote". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('de-DE')} ${count === 1 ? one : many}`;
}
