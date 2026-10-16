import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@core/api/supabase-client';
import { useAuth } from '../components/AuthProvider';
import { requestOtp, verifyOtp } from '../services/phone-auth';
import { Heading, Card, Field, Button, Txt, Chip, s, c } from '@shared/ui';
export function Login() {
  const auth = useAuth();
  const [phone, setPhone] = useState('+91');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function send() {
    if (busy || seconds || !consent) return;
    setBusy(true);
    setMessage('');
    try {
      await requestOtp(phone);
      setSent(true);
      setRetryAt(Date.now() + 60000);
      setMessage('Check WhatsApp for your verification code.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await verifyOtp(phone, token);
      router.replace('/account');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Heading
        eyebrow="WELCOME TO FTI"
        title="Your business starts here."
        description="Sign in or create your account with a WhatsApp verification code."
      />
      <Card style={{ maxWidth: 500, gap: 14 }}>
        {auth.session ? (
          <>
            <Txt>You are signed in.</Txt>
            <Button onPress={() => router.replace('/account')}>
              Continue to account
            </Button>
            <Button
              secondary
              onPress={() => auth.signOut().catch((e) => setMessage(e.message))}
            >
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Field
              label="WhatsApp number with country code"
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setSent(false);
                setToken('');
              }}
              placeholder="+91"
            />
            <Chip selected={consent} onPress={() => setConsent(!consent)}>
              Send my verification code on WhatsApp
            </Chip>
            <Txt style={s.muted}>
              Select this option to enable the code request.
            </Txt>
            {sent ? (
              <Field
                label="Six-digit WhatsApp code"
                numeric
                value={token}
                onChangeText={setToken}
              />
            ) : null}
            <Button
              disabled={busy || !supabase || !consent || (!sent && seconds > 0)}
              onPress={sent ? verify : send}
            >
              {busy
                ? 'Please wait'
                : sent
                  ? 'Verify and sign in'
                  : seconds
                    ? `Try again in ${seconds}s`
                    : 'Send WhatsApp code'}
            </Button>
            {sent ? (
              <Button secondary disabled={busy || seconds > 0} onPress={send}>
                {seconds ? `Resend in ${seconds}s` : 'Resend WhatsApp code'}
              </Button>
            ) : null}
            {!supabase ? (
              <Txt style={s.muted}>WhatsApp sign-in is not available yet.</Txt>
            ) : null}
            <Txt style={s.muted}>
              The same verification flow restores access to an existing account.
              Never share your code.
            </Txt>
          </>
        )}
        {message ? (
          <Txt accessibilityRole="alert" style={{ color: c.red }}>
            {message}
          </Txt>
        ) : null}
        <Button secondary onPress={() => router.replace('/')}>
          Browse as guest
        </Button>
      </Card>
    </View>
  );
}
