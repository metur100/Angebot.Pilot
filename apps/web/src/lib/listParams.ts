import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * List filters kept in the URL (?q=…&page=2) so that reloads, back navigation and shared links keep them.
 * Default values are omitted from the URL.
 */
export function useListParams<T extends { [K in keyof T]: string }>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = params.get(key as string);
      if (value !== null) result[key] = value as T[keyof T];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults are static per page
  }, [params]);

  const update = useCallback(
    (patch: Partial<T>, options: { resetPage?: boolean } = { resetPage: true }) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const defaultValues: Record<string, string> = defaults;
          for (const [key, value] of Object.entries<string | undefined>(patch)) {
            if (value === undefined || value === '' || value === defaultValues[key]) next.delete(key);
            else next.set(key, value);
          }
          if (options.resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults are static per page
    [setParams],
  );

  return [values, update] as const;
}

/** Builds the API list query from URL state; empty values are dropped. Exported for unit tests. */
export function compactQuery<T extends Record<string, unknown>>(query: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(query) as [keyof T, T[keyof T]][]) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    result[key] = value;
  }
  return result;
}
