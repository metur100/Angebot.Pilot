// Language and theme switchers (login/register screens and the "More" tab).
import { errorMessage, localeNames, locales, type Locale } from '@angebotpilot/api-contracts';
import type { ThemePreference } from '@angebotpilot/brand';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n';
import { useThemePreference } from '@/theme';

import { SegmentedControl } from './Field';
import { useToast } from './Toast';

/** Deutsch / English. Signed in, the choice is saved on the account too (PATCH /me). */
export function LanguageSwitcher() {
  const { locale, setLanguage, tr } = useLocale();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const change = async (next: Locale) => {
    if (busy || next === locale) return;
    setBusy(true);
    try {
      await setLanguage(next);
    } catch (error) {
      toast(
        `${tr('Die Sprache konnte nicht im Konto gespeichert werden.', 'The language could not be saved to your account.')} ${errorMessage(error)}`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SegmentedControl
      options={locales.map((l) => ({ value: l, label: localeNames[l] }))}
      value={locale}
      onChange={(l) => void change(l)}
      accessibilityLabel={tr('Sprache', 'Language')}
    />
  );
}

/** System / Hell / Dunkel. */
export function ThemeSwitcher() {
  const { tr } = useLocale();
  const { preference, setPreference } = useThemePreference();
  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: tr('System', 'System') },
    { value: 'light', label: tr('Hell', 'Light') },
    { value: 'dark', label: tr('Dunkel', 'Dark') },
  ];
  return (
    <SegmentedControl options={options} value={preference} onChange={(p) => void setPreference(p)} accessibilityLabel={tr('Darstellung', 'Appearance')} />
  );
}
