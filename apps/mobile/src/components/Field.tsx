import { formatDate } from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { forwardRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { useLocale } from '@/lib/i18n';
import { font, makeStyles, radius, space, touch, useTheme } from '@/theme';

import { Button } from './Button';
import { OptionSheet, Sheet, type SheetOption } from './Sheet';
import { Text } from './Text';

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const styles = useStyles();
  return (
    <Text variant="label" tone="secondary" style={styles.label}>
      {label}
      {required ? <Text variant="label" tone="danger"> *</Text> : null}
    </Text>
  );
}

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <Text variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
        {error}
      </Text>
    );
  }
  return hint ? (
    <Text variant="caption" tone="muted">
      {hint}
    </Text>
  ) : null;
}

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  secureToggle?: boolean;
  right?: ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, required, secureToggle, right, multiline, secureTextEntry, testID, ...input },
  ref,
) {
  const { colors, scheme } = useTheme();
  const { tr } = useLocale();
  const styles = useStyles();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const isSecure = secureToggle ? hidden : secureTextEntry;
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <View style={[styles.inputBox, focused ? styles.inputFocused : null, error ? styles.inputError : null, multiline ? styles.multilineBox : null]}>
        <TextInput
          ref={ref}
          {...input}
          testID={testID}
          accessibilityLabel={input.accessibilityLabel ?? label}
          accessibilityHint={error ?? hint}
          multiline={multiline}
          secureTextEntry={isSecure}
          placeholderTextColor={colors.placeholder}
          keyboardAppearance={scheme}
          selectionColor={colors.brandText}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[styles.input, multiline ? styles.multiline : null]}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? tr('Passwort anzeigen', 'Show password') : tr('Passwort verbergen', 'Hide password')}
            onPress={() => setHidden((h) => !h)}
            style={styles.adornment}
            testID={testID ? `${testID}-toggle` : undefined}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {right}
      </View>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
});

export function SelectField<T extends string>({
  label, value, options, onChange, error, hint, placeholder: placeholderProp, testID, disabled, sheetTitle,
}: {
  label: string;
  value: T | null | undefined;
  options: SheetOption<T>[];
  onChange: (value: T) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  testID?: string;
  disabled?: boolean;
  sheetTitle?: string;
}) {
  const { colors } = useTheme();
  const { tr } = useLocale();
  const styles = useStyles();
  const placeholder = placeholderProp ?? tr('Bitte wählen', 'Please choose');
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityHint={tr('Öffnet die Auswahl', 'Opens the options')}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.inputBox, styles.selectBox, error ? styles.inputError : null, disabled ? styles.disabled : null]}
        testID={testID}
      >
        <Text variant="body" tone={selected ? 'default' : 'muted'} style={styles.flex} numberOfLines={2}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <OptionSheet visible={open} onClose={() => setOpen(false)} title={sheetTitle ?? label} options={options} selected={value} onSelect={onChange} />
    </View>
  );
}

export function SwitchRow({
  label, description, value, onChange, testID, disabled,
}: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; testID?: string; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      onPress={() => !disabled && onChange(!value)}
      style={styles.switchRow}
      testID={testID}
    >
      <View style={styles.flex}>
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
        thumbColor={colors.onBrand}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export function Checkbox({
  label, checked, onChange, error, testID, children,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; error?: string; testID?: string; children?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.checkboxRow}
        testID={testID}
      >
        <View style={[styles.checkbox, checked ? styles.checkboxChecked : null, error ? styles.inputError : null]}>
          {checked ? <Ionicons name="checkmark" size={18} color={colors.onBrand} /> : null}
        </View>
        <View style={styles.flex}>{children ?? <Text variant="body">{label}</Text>}</View>
      </Pressable>
      <FieldMessage error={error} />
    </View>
  );
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12);
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date field showing dd.MM.yyyy; uses the native date picker (Android dialog / iOS inline calendar in a sheet). */
export function DateField({
  label, value, onChange, error, testID, minimumDate, required, onClear,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  testID?: string;
  minimumDate?: string;
  required?: boolean;
  /** Optional dates: shows a clear button when set. */
  onClear?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { tr, intlTag } = useLocale();
  const styles = useStyles();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => (value ? isoToDate(value) : new Date()));
  const open = () => {
    const current = value ? isoToDate(value) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: minimumDate ? isoToDate(minimumDate) : undefined,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(dateToIso(date));
        },
      });
    } else {
      setDraft(current);
      setIosOpen(true);
    }
  };
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : tr('nicht gesetzt', 'not set')}`}
        accessibilityHint={tr('Öffnet den Kalender', 'Opens the calendar')}
        onPress={open}
        style={[styles.inputBox, styles.selectBox, error ? styles.inputError : null]}
        testID={testID}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
        <Text variant="body" tone={value ? 'default' : 'muted'} style={styles.flex}>
          {value ? formatDate(value) : tr('Datum wählen', 'Choose date')}
        </Text>
        {onClear && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr(`${label} entfernen`, `Clear ${label}`)} onPress={onClear} style={styles.adornment} hitSlop={4}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Pressable>
      <FieldMessage error={error} />
      {Platform.OS === 'ios' ? (
        <Sheet
          visible={iosOpen}
          onClose={() => setIosOpen(false)}
          title={label}
          footer={
            <Button
              label={tr('Übernehmen', 'Apply')}
              onPress={() => {
                onChange(dateToIso(draft));
                setIosOpen(false);
              }}
            />
          }
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display="inline"
            locale={intlTag}
            themeVariant={scheme}
            textColor={colors.text}
            minimumDate={minimumDate ? isoToDate(minimumDate) : undefined}
            onChange={(_e, d) => d && setDraft(d)}
            accentColor={colors.brandText}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options, value, onChange, accessibilityLabel,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; accessibilityLabel: string }) {
  const styles = useStyles();
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active, checked: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active ? styles.segmentActive : null]}
            testID={`segment-${o.value}`}
          >
            <Text variant="label" tone={active ? 'brand' : 'secondary'} align="center">
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  field: { gap: space[1] },
  label: {},
  inputBox: {
    flexDirection: 'row', alignItems: 'center', minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: space[3],
  },
  multilineBox: { alignItems: 'flex-start', paddingVertical: space[2] },
  inputFocused: { borderColor: colors.brandText, borderWidth: 2, paddingHorizontal: space[3] - 1 },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, ...font.md, color: colors.text, paddingVertical: space[2], minHeight: 46 },
  multiline: { minHeight: 96 },
  adornment: { minWidth: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center', marginRight: -space[2] },
  selectBox: { gap: space[2], paddingVertical: space[2] },
  disabled: { opacity: 0.55 },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2] },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: touch, paddingVertical: space[2] },
  checkbox: {
    width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.surface, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingHorizontal: space[2] },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandBorder },
}));
