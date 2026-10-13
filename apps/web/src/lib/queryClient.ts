import { ApiError, NetworkError } from '@angebotpilot/api-contracts';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { networkStatus } from './networkStatus';

function trackNetwork(error: unknown) {
  if (error instanceof NetworkError) networkStatus.setApiUnreachable(true);
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: trackNetwork,
      onSuccess: () => networkStatus.setApiUnreachable(false),
    }),
    mutationCache: new MutationCache({
      onError: trackNetwork,
      onSuccess: () => networkStatus.setApiUnreachable(false),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof NetworkError) return failureCount < 2;
          if (error instanceof ApiError) return error.status >= 500 && failureCount < 1;
          return false;
        },
      },
      mutations: { retry: false },
    },
  });
}
