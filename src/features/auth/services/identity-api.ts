import { supabase } from '@core/api/supabase-client';
import type { Identity } from '../model/identity';
import { identityErrorMessage } from './identity-error';
import { readIdentityResponse } from './identity-response';
export async function identityRpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error('Sign-in is not configured.');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Sign-in is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error('Your session could not be verified. Sign in again and complete staff verification.');
  }
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/Identity`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation: name, arguments: args ?? {} }),
    });
  } catch {
    throw new Error(await identityErrorMessage({ name: 'FunctionsFetchError' }));
  }
  return readIdentityResponse<T>(response, name);
}
export const loadIdentity = () => identityRpc<Identity>('fti_identity_me');
