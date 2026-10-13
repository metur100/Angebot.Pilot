import { detectLocale, getLocale, intlLocale, isLocale, onLocaleChange, setLocale, type Locale } from '@angebotpilot/api-contracts';
import { createContext, Fragment, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

// UI language (German/English) for the web app. Texts are written inline as tr('Deutsch', 'English') pairs and
// resolved at render time; the locale itself is module state in @angebotpilot/api-contracts (labels, formatting,
// validation and API error messages follow it). Documents for customers (PDFs, e-invoices, emails) stay German.
//
// Which language applies:
// - signed in: the language stored on the user (MeDto.language) wins; switching in the UI updates the profile;
// - signed out: the choice remembered in this browser, otherwise the browser languages (German fallback).

export { tr, type Locale } from '@angebotpilot/api-contracts';

export const LOCALE_KEY = 'ap.locale';

function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** The language for this browser before anyone signs in: the remembered choice, else the browser languages. */
export function initialLocale(): Locale {
  if (typeof navigator === 'undefined') return storedLocale() ?? 'de';
  return storedLocale() ?? detectLocale([...(navigator.languages ?? []), navigator.language]);
}

/** Switches the UI language, remembers it in this browser and updates <html lang>. */
export function applyLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // private mode / blocked storage: the switch still applies to this page
  }
  document.documentElement.lang = locale;
  setLocale(locale);
}

/** BCP 47 tag of the current UI language for Intl APIs ("de-DE" / "en-GB"). */
export function currentIntlLocale(): string {
  return intlLocale[getLocale()];
}

interface LocaleContextValue {
  locale: Locale;
  setLanguage: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const subscribe = (onChange: () => void) => onLocaleChange(onChange);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Resolve the start language once, before the first render of anything that reads it.
  useState(() => {
    const locale = initialLocale();
    setLocale(locale);
    document.documentElement.lang = locale;
    return locale;
  });
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const value = useMemo<LocaleContextValue>(() => ({ locale, setLanguage: applyLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside <LocaleProvider>');
  return context;
}

/**
 * Re-mounts its subtree when the language changes, so every inline tr() text, memoised label and document title
 * is rendered again. Server state lives in the query cache above it and is kept.
 */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return <Fragment key={locale}>{children}</Fragment>;
}

/** Locale-aware integer formatting (1.234 / 1,234). */
export function formatCount(value: number): string {
  return value.toLocaleString(currentIntlLocale());
}
