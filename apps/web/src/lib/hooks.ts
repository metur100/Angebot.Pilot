import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

/** Sets document.title as "<title> · AngebotPilot". */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · AngebotPilot` : 'AngebotPilot';
  }, [title]);
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

const objectUrls = new WeakMap<Blob, string>();

/**
 * Object URL for a blob (e.g. an authenticated logo download). URLs are cached per blob instance, so the same
 * blob always maps to one URL; they are released with the page (blobs here are small images).
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  return useMemo(() => {
    if (!blob) return null;
    let url = objectUrls.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      objectUrls.set(blob, url);
    }
    return url;
  }, [blob]);
}

/** Copies text to the clipboard; resolves false when the browser refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
