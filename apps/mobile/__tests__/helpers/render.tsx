import { QueryClientProvider } from '@tanstack/react-query';
import { renderRouter } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/Toast';
import { LocaleProvider } from '@/lib/i18n';
import { resetPreferences } from '@/lib/preferences';
import { queryClient } from '@/lib/queryClient';
import { sessionStore } from '@/lib/session';
import { ThemeProvider } from '@/theme';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>{children}</ToastProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Renders a single screen inside an in-memory Expo Router stack with the app providers. */
export function renderScreen(routes: Record<string, ComponentType>, initialUrl: string) {
  return renderRouter(
    {
      _layout: function Layout() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Stack } = require('expo-router');
        return (
          <Providers>
            <Stack />
          </Providers>
        );
      },
      ...routes,
    },
    { initialUrl },
  );
}

export function resetAll() {
  queryClient.clear();
  sessionStore.reset();
  resetPreferences();
  const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  SecureStore.__store.clear();
}
