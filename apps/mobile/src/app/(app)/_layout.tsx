import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/lib/navigation';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Übersicht' }} />
      <Stack.Screen name="quotation/[id]" options={{ title: 'Angebot' }} />
      <Stack.Screen name="quotation-editor" options={{ title: 'Angebot' }} />
      <Stack.Screen name="customer/[id]" options={{ title: 'Kunde' }} />
      <Stack.Screen name="customer-form" options={{ title: 'Kunde' }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Auftrag' }} />
      <Stack.Screen name="invoices" options={{ title: 'Rechnungen' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Rechnung' }} />
      <Stack.Screen name="invoice-editor" options={{ title: 'Rechnung' }} />
      <Stack.Screen name="templates" options={{ title: 'Vorlage wählen' }} />
      <Stack.Screen name="notifications" options={{ title: 'Benachrichtigungen' }} />
      <Stack.Screen name="company" options={{ title: 'Unternehmen' }} />
      <Stack.Screen name="profile" options={{ title: 'Mein Konto' }} />
      <Stack.Screen name="scanner" options={{ title: 'QR-Code scannen', headerShown: false, animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
