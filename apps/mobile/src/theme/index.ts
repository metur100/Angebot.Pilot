import { colors as brandColors, minTouchTarget, radii, spacing, typeScale } from '@angebotpilot/brand';
import type { Tone } from '@angebotpilot/api-contracts';

export const colors = {
  brand: brandColors.brand[600],
  brandDark: brandColors.brand[700],
  brandSoft: brandColors.brand[50],
  brandBorder: brandColors.brand[200],
  background: brandColors.neutral[50],
  surface: brandColors.neutral[0],
  surfaceMuted: brandColors.neutral[100],
  border: brandColors.neutral[200],
  borderStrong: brandColors.neutral[300],
  text: brandColors.neutral[900],
  textSecondary: brandColors.neutral[600],
  textMuted: brandColors.neutral[500],
  placeholder: brandColors.neutral[400],
  onBrand: '#FFFFFF',
  danger: brandColors.danger.text,
  dangerSoft: brandColors.danger.bg,
  success: brandColors.success.text,
  warning: brandColors.warning.text,
  overlay: 'rgba(20, 24, 33, 0.45)',
  skeleton: brandColors.neutral[200],
  neutral: brandColors.neutral,
  palette: brandColors,
} as const;

export const toneColors: Record<Tone, { bg: string; border: string; text: string }> = {
  neutral: { bg: brandColors.neutral[100], border: brandColors.neutral[300], text: brandColors.neutral[700] },
  info: brandColors.info,
  success: brandColors.success,
  warning: brandColors.warning,
  danger: brandColors.danger,
  muted: brandColors.muted,
};

export const space = spacing;
export const radius = radii;
export const touch = minTouchTarget;

export const font = {
  xs: { fontSize: typeScale.xs[0], lineHeight: typeScale.xs[1] },
  sm: { fontSize: typeScale.sm[0], lineHeight: typeScale.sm[1] },
  md: { fontSize: typeScale.md[0], lineHeight: typeScale.md[1] },
  lg: { fontSize: typeScale.lg[0], lineHeight: typeScale.lg[1] },
  xl: { fontSize: typeScale.xl[0], lineHeight: typeScale.xl[1] },
  xxl: { fontSize: typeScale['2xl'][0], lineHeight: typeScale['2xl'][1] },
  xxxl: { fontSize: typeScale['3xl'][0], lineHeight: typeScale['3xl'][1] },
} as const;

export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
} as const;
