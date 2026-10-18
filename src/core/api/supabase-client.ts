import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { authStorage } from './auth-storage';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Fast Refresh re-evaluates this module without stopping the previous client's
// refresh timer or BroadcastChannel. Reuse the client for the same configuration.
const runtime = globalThis as typeof globalThis & {
  __ftiAuthClient?: { url: string; key: string; client: SupabaseClient };
};
function configuredClient() {
  if (!url || !key) return null;
  const cached = runtime.__ftiAuthClient;
  if (cached && cached.url === url && cached.key === key) return cached.client;
  cached?.client.auth.dispose();
  const client = createClient(url, key, {
        auth: {
          storage: authStorage,
          storageKey: 'fti-auth-v2',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
  runtime.__ftiAuthClient = { url, key, client };
  return client;
}
export const supabase = configuredClient();
