import { Stack } from 'expo-router';

import { useLocale } from '@/lib/i18n';
import { useStackScreenOptions } from '@/lib/navigation';

export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  const { tr } = useLocale();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="login" options={{ headerShown: false, title: tr('Anmelden', 'Sign in') }} />
      <Stack.Screen name="register" options={{ title: tr('Konto erstellen', 'Create account') }} />
      <Stack.Screen name="forgot-password" options={{ title: tr('Passwort vergessen', 'Forgot password') }} />
    </Stack>
  );
}
