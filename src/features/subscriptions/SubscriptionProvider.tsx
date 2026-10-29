import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { setPriceAccess } from '@shared/lib/price-access';
import { loadSubscription } from './api';

function useSubscriptionQuery() {
  const auth = useAuth();
  return useQuery({
    queryKey: ['subscription', auth.session?.user.id ?? 'guest'],
    queryFn: loadSubscription,
    enabled: auth.ready,
    staleTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
}
const Context = createContext<ReturnType<typeof useSubscriptionQuery> | null>(
  null,
);
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const query = useSubscriptionQuery();
  const { data, isError, refetch } = query;
  const auth = useAuth();
  const client = useQueryClient();
  const previous = useRef('');
  useEffect(() => {
    const expiry =
      auth.ready && auth.session && !isError && data?.active
        ? data.expires_at
        : null;
    setPriceAccess(expiry);
    const signature = `${auth.session?.user.id ?? ''}:${expiry ?? ''}`;
    if (previous.current !== signature) {
      previous.current = signature;
      void client.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] !== 'subscription' && q.queryKey[0] !== 'identity',
      });
    }
    const remaining = expiry ? Date.parse(expiry) - Date.now() : 0;
    const timer =
      remaining > 0
        ? setTimeout(
            () => {
              setPriceAccess(null);
              void refetch();
            },
            Math.min(remaining, 2147483647),
          )
        : undefined;
    return () => {
      clearTimeout(timer);
      setPriceAccess(null);
    };
  }, [
    auth.ready,
    auth.session,
    data,
    isError,
    client,
    refetch,
  ]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void client.invalidateQueries({ queryKey: ['subscription'] });
    });
    return () => listener.remove();
  }, [client]);
  return <Context.Provider value={query}>{children}</Context.Provider>;
}
export function useSubscription() {
  const value = useContext(Context);
  if (!value) throw new Error('SubscriptionProvider missing');
  return value;
}
