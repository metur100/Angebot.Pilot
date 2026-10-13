import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router';
import { useMemo } from 'react';

import { useTheme, type Theme } from '@/theme';

/** Shared native-stack header styling for the current theme. */
export function useStackScreenOptions() {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      headerTintColor: colors.brandText,
      headerTitleStyle: { color: colors.text, fontWeight: '600' as const },
      headerStyle: { backgroundColor: colors.surface },
      headerShadowVisible: true,
      contentStyle: { backgroundColor: colors.background },
      headerBackButtonDisplayMode: 'minimal' as const,
    }),
    [colors],
  );
}

/** React Navigation theme (headers, tab bar, card background) built from the app tokens. */
export function navigationTheme({ scheme, colors }: Theme): NavigationTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.brandText,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.dangerFill,
    },
  };
}
