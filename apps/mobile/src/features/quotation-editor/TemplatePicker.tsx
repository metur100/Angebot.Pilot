import { formatEur, type TemplateListItemDto } from '@angebotpilot/api-contracts';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PressableCard } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { useTemplates } from '@/lib/queries';
import { colors, space } from '@/theme';

export function TemplateItem({ item, onPress }: { item: TemplateListItemDto; onPress: () => void }) {
  return (
    <PressableCard
      onPress={onPress}
      accessibilityLabel={`Vorlage ${item.name}, ${item.lineItemCount} Positionen, ${formatEur(item.netTotal)} netto`}
      testID={`template-${item.id}`}
    >
      <Text variant="bodyStrong">{item.name}</Text>
      {item.description ? (
        <Text variant="caption" tone="secondary" numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <Text variant="small" tone="muted">
        {item.lineItemCount} {item.lineItemCount === 1 ? 'Position' : 'Positionen'} · {formatEur(item.netTotal)} netto
      </Text>
    </PressableCard>
  );
}

export function TemplatePicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const templates = useTemplates();
  return (
    <Sheet visible={visible} onClose={onClose} title="Mit Vorlage starten" testID="template-picker">
      <Text variant="caption" tone="secondary">
        Positionen und Texte der Vorlage werden übernommen und können danach angepasst werden.
      </Text>
      {templates.isPending ? (
        <ActivityIndicator color={colors.brand} />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} compact />
      ) : templates.data.length === 0 ? (
        <EmptyState icon="albums-outline" title="Keine Vorlagen" message="Vorlagen legen Sie in der Web-App an oder speichern ein Angebot als Vorlage." />
      ) : (
        <View style={styles.list}>
          {templates.data.map((t) => (
            <TemplateItem
              key={t.id}
              item={t}
              onPress={() => {
                onPick(t.id);
                onClose();
              }}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
});
