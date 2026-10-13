// Design tokens. Colours depend on the colour scheme (light/dark) and are only available through the theme context
// (ThemeProvider / useTheme / makeStyles); spacing, radii, type and touch sizes are static.
import {
  colors as lightPalette, darkColors as darkPalette, minTouchTarget, onBrand, radii, spacing, typeScale, type ColorScheme,
} from '@angebotpilot/brand';
import type { Tone } from '@angebotpilot/api-contracts';

type Palette = { [K in keyof typeof lightPalette]: { [P in keyof (typeof lightPalette)[K]]: string } };

function buildColors(palette: Palette, scheme: ColorScheme) {
  const dark = scheme === 'dark';
  return {
    /** Filled brand surfaces (primary buttons, FAB, checked controls) – always with `onBrand` content. */
    brand: palette.brand[600],
    /** Pressed state of filled brand surfaces. */
    brandPressed: dark ? palette.brand[300] : palette.brand[700],
    /** Brand-coloured text and icons on normal surfaces (links, tints, active tabs). */
    brandText: dark ? palette.brand[700] : palette.brand[600],
    /** Strong brand text on `brandSoft` backgrounds. */
    brandDark: palette.brand[700],
    brandSoft: palette.brand[50],
    brandBorder: palette.brand[200],
    background: palette.neutral[50],
    surface: palette.neutral[0],
    surfaceMuted: palette.neutral[100],
    border: palette.neutral[200],
    borderStrong: palette.neutral[300],
    text: palette.neutral[900],
    textSecondary: palette.neutral[600],
    textMuted: palette.neutral[500],
    placeholder: palette.neutral[400],
    onBrand,
    /** Danger text/icons on surfaces. */
    danger: palette.danger.text,
    /** Filled danger surfaces (destructive buttons, count badges) with `onBrand` content. */
    dangerFill: dark ? palette.danger.solid : palette.danger.text,
    dangerPressed: dark ? palette.danger.border : '#912018',
    dangerSoft: palette.danger.bg,
    success: palette.success.text,
    warning: palette.warning.text,
    overlay: dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(20, 24, 33, 0.45)',
    skeleton: palette.neutral[200],
    /** Toasts: a dark chip in both schemes (light text). */
    inverseSurface: dark ? palette.neutral[200] : palette.neutral[800],
    /** Paper-white background for document previews (documents stay white in dark mode). */
    paper: lightPalette.neutral[0],
    paperText: lightPalette.neutral[900],
    paperTextSecondary: lightPalette.neutral[600],
    paperBorder: lightPalette.neutral[200],
    /** Camera scanner: black backdrop and scrim behind light text, in both schemes. */
    camera: '#000000',
    cameraScrim: 'rgba(0, 0, 0, 0.45)',
    neutral: palette.neutral,
    palette,
  } as const;
}

export type ThemeColors = ReturnType<typeof buildColors>;
export type ToneColors = Record<Tone, { bg: string; border: string; text: string }>;

function buildToneColors(palette: Palette): ToneColors {
  return {
    neutral: { bg: palette.neutral[100], border: palette.neutral[300], text: palette.neutral[700] },
    info: palette.info,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    muted: palette.muted,
  };
}

function buildShadow(scheme: ColorScheme) {
  // Dark surfaces rely on borders; shadows are barely visible there and would only muddy the edges.
  const dark = scheme === 'dark';
  return {
    card: dark
      ? { shadowColor: '#000000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 }
      : { shadowColor: '#101828', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    raised: {
      shadowColor: dark ? '#000000' : '#101828',
      shadowOpacity: dark ? 0.5 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      elevation: 8,
    },
  } as const;
}

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  toneColors: ToneColors;
  shadow: ReturnType<typeof buildShadow>;
}

function buildTheme(scheme: ColorScheme): Theme {
  const palette: Palette = scheme === 'dark' ? darkPalette : lightPalette;
  return { scheme, colors: buildColors(palette, scheme), toneColors: buildToneColors(palette), shadow: buildShadow(scheme) };
}

export const themes: Record<ColorScheme, Theme> = { light: buildTheme('light'), dark: buildTheme('dark') };

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
