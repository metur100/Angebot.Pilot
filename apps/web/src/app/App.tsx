import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@/lib/queryClient';
import { AuthProvider } from './auth';
import { createAppRouter } from './router';

export function App({ queryClient: providedClient }: { queryClient?: QueryClient }) {
  const [queryClient] = useState(() => providedClient ?? createQueryClient());
  const [router] = useState(createAppRouter);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
