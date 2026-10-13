import { publicQuotationPath } from '@/lib/links';

/**
 * Rewrites incoming system links before Expo Router handles them:
 *  angebotpilot://q/<token> and https://…/#/q/<token> → /q/<token> (public quotation screen).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return publicQuotationPath(path) ?? path;
  } catch {
    return '/';
  }
}
