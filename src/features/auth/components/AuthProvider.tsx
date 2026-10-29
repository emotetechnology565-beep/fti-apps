import { setPriceAccess } from '@shared/lib/price-access';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase-client';
import { activateWorkspace } from '@core/state/workspace-store';
import { loadIdentity } from '../services/identity-api';
import type { Identity } from '../model/identity';
type AuthState = {
  session: Session | null;
  ready: boolean;
  identity: Identity | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const lastUser = useRef<string|null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(!supabase);
  const [workspaceOwner, setWorkspaceOwner] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let receivedEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      receivedEvent = true;
      if(lastUser.current !== (next?.user.id ?? null)) { setPriceAccess(null); setWorkspaceOwner(null);lastUser.current=next?.user.id ?? null; }

      setSession(next);
      setInitialized(true);
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive || receivedEvent) return;
        if (error) setFailure('Session could not be restored. Sign in again.');
        setSession(data.session);
        setInitialized(true);
      })
      .catch(() => {
        if (alive) {
          setFailure('Session could not be restored. Sign in again.');
          setInitialized(true);
        }
      });
    if (Platform.OS !== 'web' && AppState.currentState === 'active')
      supabase.auth.startAutoRefresh();
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') {
        if (state === 'active') supabase?.auth.startAutoRefresh();
        else supabase?.auth.stopAutoRefresh();
      }
      if (state === 'active')
        void client.invalidateQueries({ queryKey: ['identity'] });
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
      lifecycle.remove();
    };
  }, [client]);
  const owner = session?.user.id ?? 'guest';
  useEffect(() => {
    if (!initialized) return;
    let alive = true;
    client.clear();
    activateWorkspace(session?.user.id ?? null)
      .then(() => {
        if (alive) {
          setFailure(null);
          setWorkspaceOwner(owner);
        }
      })
      .catch(() => {
        if (alive)
          setFailure(
            'Could not open local workspace. Restart the app to retry.',
          );
      });
    return () => {
      alive = false;
    };
  }, [initialized, owner, client, session?.user.id]);
  const ready = initialized && workspaceOwner === owner;
  const identity = useQuery({
    queryKey: ['identity', session?.user.id],
    queryFn: loadIdentity,
    enabled: ready && !!session,
    staleTime: 0,
    retry: false,
    refetchInterval: 60000,
  });
  const signOut = async () => {
    setPriceAccess(null);
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    client.clear();
    setSession(null);
  };
  return (
    <AuthContext.Provider
      value={{
        session,
        ready,
        identity: identity.data ?? null,
        loading: !!session && identity.isPending,
        error: failure ?? identity.error?.message ?? null,
        refresh: () => identity.refetch(),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('AuthProvider missing');
  return state;
}
