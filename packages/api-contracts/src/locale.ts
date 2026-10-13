// UI language shared by the web and mobile apps. German is the default and the language of all documents
// (PDFs, e-invoices, customer emails); English only changes the user interface.
//
// The current locale is module state: apps call setLocale() once at start-up and whenever the user switches,
// then re-render their tree. Labels (labels.ts), formatting (money.ts), validation messages (schemas.ts) and
// error messages (client.ts) read it at call time. The API client sends it as Accept-Language.

export type Locale = 'de' | 'en';

export const locales: readonly Locale[] = ['de', 'en'];

export const localeNames: Record<Locale, string> = { de: 'Deutsch', en: 'English' };

/** BCP 47 tag used for Intl formatting. English uses British conventions (day-month-year, 24 h). */
export const intlLocale: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

let current: Locale = 'de';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  for (const listener of listeners) listener(locale);
}

/** Subscribes to locale changes; returns the unsubscribe function. */
export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isLocale(value: unknown): value is Locale {
  return value === 'de' || value === 'en';
}

/** Picks a supported locale from browser/device language tags (e.g. navigator.languages), defaulting to German. */
export function detectLocale(tags: readonly (string | null | undefined)[]): Locale {
  for (const tag of tags) {
    const base = tag?.toLowerCase().split(/[-_]/)[0];
    if (base === 'de') return 'de';
    if (base === 'en') return 'en';
  }
  return 'de';
}

/** Returns the text for the current locale: `tr('Speichern', 'Save')`. */
export function tr(de: string, en: string): string {
  return current === 'en' ? en : de;
}

/** Picks the current locale's entry of a per-locale record. */
export function byLocale<T>(values: Record<Locale, T>): T {
  return values[current];
}
