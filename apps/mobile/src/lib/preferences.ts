// Device preferences: UI language and colour theme. Both are stored in SecureStore (tiny values; AsyncStorage is not
// part of the app) and survive logout.
//
// Language rule: logged out → stored device choice, else the device language. Once signed in, the language saved on
// the user account (MeDto.language) wins and is stored on the device as well.
import { detectLocale, getLocale, isLocale, setLocale, type Locale, type MeDto } from '@angebotpilot/api-contracts';
import type { ThemePreference } from '@angebotpilot/brand';
import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

import { deviceLocaleTags } from './deviceLocale';

export const PREFERENCE_KEYS = {
  language: 'angebotpilot.language',
  theme: 'angebotpilot.theme',
} as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The device language mapped to a supported UI locale (German unless the device prefers English). */
export function deviceLocale(): Locale {
  return detectLocale(deviceLocaleTags());
}

async function store(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Not persisting a preference is not worth an error message.
  }
}

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

// ---------- Language ----------

/** Switches the UI language and remembers it on this device. */
export async function persistLanguage(locale: Locale): Promise<void> {
  setLocale(locale);
  await store(PREFERENCE_KEYS.language, locale);
}

/** Applies the language stored on the user account (server wins after sign-in). */
export function applyAccountLanguage(user: Pick<MeDto, 'language'> | null | undefined): void {
  const language = user?.language;
  if (!isLocale(language) || language === getLocale()) return;
  void persistLanguage(language);
}

// ---------- Theme ----------

let themePreference: ThemePreference = 'system';
const themeListeners = new Set<() => void>();

export const themePreferenceStore = {
  get: (): ThemePreference => themePreference,
  subscribe(listener: () => void) {
    themeListeners.add(listener);
    return () => {
      themeListeners.delete(listener);
    };
  },
};

function applyThemePreference(preference: ThemePreference) {
  themePreference = preference;
  // Native UI (alerts, date pickers, keyboard) follows the app's choice as well.
  try {
    Appearance.setColorScheme?.(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // Not supported on this platform/runtime – the app's own colours still follow the preference.
  }
  themeListeners.forEach((listener) => listener());
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  applyThemePreference(preference);
  await store(PREFERENCE_KEYS.theme, preference);
}

// ---------- Start-up ----------

/** Loads the stored preferences (call once at start-up, before restoring the session). */
export async function loadPreferences(): Promise<void> {
  const [language, theme] = await Promise.all([read(PREFERENCE_KEYS.language), read(PREFERENCE_KEYS.theme)]);
  setLocale(isLocale(language) ? language : deviceLocale());
  if (isThemePreference(theme) && theme !== themePreference) applyThemePreference(theme);
}

/** Test helper: back to German and the system theme. */
export function resetPreferences(): void {
  setLocale('de');
  themePreference = 'system';
  themeListeners.forEach((listener) => listener());
}
