import { setLocale } from '@angebotpilot/api-contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashView } from '@/components/SplashView';
import { ToastProvider } from '@/components/Toast';
import { LocaleProvider, useLocale } from '@/lib/i18n';
import { navigationTheme, useStackScreenOptions } from '@/lib/navigation';
import { deviceLocale, loadPreferences } from '@/lib/preferences';
import { queryClient, wireQueryClientToDevice } from '@/lib/queryClient';
import { restoreSession, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Until the stored choice is read, the UI follows the device language.
setLocale(deviceLocale());

export default function RootLayout() {
  useEffect(() => {
    // Stored language/theme first, then the session (whose account language wins after sign-in).
    void loadPreferences().finally(() => void restoreSession());
    const unwire = wireQueryClientToDevice();
    // The branded SplashView (with progress indicator) takes over from the native splash immediately.
    void SplashScreen.hideAsync().catch(() => undefined);
    return unwire;
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocaleProvider>
          <KeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <ThemedApp />
            </QueryClientProvider>
          </KeyboardProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const theme = useTheme();
  const navTheme = useMemo(() => navigationTheme(theme), [theme]);
  useEffect(() => {
    // Root view background (visible behind screens during transitions and when the keyboard resizes the window).
    void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
  }, [theme]);
  return (
    <NavigationThemeProvider value={navTheme}>
      <ToastProvider>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </ToastProvider>
    </NavigationThemeProvider>
  );
}

function RootNavigator() {
  const session = useSession();
  const { tr } = useLocale();
  const screenOptions = useStackScreenOptions();
  if (session.status === 'restoring') return <SplashView />;
  if (session.status === 'offline') return <SplashView offline onRetry={() => void restoreSession()} />;

  const signedIn = session.status === 'signedIn';
  const hasCompany = signedIn && !!session.activeCompanyId;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={hasCompany}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasCompany}>
        <Stack.Screen name="onboarding" options={{ title: tr('Unternehmen anlegen', 'Create company'), headerBackVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="q/[token]" options={{ title: tr('Angebot', 'Quotation') }} />
    </Stack>
  );
}
