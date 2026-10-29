import { AuthProvider } from '@features/auth/ui';
import { SubscriptionProvider } from '@features/subscriptions/SubscriptionProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><SubscriptionProvider>{children}</SubscriptionProvider></AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
