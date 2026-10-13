import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { colors, font } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'small';
type Tone = 'default' | 'secondary' | 'muted' | 'brand' | 'danger' | 'success' | 'warning' | 'inverse';

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
}

const toneColor: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  brand: colors.brand,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  inverse: colors.onBrand,
};

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[styles[variant], { color: toneColor[tone] }, align ? { textAlign: align } : null, style]} />;
}

const styles = StyleSheet.create({
  display: { ...font.xxxl, fontWeight: '700', letterSpacing: -0.5 },
  title: { ...font.xxl, fontWeight: '700', letterSpacing: -0.3 },
  heading: { ...font.lg, fontWeight: '600' },
  subheading: { ...font.md, fontWeight: '600' },
  body: { ...font.md },
  bodyStrong: { ...font.md, fontWeight: '600' },
  caption: { ...font.sm },
  label: { ...font.sm, fontWeight: '600' },
  small: { ...font.xs },
});
