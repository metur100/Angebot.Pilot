import { formatEur, type TemplateListItemDto } from '@angebotpilot/api-contracts';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PressableCard } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { useLocale } from '@/lib/i18n';
import { useTemplates } from '@/lib/queries';
import { space, useTheme } from '@/theme';

export function TemplateItem({ item, onPress }: { item: TemplateListItemDto; onPress: () => void }) {
  const { tr } = useLocale();
  return (
    <PressableCard
      onPress={onPress}
      accessibilityLabel={tr(
        `Vorlage ${item.name}, ${item.lineItemCount} Positionen, ${formatEur(item.netTotal)} netto`,
        `Template ${item.name}, ${item.lineItemCount} line items, ${formatEur(item.netTotal)} net`,
      )}
      testID={`template-${item.id}`}
    >
      <Text variant="bodyStrong">{item.name}</Text>
      {item.description ? (
        <Text variant="caption" tone="secondary" numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <Text variant="small" tone="muted">
        {item.lineItemCount}{' '}
        {item.lineItemCount === 1 ? tr('Position', 'line item') : tr('Positionen', 'line items')} · {formatEur(item.netTotal)} {tr('netto', 'net')}
      </Text>
    </PressableCard>
  );
}

export function TemplatePicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { tr } = useLocale();
  const { colors } = useTheme();
  const templates = useTemplates();
  return (
    <Sheet visible={visible} onClose={onClose} title={tr('Mit Vorlage starten', 'Start from template')} testID="template-picker">
      <Text variant="caption" tone="secondary">
        {tr(
          'Positionen und Texte der Vorlage werden übernommen und können danach angepasst werden.',
          'The template’s line items and texts are copied and can be adjusted afterwards.',
        )}
      </Text>
      {templates.isPending ? (
        <ActivityIndicator color={colors.brandText} />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} compact />
      ) : templates.data.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title={tr('Keine Vorlagen', 'No templates')}
          message={tr('Vorlagen legen Sie in der Web-App an oder speichern ein Angebot als Vorlage.', 'Create templates in the web app or save a quotation as a template.')}
        />
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
