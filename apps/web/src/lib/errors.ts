import { ApiError, errorMessage as baseErrorMessage, NetworkError } from '@angebotpilot/api-contracts';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/** HTTP 402 codes returned when the subscription does not cover an action. */
export const planLimitMessages: Record<string, string> = {
  subscription_inactive:
    'Ihr Testzeitraum bzw. Abonnement ist abgelaufen. Bitte wählen Sie unter Einstellungen → Abo einen Tarif, um weiterzuarbeiten.',
  member_limit: 'Ihr Tarif erlaubt keine weiteren aktiven Teammitglieder. Wechseln Sie in einen größeren Tarif, um weitere Personen einzuladen.',
  quotation_limit: 'Das monatliche Angebotskontingent Ihres Tarifs ist ausgeschöpft. Wechseln Sie den Tarif oder warten Sie bis zum nächsten Monat.',
  email_limit: 'Das tägliche E-Mail-Kontingent Ihres Tarifs ist erreicht. Versuchen Sie es morgen erneut oder wechseln Sie den Tarif.',
};

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail versendet werden.';

export const isPlanLimit = (error: unknown): error is ApiError => error instanceof ApiError && error.status === 402;
export const isEmailNotVerified = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === 'email_not_verified';

/** An error whose message is already a German, user-facing text. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** German, user-facing message for any error (extends the contracts helper with plan limits). */
export function errorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 402) {
      return (error.code && planLimitMessages[error.code]) ?? error.problem.detail ?? planLimitMessages.subscription_inactive!;
    }
    if (error.code === 'email_not_verified') return EMAIL_NOT_VERIFIED_MESSAGE;
  }
  return baseErrorMessage(error);
}

export const isConflict = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 409 && error.code === 'concurrency_conflict';
export const isForbidden = (error: unknown): error is ApiError => error instanceof ApiError && error.status === 403;
export const isNotFound = (error: unknown): error is ApiError => error instanceof ApiError && error.status === 404;
export const isNetworkError = (error: unknown): error is NetworkError => error instanceof NetworkError;

/** "lineItems[0].quantity" → "lineItems.0.quantity" (react-hook-form path syntax). Leading capitals are lowered. */
export function toFormPath(serverKey: string): string {
  return serverKey
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toLowerCase() + segment.slice(1))
    .join('.');
}

/**
 * Maps RFC 7807 field errors onto react-hook-form fields.
 * Returns the messages that could not be attached to a known field (to be shown as a general error).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string[] {
  if (!(error instanceof ApiError)) return [];
  const unmatched: string[] = [];
  let first = true;
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const path = toFormPath(key);
    const root = path.split('.')[0] ?? '';
    const message = messages.join(' ');
    if (path && knownFields.includes(root)) {
      setError(path as Path<T>, { type: 'server', message }, { shouldFocus: first });
      first = false;
    } else {
      unmatched.push(message);
    }
  }
  return unmatched;
}

/** Whether an ApiError carries field errors. */
export function hasFieldErrors(error: unknown): boolean {
  return error instanceof ApiError && Object.keys(error.fieldErrors).length > 0;
}
