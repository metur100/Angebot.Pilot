import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { IconButton, type IconName } from '@/components/Button';
import { useLocale } from '@/lib/i18n';
import { useUnreadCount } from '@/lib/queries';
import { useTheme } from '@/theme';

function HeaderActions() {
  const router = useRouter();
  const { tr } = useLocale();
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;
  return (
    <View style={styles.actions}>
      <IconButton
        icon="qr-code-outline"
        accessibilityLabel={tr('QR-Code eines Angebots scannen', 'Scan a quotation QR code')}
        onPress={() => router.push('/scanner')}
        testID="header-scan"
      />
      <IconButton
        icon="notifications-outline"
        accessibilityLabel={
          count ? tr(`Benachrichtigungen, ${count} ungelesen`, `Notifications, ${count} unread`) : tr('Benachrichtigungen', 'Notifications')
        }
        onPress={() => router.push('/notifications')}
        badge={count}
        testID="header-notifications"
      />
    </View>
  );
}

const tabIcon = (name: IconName, focusedName: IconName) =>
  function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? focusedName : name} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const { colors } = useTheme();
  const { tr } = useLocale();
  const tab = (title: string, icon: IconName, focusedIcon: IconName) => ({
    title,
    tabBarIcon: tabIcon(icon, focusedIcon),
    tabBarAccessibilityLabel: title,
  });
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarAllowFontScaling: true,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 20 },
        headerTitleAlign: 'left',
        headerRight: () => <HeaderActions />,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={tab(tr('Übersicht', 'Overview'), 'home-outline', 'home')} />
      <Tabs.Screen name="quotations" options={tab(tr('Angebote', 'Quotations'), 'document-text-outline', 'document-text')} />
      <Tabs.Screen name="customers" options={tab(tr('Kunden', 'Customers'), 'people-outline', 'people')} />
      <Tabs.Screen name="jobs" options={tab(tr('Aufträge', 'Jobs'), 'briefcase-outline', 'briefcase')} />
      <Tabs.Screen name="more" options={tab(tr('Mehr', 'More'), 'menu-outline', 'menu')} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: 4 },
});
