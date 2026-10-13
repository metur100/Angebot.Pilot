// Building blocks shared by the quotation and invoice editors: the step tabs and the line item cards.
import { calculateTotals, formatEur, formatPercent, formatQuantity, type LineItemForm, type TaxMode } from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { useLocale } from '@/lib/i18n';
import { makeStyles, space, touch, useTheme } from '@/theme';

export function StepIndicator({
  steps, step, onSelect, errorSteps,
}: { steps: readonly string[]; step: number; onSelect: (s: number) => void; errorSteps: Set<number> }) {
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.steps} accessibilityRole="tablist">
      {steps.map((label, i) => {
        const active = i === step;
        const hasError = errorSteps.has(i);
        return (
          <Pressable
            key={i}
            accessibilityRole="tab"
            accessibilityLabel={tr(
              `Schritt ${i + 1} von ${steps.length}: ${label}${hasError ? ', enthält Fehler' : ''}`,
              `Step ${i + 1} of ${steps.length}: ${label}${hasError ? ', contains errors' : ''}`,
            )}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(i)}
            style={[styles.step, active ? styles.stepActive : null]}
            testID={`step-${i}`}
          >
            <View style={[styles.stepNumber, active ? styles.stepNumberActive : null, hasError ? styles.stepNumberError : null]}>
              {hasError ? (
                <Ionicons name="alert" size={14} color={colors.onBrand} />
              ) : (
                <Text variant="small" style={{ color: active ? colors.onBrand : colors.textSecondary, fontWeight: '700' }}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text variant="small" tone={active ? 'brand' : 'secondary'} numberOfLines={1} style={styles.stepLabel}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LineCard({
  item, index, count, taxMode, onEdit, onMove, onDuplicate, onDelete,
}: {
  item: LineItemForm; index: number; count: number; taxMode: TaxMode;
  onEdit: () => void; onMove: (dir: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const totals = calculateTotals([item], 'Standard');
  return (
    <Card style={styles.lineCard} testID={`line-card-${index}`}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr(
          `Position ${index + 1}: ${item.title}, ${formatEur(totals.netTotal)} netto. Bearbeiten`,
          `Item ${index + 1}: ${item.title}, ${formatEur(totals.netTotal)} net. Edit`,
        )} onPress={onEdit} style={styles.lineMain}>
        <View style={styles.lineHeader}>
          <Text variant="small" tone="muted">
            {tr('Pos.', 'Item')} {index + 1}
          </Text>
          <Text variant="bodyStrong" testID={`line-net-${index}`}>
            {formatEur(totals.netTotal)}
          </Text>
        </View>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text variant="caption" tone="secondary">
          {formatQuantity(item.quantity)} {item.unit} × {formatEur(item.unitPriceNet)}
          {item.discountPercent ? ` · −${formatPercent(item.discountPercent)}` : ''}
          {taxMode === 'Standard' ? ` · ${formatPercent(item.taxRatePercent)} ${tr('USt.', 'VAT')}` : ''}
        </Text>
      </Pressable>
      <View style={styles.lineActions}>
        <IconButton icon="arrow-up" accessibilityLabel={tr(`Position ${index + 1} nach oben`, `Move item ${index + 1} up`)} onPress={() => onMove(-1)} disabled={index === 0} size={20} testID={`line-up-${index}`} />
        <IconButton icon="arrow-down" accessibilityLabel={tr(`Position ${index + 1} nach unten`, `Move item ${index + 1} down`)} onPress={() => onMove(1)} disabled={index === count - 1} size={20} testID={`line-down-${index}`} />
        <IconButton icon="copy-outline" accessibilityLabel={tr(`Position ${index + 1} duplizieren`, `Duplicate item ${index + 1}`)} onPress={onDuplicate} size={20} testID={`line-duplicate-${index}`} />
        <IconButton icon="create-outline" accessibilityLabel={tr(`Position ${index + 1} bearbeiten`, `Edit item ${index + 1}`)} onPress={onEdit} size={20} testID={`line-edit-${index}`} />
        <IconButton icon="trash-outline" accessibilityLabel={tr(`Position ${index + 1} löschen`, `Delete item ${index + 1}`)} onPress={onDelete} color={colors.danger} size={20} testID={`line-delete-${index}`} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  steps: {
    flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border, paddingHorizontal: space[2],
  },
  step: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space[2], minHeight: touch + 8, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  stepActive: { borderBottomColor: colors.brandText },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  stepNumberActive: { backgroundColor: colors.brand },
  stepNumberError: { backgroundColor: colors.dangerFill },
  stepLabel: { fontWeight: '600' },
  lineCard: { padding: 0, overflow: 'hidden' },
  lineMain: { padding: space[4], gap: 2 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineActions: {
    flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    backgroundColor: colors.neutral[25],
  },
}));
