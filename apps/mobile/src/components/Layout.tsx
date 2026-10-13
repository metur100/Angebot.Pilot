import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, space, touch } from '@/theme';

import { Text } from './Text';

/** Keyboard-aware scrolling form/content area: focused inputs are scrolled above the keyboard. */
export function FormScroll({
  children, refreshing, onRefresh, contentStyle, testID, bottomInset = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollView
      testID={testID}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      style={styles.flex}
      contentContainerStyle={[styles.content, bottomInset ? { paddingBottom: space[8] + insets.bottom } : null, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} /> : undefined}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

/** Plain scroll area with pull-to-refresh (no inputs). */
export function ContentScroll({
  children, refreshing, onRefresh, contentStyle, testID,
}: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; contentStyle?: StyleProp<ViewStyle>; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: space[8] + insets.bottom }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

/** Bottom action bar that respects the home indicator / gesture bar. */
export function BottomBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space[3]) }, style]}>{children}</View>;
}

/** Screen container: background colour + offline banner on top. */
export function Screen({ children, style, offlineBanner = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; offlineBanner?: boolean }) {
  return (
    <View style={[styles.screen, style]}>
      {offlineBanner ? <OfflineBanner /> : null}
      {children}
    </View>
  );
}

export function SearchBar({
  value, onChangeText, placeholder, testID,
}: { value: string; onChangeText: (t: string) => void; placeholder: string; testID?: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.searchInput}
        testID={testID}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Suche leeren" onPress={() => onChangeText('')} style={styles.clear}>
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function FilterChips<T extends string>({
  options, value, onChange, accessibilityLabel,
}: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void; accessibilityLabel: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={`Filter ${o.label}`}
            accessibilityState={{ selected: active, checked: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active ? styles.chipActive : null]}
            testID={`chip-${o.value}`}
          >
            {active ? <Ionicons name="checkmark" size={16} color={colors.brandDark} /> : null}
            <Text variant="label" style={{ color: active ? colors.brandDark : colors.textSecondary }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Banner shown while the device is offline, with a retry action that re-checks and refetches. */
export function OfflineBanner() {
  const network = Network.useNetworkState();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  if (network.isConnected !== false) return null;
  const retry = async () => {
    setChecking(true);
    try {
      const state = await Network.getNetworkStateAsync();
      if (state.isConnected) await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setChecking(false);
    }
  };
  return (
    <View style={styles.offline} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="offline-banner">
      <Ionicons name="cloud-offline-outline" size={18} color={colors.palette.warning.text} />
      <Text variant="caption" style={styles.offlineText}>
        Keine Internetverbindung. Anzeigen sind ggf. veraltet, Änderungen werden nicht gespeichert.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Verbindung erneut prüfen" onPress={retry} disabled={checking} style={styles.offlineButton}>
        <Text variant="label" style={{ color: colors.palette.warning.text }}>
          {checking ? '…' : 'Erneut'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[3] },
  bottomBar: {
    backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    paddingHorizontal: space[4], paddingTop: space[3], gap: space[2],
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: space[3], minHeight: 48,
  },
  searchInput: { flex: 1, ...font.md, color: colors.text, paddingVertical: space[2] },
  clear: { minWidth: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center', marginRight: -space[2] },
  chips: { gap: space[2], paddingVertical: space[1], paddingRight: space[4] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: space[3], borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder },
  offline: {
    flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2],
    backgroundColor: colors.palette.warning.bg, borderBottomWidth: 1, borderBottomColor: colors.palette.warning.border,
  },
  offlineText: { flex: 1, color: colors.palette.warning.text },
  offlineButton: { minHeight: touch, minWidth: touch, alignItems: 'center', justifyContent: 'center' },
});
