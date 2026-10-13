import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashView } from '@/components/SplashView';
import { ToastProvider } from '@/components/Toast';
import { queryClient, wireQueryClientToDevice } from '@/lib/queryClient';
import { restoreSession, useSession } from '@/lib/session';
import { stackScreenOptions } from '@/lib/navigation';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => {
    void restoreSession();
    const unwire = wireQueryClientToDevice();
    // The branded SplashView (with progress indicator) takes over from the native splash immediately.
    void SplashScreen.hideAsync().catch(() => undefined);
    return unwire;
  }, []);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </ToastProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const session = useSession();
  if (session.status === 'restoring') return <SplashView />;
  if (session.status === 'offline') return <SplashView offline onRetry={() => void restoreSession()} />;

  const signedIn = session.status === 'signedIn';
  const hasCompany = signedIn && !!session.activeCompanyId;

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={hasCompany}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasCompany}>
        <Stack.Screen name="onboarding" options={{ title: 'Unternehmen anlegen', headerBackVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="q/[token]" options={{ title: 'Angebot' }} />
    </Stack>
  );
}
