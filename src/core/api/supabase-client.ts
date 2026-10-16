import { createClient, processLock } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { authStorage } from './auth-storage';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: authStorage,
          storageKey: 'fti-auth-v2',
          lock: processLock,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
