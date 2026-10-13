// UI language (German / English). The current locale is module state in @angebotpilot/api-contracts (labels,
// formatting, validation and API errors read it at call time); this provider turns it into React state so every
// component that calls useLocale() re-renders on a switch. Inline pairs are the convention: tr('Speichern', 'Save').
//
// Documents (PDFs, e-invoices, customer emails) stay German regardless of the UI language.
import { getLocale, intlLocale, onLocaleChange, tr, type Locale } from '@angebotpilot/api-contracts';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { persistLanguage } from './preferences';
import { queryClient } from './queryClient';
import { api, sessionStore, updateUser } from './session';

export { tr };

/**
 * Switches the UI language, stores it on the device and – when signed in – on the user account (PATCH /me), so that
 * account emails follow too. Rejects when the account could not be updated (the local switch is kept).
 */
export async function changeLanguage(locale: Locale): Promise<void> {
  await persistLanguage(locale);
  const { status, user } = sessionStore.getState();
  if (status !== 'signedIn' || !user || user.language === locale) return;
  const updated = await api.me.update({ displayName: user.displayName, language: locale });
  updateUser(updated);
}

interface LocaleContextValue {
  locale: Locale;
  /** BCP 47 tag for Intl / native pickers ('de-DE' / 'en-GB'). */
  intlTag: string;
  setLanguage: (locale: Locale) => Promise<void>;
  tr: typeof tr;
}

function value(locale: Locale): LocaleContextValue {
  return { locale, intlTag: intlLocale[locale], setLanguage: changeLanguage, tr };
}

const LocaleContext = createContext<LocaleContextValue>(value(getLocale()));

function subscribe(listener: () => void) {
  return onLocaleChange(() => listener());
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  useEffect(
    () =>
      onLocaleChange(() => {
        // Server-provided texts (activity summaries, notifications, definitions) follow Accept-Language.
        void queryClient.invalidateQueries();
      }),
    [],
  );
  const ctx = useMemo(() => value(locale), [locale]);
  return <LocaleContext.Provider value={ctx}>{children}</LocaleContext.Provider>;
}

/** `{ locale, intlTag, setLanguage, tr }` – components that render translated text call this to re-render on a switch. */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
