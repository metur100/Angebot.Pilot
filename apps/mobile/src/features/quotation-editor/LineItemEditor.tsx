// Focused bottom-sheet editor for one quotation line. Numbers are typed in German notation ("1.234,56") and parsed
// with parseGermanNumber; validation mirrors lineItemSchema.
import {
  calculateLine, formatEur, formatPercent, lineItemSchema, unitSuggestions,
  type LineItemForm, type TaxMode, type TaxRateDto,
} from '@angebotpilot/api-contracts';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { SelectField, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { fromInput, roundTo, toInput, toMoneyInput } from '@/lib/numbers';
import { colors, radius, space } from '@/theme';

interface Draft {
  title: string;
  description: string;
  quantity: string;
  unit: string;
  unitPriceNet: string;
  discountPercent: string;
  taxRatePercent: string;
}

type Errors = Partial<Record<keyof Draft, string>>;

function toDraft(item: LineItemForm | null, defaultTaxRate: number): Draft {
  return {
    title: item?.title ?? '',
    description: item?.description ?? '',
    quantity: item ? toInput(item.quantity) : '1',
    unit: item?.unit ?? 'Stk.',
    unitPriceNet: item ? toMoneyInput(item.unitPriceNet) : '',
    discountPercent: item && item.discountPercent ? toInput(item.discountPercent) : '',
    taxRatePercent: String(item?.taxRatePercent ?? defaultTaxRate),
  };
}

export function validateDraft(draft: Draft): { value?: LineItemForm; errors: Errors } {
  const errors: Errors = {};
  const quantity = fromInput(draft.quantity);
  const price = fromInput(draft.unitPriceNet);
  const discount = fromInput(draft.discountPercent) ?? 0;
  const tax = Number(draft.taxRatePercent);
  if (quantity === null) errors.quantity = 'Bitte Menge angeben.';
  else if (Number.isNaN(quantity)) errors.quantity = 'Bitte eine Zahl eingeben, z. B. 2,5.';
  if (price === null) errors.unitPriceNet = 'Bitte Preis angeben.';
  else if (Number.isNaN(price)) errors.unitPriceNet = 'Bitte einen Betrag eingeben, z. B. 1.234,56.';
  if (Number.isNaN(discount)) errors.discountPercent = 'Bitte eine Zahl eingeben.';
  if (Object.keys(errors).length) return { errors };

  const candidate = {
    title: draft.title,
    description: draft.description,
    quantity: roundTo(quantity!, 3),
    unit: draft.unit,
    unitPriceNet: roundTo(price!, 2),
    discountPercent: roundTo(discount, 2),
    taxRatePercent: Number.isNaN(tax) ? 0 : tax,
  };
  const parsed = lineItemSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof Draft;
      if (!errors[key]) errors[key] = issue.message;
    }
    return { errors };
  }
  return { value: { ...parsed.data, description: parsed.data.description ?? '' }, errors };
}

export interface LineItemEditorProps {
  visible: boolean;
  item: LineItemForm | null;
  position: number;
  taxMode: TaxMode;
  taxRates: TaxRateDto[];
  defaultTaxRate: number;
  onClose: () => void;
  onSave: (item: LineItemForm) => void;
}

/** Mounted only while open, so every opening starts from the line's current values. */
export function LineItemEditor(props: LineItemEditorProps) {
  return props.visible ? <LineItemEditorContent {...props} /> : null;
}

function LineItemEditorContent({ visible, item, position, taxMode, taxRates, defaultTaxRate, onClose, onSave }: LineItemEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item, defaultTaxRate));
  const [errors, setErrors] = useState<Errors>({});
  const quantityRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const q = fromInput(draft.quantity);
  const p = fromInput(draft.unitPriceNet);
  const disc = fromInput(draft.discountPercent) ?? 0;
  const preview = q !== null && p !== null && !Number.isNaN(q) && !Number.isNaN(p) && !Number.isNaN(disc) ? calculateLine(q, p, disc) : null;

  const rateOptions = taxRates
    .filter((r) => !r.isArchived || String(r.ratePercent) === draft.taxRatePercent)
    .map((r) => ({ value: String(r.ratePercent), label: formatPercent(r.ratePercent), description: r.name }));
  if (!rateOptions.some((o) => o.value === draft.taxRatePercent)) {
    rateOptions.push({ value: draft.taxRatePercent, label: formatPercent(Number(draft.taxRatePercent)), description: 'nicht mehr aktiver Satz' });
  }

  const save = () => {
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (result.value) onSave(result.value);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={item ? `Position ${position} bearbeiten` : `Neue Position ${position}`}
      testID="line-editor"
      footer={
        <View style={styles.footer}>
          {preview ? (
            <View style={styles.preview} accessibilityLabel={`Positionsbetrag netto ${formatEur(preview.net)}`}>
              <Text variant="caption" tone="secondary">
                Betrag netto{preview.discount > 0 ? ` (nach ${formatEur(preview.discount)} Rabatt)` : ''}
              </Text>
              <Text variant="heading" testID="line-preview">
                {formatEur(preview.net)}
              </Text>
            </View>
          ) : null}
          <View style={styles.buttons}>
            <Button label="Abbrechen" variant="outline" onPress={onClose} style={styles.flex} />
            <Button label="Übernehmen" icon="checkmark" onPress={save} style={styles.flex} testID="line-save" />
          </View>
        </View>
      }
    >
      <TextField
        label="Bezeichnung"
        value={draft.title}
        onChangeText={set('title')}
        error={errors.title}
        required
        returnKeyType="next"
        onSubmitEditing={() => quantityRef.current?.focus()}
        testID="line-title"
      />
      <TextField
        label="Beschreibung (optional)"
        value={draft.description}
        onChangeText={set('description')}
        error={errors.description}
        multiline
        testID="line-description"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            ref={quantityRef}
            label="Menge"
            value={draft.quantity}
            onChangeText={set('quantity')}
            error={errors.quantity}
            keyboardType="decimal-pad"
            required
            testID="line-quantity"
          />
        </View>
        <View style={styles.flex}>
          <TextField label="Einheit" value={draft.unit} onChangeText={set('unit')} error={errors.unit} required testID="line-unit" />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.units} keyboardShouldPersistTaps="handled">
        {unitSuggestions.map((u) => (
          <Pressable
            key={u}
            accessibilityRole="button"
            accessibilityLabel={`Einheit ${u}`}
            accessibilityState={{ selected: draft.unit === u }}
            onPress={() => set('unit')(u)}
            style={[styles.unit, draft.unit === u ? styles.unitActive : null]}
          >
            <Text variant="caption" tone={draft.unit === u ? 'brand' : 'secondary'}>
              {u}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <TextField
        ref={priceRef}
        label="Einzelpreis netto (€)"
        value={draft.unitPriceNet}
        onChangeText={set('unitPriceNet')}
        error={errors.unitPriceNet}
        keyboardType="decimal-pad"
        placeholder="0,00"
        required
        testID="line-price"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Rabatt (%)"
            value={draft.discountPercent}
            onChangeText={set('discountPercent')}
            error={errors.discountPercent}
            keyboardType="decimal-pad"
            placeholder="0"
            testID="line-discount"
          />
        </View>
        <View style={styles.flex}>
          {taxMode === 'Standard' ? (
            <SelectField
              label="USt.-Satz"
              value={draft.taxRatePercent}
              options={rateOptions}
              onChange={set('taxRatePercent')}
              error={errors.taxRatePercent}
              testID="line-tax"
            />
          ) : (
            <View style={styles.noTax}>
              <Text variant="label" tone="secondary">
                USt.-Satz
              </Text>
              <Text variant="caption" tone="muted">
                {taxMode === 'SmallBusiness' ? 'entfällt (§ 19 UStG)' : 'entfällt (§ 13b UStG)'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space[3] },
  units: { gap: space[2] },
  unit: {
    minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[3],
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  unitActive: { borderColor: colors.brandBorder, backgroundColor: colors.brandSoft },
  noTax: { gap: space[1], paddingTop: 2 },
  footer: { gap: space[2] },
  preview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  buttons: { flexDirection: 'row', gap: space[3] },
});
