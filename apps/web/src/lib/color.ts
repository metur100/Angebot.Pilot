/** WCAG relative luminance contrast of a hex colour against white. */
export function contrastWithWhite(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1]!;
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return 1.05 / (luminance + 0.05);
}

/** Brand colour usable as a background for white text (WCAG AA), otherwise the AngebotPilot brand blue. */
export function readableBrandColor(hex: string | null | undefined): string {
  const contrast = hex ? contrastWithWhite(hex) : null;
  return contrast !== null && contrast >= 4.5 ? hex! : '#2F45D8';
}
