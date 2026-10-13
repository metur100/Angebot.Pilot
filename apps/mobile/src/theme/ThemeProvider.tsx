// Theme context: the colour scheme follows the user's preference ('system' | 'light' | 'dark', stored on the device);
// 'system' reacts live to the OS setting. Styles that depend on colours are created per scheme with makeStyles().
import type { ColorScheme, ThemePreference } from '@angebotpilot/brand';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { setThemePreference, themePreferenceStore } from '@/lib/preferences';

import { themes, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(themes.light);

export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children, scheme: forced }: { children: ReactNode; scheme?: ColorScheme }) {
  const preference = useSyncExternalStore(themePreferenceStore.subscribe, themePreferenceStore.get, themePreferenceStore.get);
  const system = useColorScheme();
  const scheme = forced ?? resolveScheme(preference, system);
  return <ThemeContext.Provider value={themes[scheme]}>{children}</ThemeContext.Provider>;
}

/** Current theme: `{ scheme, colors, toneColors, shadow }`. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** The stored theme preference and its setter (settings screen). */
export function useThemePreference(): { preference: ThemePreference; setPreference: (p: ThemePreference) => Promise<void> } {
  const preference = useSyncExternalStore(themePreferenceStore.subscribe, themePreferenceStore.get, themePreferenceStore.get);
  return useMemo(() => ({ preference, setPreference: setThemePreference }), [preference]);
}

/**
 * Creates a hook returning a StyleSheet built from the current theme, memoised per scheme:
 *   const useStyles = makeStyles(({ colors }) => ({ root: { backgroundColor: colors.background } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T & StyleSheet.NamedStyles<T>): () => T {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
