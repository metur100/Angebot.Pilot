import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, radius, space, touch, useTheme, type ThemeColors } from '@/theme';

import { Text } from './Text';

export type IconName = ComponentProps<typeof Ionicons>['name'];
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const variantStyle = (colors: ThemeColors): Record<Variant, { bg: string; fg: string; border: string; pressed: string }> => ({
  primary: { bg: colors.brand, fg: colors.onBrand, border: colors.brand, pressed: colors.brandPressed },
  secondary: { bg: colors.brandSoft, fg: colors.brandDark, border: colors.brandSoft, pressed: colors.brandBorder },
  outline: { bg: colors.surface, fg: colors.text, border: colors.borderStrong, pressed: colors.surfaceMuted },
  ghost: { bg: 'transparent', fg: colors.brandText, border: 'transparent', pressed: colors.brandSoft },
  danger: { bg: colors.dangerFill, fg: colors.onBrand, border: colors.dangerFill, pressed: colors.dangerPressed },
  dangerOutline: { bg: colors.surface, fg: colors.danger, border: colors.palette.danger.border, pressed: colors.dangerSoft },
});

export function Button({
  label, onPress, variant = 'primary', icon, loading, disabled, size = 'md', fullWidth = true,
  accessibilityLabel, accessibilityHint, testID, style,
}: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const v = variantStyle(colors)[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border },
        fullWidth ? styles.full : null,
        inactive ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={v.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={size === 'sm' ? 18 : 20} color={v.fg} />
        ) : null}
        <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: v.fg }} numberOfLines={2} align="center">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  testID?: string;
  size?: number;
  badge?: number;
}

export function IconButton({ icon, accessibilityLabel, onPress, color, disabled, testID, size = 22, badge }: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [styles.icon, pressed ? { backgroundColor: colors.surfaceMuted } : null, disabled ? styles.disabled : null]}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.text} />
      {badge ? (
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
          <Text variant="small" tone="inverse" style={styles.badgeText}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  base: { borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center', paddingHorizontal: space[4] },
  md: { minHeight: 48, paddingVertical: space[2] },
  sm: { minHeight: 40, paddingVertical: space[1], paddingHorizontal: space[3] },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  disabled: { opacity: 0.5 },
  icon: { minWidth: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  badge: {
    position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.dangerFill,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
}));
