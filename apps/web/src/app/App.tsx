import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@/lib/queryClient';
import { LocaleBoundary, LocaleProvider } from '@/lib/i18n';
import { AuthProvider } from './auth';
import { createAppRouter } from './router';

export function App({ queryClient: providedClient }: { queryClient?: QueryClient }) {
  const [queryClient] = useState(() => providedClient ?? createQueryClient());
  const [router] = useState(createAppRouter);
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          {/* Re-renders all pages in the new language; auth, router state and the query cache are kept. */}
          <LocaleBoundary>
            <RouterProvider router={router} />
          </LocaleBoundary>
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
