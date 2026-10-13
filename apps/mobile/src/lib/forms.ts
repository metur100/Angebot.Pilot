import { ApiError, errorMessage } from '@angebotpilot/api-contracts';
import * as WebBrowser from 'expo-web-browser';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Maps RFC 7807 field errors (camelCase keys) onto react-hook-form fields.
 * Returns a general message for everything that could not be attached to a field (or null).
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]): string | null {
  if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
    const unmatched: string[] = [];
    for (const [key, messages] of Object.entries(error.fieldErrors)) {
      const field = fields.find((f) => f.toLowerCase() === key.toLowerCase());
      const message = messages[0] ?? 'Ungültiger Wert.';
      if (field) setError(field as Path<T>, { type: 'server', message });
      else unmatched.push(message);
    }
    return unmatched.length ? unmatched.join('\n') : null;
  }
  return errorMessage(error);
}

/** Converts optional form strings to null for the API. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function openExternal(url: string) {
  return WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true }).catch(() => undefined);
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'concurrency_conflict';
}
