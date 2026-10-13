import { ApiError, type ApiClient } from '@angebotpilot/api-contracts';

import { tokenFromInput } from '@/lib/links';

export type ScanResult =
  | { kind: 'internal'; path: string }
  | { kind: 'public'; path: string }
  | { kind: 'invalid' };

/**
 * Resolves a scanned QR payload (public quotation URL printed on PDFs, deep link or bare token):
 * quotations of the current company open the internal detail, everything else the public quotation screen.
 */
export async function resolveScan(api: Pick<ApiClient, 'quotations'>, companyId: string, data: string): Promise<ScanResult> {
  const token = tokenFromInput(data);
  if (!token) return { kind: 'invalid' };
  try {
    const { quotationId } = await api.quotations.lookupByToken(companyId, { token });
    return { kind: 'internal', path: `/quotation/${quotationId}` };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return { kind: 'public', path: `/q/${token}` };
    }
    throw error;
  }
}
