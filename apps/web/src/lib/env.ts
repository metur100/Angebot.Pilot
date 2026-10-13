const trimSlash = (value: string) => value.replace(/\/+$/, '');

/** Origin of the AngebotPilot API (without /api/v1). */
export const API_BASE_URL = trimSlash(
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://angebotpilot.runasp.net' : 'http://localhost:5080'),
);

/** Marketing/legal site. Always ends with a slash. */
export const LANDING_URL = `${trimSlash(import.meta.env.VITE_LANDING_URL || 'https://metur100.github.io/Angebot.Pilot.Landing')}/`;

export const legalLinks = {
  home: LANDING_URL,
  impressum: `${LANDING_URL}impressum.html`,
  datenschutz: `${LANDING_URL}datenschutz.html`,
  agb: `${LANDING_URL}agb.html`,
  preise: `${LANDING_URL}#preise`,
} as const;

export const USE_MOCKS = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';

/** Absolute URL of a hash route of this app, e.g. appUrl('/q/abc') → https://…/Angebot.Pilot.App/#/q/abc */
export function appUrl(hashPath: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}`;
}
