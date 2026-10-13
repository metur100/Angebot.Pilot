import type { ColorScheme } from '@angebotpilot/brand';

function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1]!;
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio of two hex colours, or null when one cannot be parsed. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG relative luminance contrast of a hex colour against white. */
export function contrastWithWhite(hex: string): number | null {
  return contrastRatio(hex, '#FFFFFF');
}

/** Brand colour usable as a background for white text (WCAG AA), otherwise the AngebotPilot brand blue. */
export function readableBrandColor(hex: string | null | undefined): string {
  const contrast = hex ? contrastWithWhite(hex) : null;
  return contrast !== null && contrast >= 4.5 ? hex! : '#2F45D8';
}

/** Surface colour behind text in each theme (--ap-neutral-0) and the fallback text colours (--ap-brand-700). */
const surface: Record<ColorScheme, string> = { light: '#FFFFFF', dark: '#171B23' };
const fallbackText: Record<ColorScheme, string> = { light: '#2537B0', dark: '#A3B0FF' };

/** Brand colour usable as a text colour on the page surface of the given theme (WCAG AA), otherwise the app blue. */
export function readableBrandTextColor(hex: string | null | undefined, scheme: ColorScheme): string {
  const contrast = hex ? contrastRatio(hex, surface[scheme]) : null;
  return contrast !== null && contrast >= 4.5 ? hex! : fallbackText[scheme];
}
