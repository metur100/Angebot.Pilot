import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { TemplateItem } from '@/features/quotation-editor/TemplatePicker';
import { useTemplates } from '@/lib/queries';
import { colors, space } from '@/theme';

/** Template selection: picking a template starts a new quotation pre-filled with its items and texts. */
export default function TemplatesScreen() {
  const router = useRouter();
  const templates = useTemplates();

  if (templates.isPending) return <Screen><ListSkeleton /></Screen>;
  if (templates.isError) {
    return (
      <Screen>
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={templates.data}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space[3] }} />}
        refreshControl={<RefreshControl refreshing={templates.isRefetching} onRefresh={() => void templates.refetch()} colors={[colors.brand]} tintColor={colors.brand} />}
        ListHeaderComponent={
          templates.data.length > 0 ? (
            <Text variant="caption" tone="secondary" style={styles.hint}>
              Wählen Sie eine Vorlage, um ein neues Angebot mit deren Positionen und Texten zu beginnen.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TemplateItem item={item} onPress={() => router.push({ pathname: '/quotation-editor', params: { templateId: item.id } })} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="Noch keine Vorlagen"
            message="Vorlagen verwalten Sie in der Web-App. Wiederkehrende Leistungen sparen so Zeit beim Erstellen von Angeboten."
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: space[4], flexGrow: 1 },
  hint: { marginBottom: space[3] },
});
