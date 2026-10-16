import { supabase } from '@core/api/supabase-client';
import type { Identity } from '../model/identity';
export async function identityRpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error('Sign-in is not configured.');
  const { data, error } = await supabase.functions.invoke('Identity', {
    body: { operation: name, arguments: args ?? {} },
  });
  if (error) {
    let message = 'Account service is unavailable. Please try again later.';
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body.message === 'string') message = body.message;
      } catch {
        /* No structured error. */
      }
    }
    throw new Error(message);
  }
  return data.data as T;
}
export const loadIdentity = () => identityRpc<Identity>('fti_identity_me');
