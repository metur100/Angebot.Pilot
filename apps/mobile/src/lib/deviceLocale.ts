import { NativeModules, Platform } from 'react-native';

/**
 * The device's preferred language tags, most preferred first (e.g. ["de-DE"]). Uses Hermes' Intl (which reports the
 * system locale) and falls back to the legacy native locale settings. Kept in its own module so tests can mock it.
 */
export function deviceLocaleTags(): string[] {
  const tags: string[] = [];
  try {
    tags.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl unavailable – use the native settings below.
  }
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings as { AppleLanguages?: string[]; AppleLocale?: string } | undefined;
      tags.unshift(...(settings?.AppleLanguages ?? []));
      if (settings?.AppleLocale) tags.push(settings.AppleLocale);
    } else {
      const identifier = NativeModules.I18nManager?.localeIdentifier as string | undefined;
      if (identifier) tags.unshift(identifier);
    }
  } catch {
    // Native modules are not available (e.g. bridgeless without the legacy modules).
  }
  return tags.filter(Boolean);
}
