import { formatDateTime as formatDateTimeTz } from '@angebotpilot/api-contracts';
import { currentIntlLocale, tr } from './i18n';

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

/** "vor 5 Minuten", "gestern", "in 3 Tagen" (de) / "5 minutes ago", "yesterday", "in 3 days" (en) */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '–';
  const relative = new Intl.RelativeTimeFormat(currentIntlLocale(), { numeric: 'auto' });
  const diffSeconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return tr('gerade eben', 'just now');
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

export function formatFileSize(bytes: number): string {
  const fileSize = new Intl.NumberFormat(currentIntlLocale(), { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fileSize.format(bytes / 1024)} KB`;
  return `${fileSize.format(bytes / 1024 / 1024)} MB`;
}

/** Plural helper: plural(3, tr('Angebot', 'quotation'), tr('Angebote', 'quotations')) → "3 Angebote" / "3 quotations". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString(currentIntlLocale())} ${count === 1 ? one : many}`;
}
