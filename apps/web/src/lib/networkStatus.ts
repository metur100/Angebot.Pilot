import { useSyncExternalStore } from 'react';

/** Tracks whether the API is reachable (last request failed with a NetworkError) or the browser is offline. */
type Listener = () => void;
export type NetworkState = 'online' | 'offline' | 'unreachable';

let apiUnreachable = false;
let browserOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export const networkStatus = {
  setApiUnreachable(value: boolean) {
    if (apiUnreachable === value) return;
    apiUnreachable = value;
    emit();
  },
  setBrowserOffline(value: boolean) {
    if (browserOffline === value) return;
    browserOffline = value;
    emit();
  },
  getSnapshot: (): NetworkState => {
    if (browserOffline) return 'offline';
    return apiUnreachable ? 'unreachable' : 'online';
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => networkStatus.setBrowserOffline(false));
  window.addEventListener('offline', () => networkStatus.setBrowserOffline(true));
}

const serverSnapshot = (): NetworkState => 'online';

export function useNetworkStatus(): NetworkState {
  return useSyncExternalStore(networkStatus.subscribe, networkStatus.getSnapshot, serverSnapshot);
}
