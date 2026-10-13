import { errorMessage, formatDateTime, type NotificationDto } from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen, ThemedRefreshControl } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useLocale } from '@/lib/i18n';
import { flattenPages, keys, useNotifications } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { makeStyles, radius, space, useTheme } from '@/theme';

function targetFor(n: NotificationDto): string | null {
  if (!n.entityId) return null;
  if (n.entityType === 'Quotation') return `/quotation/${n.entityId}`;
  if (n.entityType === 'Job') return `/job/${n.entityId}`;
  if (n.entityType === 'Customer') return `/customer/${n.entityId}`;
  if (n.entityType === 'Invoice') return `/invoice/${n.entityId}`;
  return null;
}

export default function NotificationsScreen() {
  const companyId = useCompanyId();
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const query = useNotifications();
  const [markingAll, setMarkingAll] = useState(false);
  const items = flattenPages(query.data);
  const unread = items.filter((n) => !n.isRead).length;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: keys.notifications(companyId) });

  const open = async (n: NotificationDto) => {
    if (!n.isRead) {
      try {
        await api.notifications.markRead(companyId, n.id);
        invalidate();
      } catch (e) {
        Alert.alert(tr('Fehler', 'Error'), errorMessage(e));
      }
    }
    const target = targetFor(n);
    if (target) router.push(target as never);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api.notifications.markAllRead(companyId);
      invalidate();
    } catch (e) {
      Alert.alert(tr('Fehler', 'Error'), errorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () =>
            unread > 0 ? (
              <Button label={tr('Alle gelesen', 'Mark all read')} variant="ghost" size="sm" fullWidth={false} onPress={() => void markAll()} loading={markingAll} testID="mark-all-read" />
            ) : null,
        }}
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space[2] }} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          refreshControl={<ThemedRefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.brandText} style={{ margin: space[4] }} /> : null}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.isRead ? '' : tr('Ungelesen: ', 'Unread: ')}${item.title}${item.body ? `. ${item.body}` : ''}`}
              accessibilityHint={item.isRead ? undefined : tr('Markiert als gelesen', 'Marks as read')}
              onPress={() => void open(item)}
              style={({ pressed }) => [styles.item, !item.isRead ? styles.unread : null, pressed ? styles.pressed : null]}
              testID={`notification-${item.id}`}
            >
              <Ionicons name={item.isRead ? 'notifications-outline' : 'notifications'} size={22} color={item.isRead ? colors.textMuted : colors.brandText} />
              <View style={styles.flex}>
                <Text variant={item.isRead ? 'body' : 'bodyStrong'}>{item.title}</Text>
                {item.body ? <Text variant="caption" tone="secondary">{item.body}</Text> : null}
                <Text variant="small" tone="muted">
                  {formatDateTime(item.createdAt)}
                  {item.isRead ? '' : tr(' · ungelesen', ' · unread')}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title={tr('Keine Benachrichtigungen', 'No notifications')}
              message={tr('Hier erscheinen z. B. Annahmen und Ablehnungen Ihrer Kunden.', 'Your customers’ acceptances and rejections, for example, appear here.')}
            />
          }
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: { padding: space[4], flexGrow: 1 },
  flex: { flex: 1 },
  item: {
    flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  unread: { borderColor: colors.brandBorder, backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.85 },
}));
