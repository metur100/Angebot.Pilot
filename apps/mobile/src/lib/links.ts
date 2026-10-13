import { extractPublicToken } from '@angebotpilot/api-contracts';

/**
 * Normalises any link that points to a public quotation into the in-app route `/q/<token>`.
 * Supported inputs:
 *  - angebotpilot://q/<token>                                       (deep link)
 *  - https://metur100.github.io/Angebot.Pilot.App/#/q/<token>      (link printed as QR code on PDFs / sent by email)
 *  - any https URL containing /q/<token>, or a bare token
 * Returns null when the input does not contain a valid token.
 */
export function publicQuotationPath(input: string | null | undefined): string | null {
  if (!input) return null;
  const token = extractPublicToken(input.replace(/^angebotpilot:\/\//i, '/'));
  return token ? `/q/${token}` : null;
}

export function tokenFromInput(input: string | null | undefined): string | null {
  if (!input) return null;
  return extractPublicToken(input.replace(/^angebotpilot:\/\//i, '/'));
}
