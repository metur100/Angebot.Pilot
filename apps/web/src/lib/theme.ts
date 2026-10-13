import type { ColorScheme, ThemePreference } from '@angebotpilot/brand';
import { useSyncExternalStore } from 'react';

// Light/dark theme. The preference ('system' | 'light' | 'dark') is remembered per browser; 'system' follows
// prefers-color-scheme live. The resolved scheme is applied as <html data-theme="…">, which switches every --ap-*
// token (packages/brand/tokens.css). index.html applies the stored preference before the first paint (no flash);
// keep the key and the theme-color values there in sync with this module.

export type { ColorScheme, ThemePreference } from '@angebotpilot/brand';

export const THEME_KEY = 'ap.theme';

/** Browser UI colour (<meta name="theme-color">) per scheme. */
export const themeColor: Record<ColorScheme, string> = { light: '#2F45D8', dark: '#171B23' };

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
let preference: ThemePreference = readPreference();
let resolved: ColorScheme = resolve(preference);
let detachSystemListener: (() => void) | null = null;

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isPreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

function resolve(value: ThemePreference): ColorScheme {
  if (value === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return value;
}

function apply() {
  resolved = resolve(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor[resolved]);
  for (const listener of listeners) listener();
}

/** Applies the stored preference and follows system changes. Call once at start-up (safe to repeat). */
export function initTheme() {
  preference = readPreference();
  detachSystemListener?.();
  detachSystemListener = null;
  if (typeof window.matchMedia === 'function') {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (preference === 'system') apply();
    };
    query.addEventListener?.('change', onChange);
    detachSystemListener = () => query.removeEventListener?.('change', onChange);
  }
  apply();
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function getResolvedTheme(): ColorScheme {
  return resolved;
}

export function setThemePreference(value: ThemePreference) {
  preference = value;
  try {
    if (value === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, value);
  } catch {
    // storage blocked: applies to this page only
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): { preference: ThemePreference; resolved: ColorScheme; setPreference: (value: ThemePreference) => void } {
  const current = useSyncExternalStore(subscribe, () => `${preference}:${resolved}`);
  const [pref, scheme] = current.split(':') as [ThemePreference, ColorScheme];
  return { preference: pref, resolved: scheme, setPreference: setThemePreference };
}
