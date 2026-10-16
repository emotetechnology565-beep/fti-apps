import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@core/api/supabase-client';
import { Card, Txt, Button, Field } from '@shared/ui';
export function StaffMfa({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [factor, setFactor] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    supabase?.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (alive) {
          if (error) setError(error.message);
          setReady(data?.currentLevel === 'aal2');
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  async function prepare() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    try {
      const list = await supabase.auth.mfa.listFactors();
      if (list.error) throw list.error;
      const existing = list.data.totp.find((f) => f.status === 'verified');
      if (existing) {
        setFactor(existing.id);
        return;
      }
      for (const unused of list.data.all.filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified',
      )) {
        const removed = await supabase.auth.mfa.unenroll({
          factorId: unused.id,
        });
        if (removed.error) throw removed.error;
      }
      const enrolled = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'FTI staff authenticator',
      });
      if (enrolled.error) throw enrolled.error;
      setFactor(enrolled.data.id);
      setSecret(enrolled.data.totp.secret);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (result.error) throw result.error;
      setSecret('');
      setCode('');
      setReady(true);
    } catch {
      setError('Authenticator code is invalid or expired. Try again.');
    } finally {
      setBusy(false);
    }
  }
  if (ready) return <>{children}</>;
  return (
    <Card style={{ gap: 14 }}>
      <Txt>Staff verification required</Txt>
      <Txt>Use an authenticator app before accessing staff operations.</Txt>
      {!factor ? (
        <Button disabled={busy} onPress={prepare}>
          Set up or verify authenticator
        </Button>
      ) : (
        <>
          {secret ? (
            <>
              <Txt>
                Add this setup key to your authenticator app. Keep it private.
              </Txt>
              <Txt selectable>{secret}</Txt>
            </>
          ) : null}
          <Field
            label="Authenticator code"
            numeric
            value={code}
            onChangeText={setCode}
          />
          <Button disabled={busy || !/^\d{6}$/.test(code)} onPress={verify}>
            Verify staff access
          </Button>
        </>
      )}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
    </Card>
  );
}
