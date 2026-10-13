import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/lib/navigation';

export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="login" options={{ headerShown: false, title: 'Anmelden' }} />
      <Stack.Screen name="register" options={{ title: 'Konto erstellen' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Passwort vergessen' }} />
    </Stack>
  );
}
