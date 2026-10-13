import { Stack } from 'expo-router';

import { useLocale } from '@/lib/i18n';
import { useStackScreenOptions } from '@/lib/navigation';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const { tr } = useLocale();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: tr('Übersicht', 'Overview') }} />
      <Stack.Screen name="quotation/[id]" options={{ title: tr('Angebot', 'Quotation') }} />
      <Stack.Screen name="quotation-editor" options={{ title: tr('Angebot', 'Quotation') }} />
      <Stack.Screen name="customer/[id]" options={{ title: tr('Kunde', 'Customer') }} />
      <Stack.Screen name="customer-form" options={{ title: tr('Kunde', 'Customer') }} />
      <Stack.Screen name="job/[id]" options={{ title: tr('Auftrag', 'Job') }} />
      <Stack.Screen name="invoices" options={{ title: tr('Rechnungen', 'Invoices') }} />
      <Stack.Screen name="invoice/[id]" options={{ title: tr('Rechnung', 'Invoice') }} />
      <Stack.Screen name="invoice-editor" options={{ title: tr('Rechnung', 'Invoice') }} />
      <Stack.Screen name="templates" options={{ title: tr('Vorlage wählen', 'Choose template') }} />
      <Stack.Screen name="notifications" options={{ title: tr('Benachrichtigungen', 'Notifications') }} />
      <Stack.Screen name="company" options={{ title: tr('Unternehmen', 'Company') }} />
      <Stack.Screen name="profile" options={{ title: tr('Mein Konto', 'My account') }} />
      <Stack.Screen
        name="scanner"
        options={{ title: tr('QR-Code scannen', 'Scan QR code'), headerShown: false, animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
