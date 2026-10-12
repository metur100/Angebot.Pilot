// AngebotPilot design tokens. Single source of truth for colours, type, spacing, radii and elevation.
// tokens.css exposes the same values as CSS custom properties for the web app and landing site.

export const colors = {
  brand: {
    50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC', 400: '#7C8CF8',
    500: '#4F63F0', 600: '#2F45D8', 700: '#2537B0', 800: '#1F2E8A', 900: '#1C296E',
  },
  neutral: {
    0: '#FFFFFF', 25: '#FBFCFD', 50: '#F6F7F9', 100: '#EEF0F3', 200: '#E2E5EA', 300: '#CDD2DA',
    400: '#9AA3B2', 500: '#6B7485', 600: '#4D5566', 700: '#363D4B', 800: '#232833', 900: '#141821',
  },
  success: { bg: '#ECFDF3', border: '#ABEFC6', text: '#067647', solid: '#12B76A' },
  warning: { bg: '#FFFAEB', border: '#FEDF89', text: '#B54708', solid: '#F79009' },
  danger: { bg: '#FEF3F2', border: '#FECDCA', text: '#B42318', solid: '#F04438' },
  info: { bg: '#EEF2FF', border: '#C7D2FE', text: '#2537B0', solid: '#2F45D8' },
  muted: { bg: '#F2F4F7', border: '#E2E5EA', text: '#4D5566', solid: '#98A2B3' },
} as const;

export const brandColor = colors.brand[600];

export const fonts = {
  family: 'Inter',
  /** Inter (SIL OFL 1.1), self-hosted. No external font CDNs (privacy). */
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

/** Type scale in px: [fontSize, lineHeight]. */
export const typeScale = {
  xs: [12, 16], sm: [14, 20], md: [16, 24], lg: [18, 28], xl: [20, 30], '2xl': [24, 32], '3xl': [30, 38], '4xl': [36, 44],
} as const;

/** 4-px spacing scale. */
export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const radii = { sm: 6, md: 8, lg: 12, xl: 16, full: 999 } as const;

export const elevation = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 2px 4px -2px rgba(16, 24, 40, 0.06), 0 4px 8px -2px rgba(16, 24, 40, 0.10)',
  lg: '0 12px 16px -4px rgba(16, 24, 40, 0.08), 0 4px 6px -2px rgba(16, 24, 40, 0.03)',
} as const;

export const focusRing = { color: colors.brand[500], width: 3, offset: 2 } as const;

/** Minimum touch target (WCAG 2.5.8 / platform guidelines). */
export const minTouchTarget = 44;
