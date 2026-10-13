import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { IconButton, type IconName } from '@/components/Button';
import { useUnreadCount } from '@/lib/queries';
import { colors } from '@/theme';

function HeaderActions() {
  const router = useRouter();
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;
  return (
    <View style={styles.actions}>
      <IconButton icon="qr-code-outline" accessibilityLabel="QR-Code eines Angebots scannen" onPress={() => router.push('/scanner')} testID="header-scan" />
      <IconButton
        icon="notifications-outline"
        accessibilityLabel={count ? `Benachrichtigungen, ${count} ungelesen` : 'Benachrichtigungen'}
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
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
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
      <Tabs.Screen name="index" options={{ title: 'Übersicht', tabBarIcon: tabIcon('home-outline', 'home'), tabBarAccessibilityLabel: 'Übersicht' }} />
      <Tabs.Screen
        name="quotations"
        options={{ title: 'Angebote', tabBarIcon: tabIcon('document-text-outline', 'document-text'), tabBarAccessibilityLabel: 'Angebote' }}
      />
      <Tabs.Screen name="customers" options={{ title: 'Kunden', tabBarIcon: tabIcon('people-outline', 'people'), tabBarAccessibilityLabel: 'Kunden' }} />
      <Tabs.Screen name="jobs" options={{ title: 'Aufträge', tabBarIcon: tabIcon('briefcase-outline', 'briefcase'), tabBarAccessibilityLabel: 'Aufträge' }} />
      <Tabs.Screen name="more" options={{ title: 'Mehr', tabBarIcon: tabIcon('menu-outline', 'menu'), tabBarAccessibilityLabel: 'Mehr' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: 4 },
});
