import { useState } from 'react';
import { Platform, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Card, Txt, s } from '@shared/ui';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { useSubscription } from './SubscriptionProvider';
import { paymentRequest } from './api';
import { openCheckout } from './checkout';

export function SubscriptionCard() {
  const query = useSubscription();
  const auth = useAuth();
  const active = usePriceAccess();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const data = query.data;
  async function purchase() {
    if (busy || !data) return;
    setBusy(true);
    setMessage('');
    try {
      if (Platform.OS !== 'web') {
        const base = process.env.EXPO_PUBLIC_WEB_APP_URL;
        if (!base || new URL(base).protocol !== 'https:')
          throw new Error('Web subscription checkout is not available yet.');
        await Linking.openURL(
          new URL('/account?section=subscription', base).toString(),
        );
        setMessage(
          'Sign in on the website using the same phone number. Return here and refresh after payment.',
        );
      } else if (!auth.session) {
        router.push('/login');
      } else {
        const order = await paymentRequest<{
          order_id: string;
          amount: number;
          currency: string;
          key_id: string;
        }>({ action: 'create', revision: data.revision });
        const result = await openCheckout(order);
        await paymentRequest({ action: 'verify', ...result });
        await query.refetch();
        setMessage(
          'Payment confirmed. Your annual rate access has been updated.',
        );
      }
    } catch (error) {
      setMessage((error as Error).message);
      await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 14 }}>
      <Badge>{active ? 'ACTIVE' : 'ANNUAL PLAN'}</Badge>
      <Txt style={s.h2}>FTI rate subscription</Txt>
      <Txt>One user. Every category. Access on iOS, Android and web.</Txt>
      {query.isPending ? (
        <Txt>Loading subscription…</Txt>
      ) : query.isError ? (
        <Txt accessibilityRole="alert">{query.error.message}</Txt>
      ) : data ? (
        <>
          <Txt style={s.h2}>
            ₹{(data.amount_paise / 100).toLocaleString('en-IN')} / year
          </Txt>
          <Txt>
            One-time payment. Renew manually each year. No automatic charges.
          </Txt>
          {data.expires_at ? (
            <Txt>
              {active ? 'Access until' : 'Previous access ended'}{' '}
              {new Date(data.expires_at).toLocaleDateString('en-IN')}
            </Txt>
          ) : null}
          <Txt>
            {active
              ? 'Renewing now adds one year to your existing expiry.'
              : 'Your year starts when payment is confirmed.'}{' '}
            Quotations and orders remain available after expiry.
          </Txt>
          <Button disabled={busy} onPress={() => void purchase()}>
            {busy
              ? 'Processing…'
              : Platform.OS !== 'web'
                ? 'Continue on website'
                : !auth.session
                  ? 'Sign in to subscribe'
                  : active
                    ? 'Renew for one year'
                    : 'Subscribe for one year'}
          </Button>
          {data.purchases.filter((p) => p.status === 'paid').length > 0 ? (
            <View style={{ gap: 8 }}>
              <Txt>Recent payments</Txt>
              {data.purchases
                .filter((p) => p.status === 'paid')
                .map((p) => (
                  <Txt key={p.id}>
                    ₹{(p.amount_paise / 100).toLocaleString('en-IN')} ·{' '}
                    {new Date(p.created_at).toLocaleDateString('en-IN')} · Paid
                  </Txt>
                ))}
            </View>
          ) : null}
        </>
      ) : null}
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      <Button
        secondary
        disabled={busy || query.isFetching}
        onPress={() => void query.refetch()}
      >
        Refresh subscription status
      </Button>
    </Card>
  );
}
