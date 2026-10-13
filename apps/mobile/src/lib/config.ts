import Constants from 'expo-constants';

interface Extra {
  apiBaseUrl?: string;
  publicAppUrl?: string;
  legalBaseUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** API origin without /api/v1. Configured via EXPO_PUBLIC_API_BASE_URL at build time (see app.config.ts). */
export const API_BASE_URL = (extra.apiBaseUrl ?? 'https://angebotpilot.runasp.net').replace(/\/+$/, '');

export const PUBLIC_APP_URL = extra.publicAppUrl ?? 'https://metur100.github.io/Angebot.Pilot.App';

const LEGAL_BASE_URL = extra.legalBaseUrl ?? 'https://metur100.github.io/Angebot.Pilot.Landing';

export const legalUrls = {
  privacy: `${LEGAL_BASE_URL}/datenschutz.html`,
  terms: `${LEGAL_BASE_URL}/agb.html`,
  imprint: `${LEGAL_BASE_URL}/impressum.html`,
} as const;

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
