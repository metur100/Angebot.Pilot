import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadow, space, touch } from '@/theme';

import type { IconName } from './Button';
import { Text } from './Text';

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export interface PressableCardProps {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  showChevron?: boolean;
}

export function PressableCard({ children, onPress, accessibilityLabel, accessibilityHint, style, testID, showChevron = true }: PressableCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.card, styles.row, pressed ? styles.pressed : null, style]}
    >
      <View style={styles.flex}>{children}</View>
      {showChevron ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </Text>
      {action}
    </View>
  );
}

export function KeyValue({ label, value, strong, testID }: { label: string; value: ReactNode; strong?: boolean; testID?: string }) {
  return (
    <View style={styles.kv} testID={testID}>
      <Text variant="caption" tone="secondary" style={styles.kvLabel}>
        {label}
      </Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant={strong ? 'bodyStrong' : 'body'} style={styles.kvValue} selectable>
          {value}
        </Text>
      ) : (
        <View style={styles.kvValueBox}>{value}</View>
      )}
    </View>
  );
}

export function Divider({ spaced }: { spaced?: boolean }) {
  return <View style={[styles.divider, spaced ? styles.dividerSpaced : null]} />;
}

export interface ListRowProps {
  icon?: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  accessibilityHint?: string;
  testID?: string;
  disabled?: boolean;
  external?: boolean;
}

/** A settings-style row (≥ 48 pt) with icon, label, optional value and chevron. */
export function ListRow({ icon, label, value, onPress, destructive, accessibilityHint, testID, disabled, external }: ListRowProps) {
  const color = destructive ? colors.danger : colors.text;
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={22} color={destructive ? colors.danger : colors.textSecondary} /> : null}
      <View style={styles.flex}>
        <Text variant="body" style={{ color }}>
          {label}
        </Text>
        {value ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={18} color={colors.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.listRow, pressed ? styles.pressed : null, disabled ? { opacity: 0.5 } : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space[4],
    ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pressed: { backgroundColor: colors.surfaceMuted },
  flex: { flex: 1, minWidth: 0 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: space[6], marginBottom: space[2], minHeight: 28,
  },
  sectionTitle: { letterSpacing: 0.6 },
  kv: { paddingVertical: space[2], gap: 2 },
  kvLabel: {},
  kvValue: {},
  kvValueBox: { marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerSpaced: { marginVertical: space[2] },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: Math.max(touch, 52),
    paddingVertical: space[2], paddingHorizontal: space[4], backgroundColor: colors.surface,
  },
});
