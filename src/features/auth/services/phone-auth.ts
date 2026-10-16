import { supabase } from '@core/api/supabase-client';
export function normalizePhone(value: string) {
  return value.replace(/[\s()-]/g, '');
}
export async function requestOtp(value: string) {
  const phone = normalizePhone(value);
  if (!/^\+91[6-9][0-9]{9}$/.test(phone))
    throw new Error('Enter your WhatsApp number with +91 and ten digits.');
  if (!supabase) throw new Error('WhatsApp sign-in is not configured.');
  // Supabase Send SMS Auth Hook delivers this code through Meta WhatsApp.
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { channel: 'sms' },
  });
  if (error)
    throw new Error(
      error.status === 429
        ? 'Please wait before requesting another code.'
        : 'Could not send the WhatsApp code. Please try again later.',
    );
}
export async function verifyOtp(value: string, token: string) {
  if (!supabase) throw new Error('Sign-in is not configured.');
  if (!/^\d{6}$/.test(token))
    throw new Error('Enter the six-digit WhatsApp code.');
  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizePhone(value),
    token,
    type: 'sms',
  });
  if (error || !data.session)
    throw new Error(
      'This code is invalid or expired. Request a new code and try again.',
    );
  return data.session;
}
