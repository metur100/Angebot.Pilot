import { ApiError, NetworkError } from '@angebotpilot/api-contracts';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NetworkError) return failureCount < 2;
  if (error instanceof ApiError) return error.status >= 500 && failureCount < 1;
  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: shouldRetry, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

let wired = false;

/** Connects React Query to app focus (AppState) and connectivity (expo-network). Call once at startup. */
export function wireQueryClientToDevice(): () => void {
  if (wired) return () => undefined;
  wired = true;
  const onAppState = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  };
  const appStateSub = AppState.addEventListener('change', onAppState);
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected !== false);
    });
    return () => sub.remove();
  });
  return () => {
    appStateSub.remove();
    wired = false;
  };
}
