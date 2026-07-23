import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';

// Clear stale token and redirect to login on any 401
const handle401 = (error: unknown) => {
  if ((error as any)?.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('blvd-auth-token');
    localStorage.removeItem('blvd-user');
    window.location.href = '/admin/login';
  }
};

// Singleton client — defined outside useState so it's never recreated
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handle401 }),
  mutationCache: new MutationCache({ onError: handle401 }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      // Don't retry 401s — they will never succeed with the current token
      retry: (failureCount, error) => (error as any)?.status !== 401 && failureCount < 3,
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
