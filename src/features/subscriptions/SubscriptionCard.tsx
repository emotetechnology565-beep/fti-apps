import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Card, Icon, Txt, c } from '@shared/ui';
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
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Icon name="bar-chart-2" size={21} color={c.blue} />
        </View>
        <Badge tone={active ? 'green' : 'blue'}>
          {active ? 'ACTIVE' : 'ANNUAL PLAN'}
        </Badge>
      </View>
      <View style={styles.copy}>
        <Txt style={styles.title}>FTI rate subscription</Txt>
        <Txt style={styles.body}>
          One user. Every category. Access on iOS, Android and web.
        </Txt>
      </View>
      {query.isPending ? (
        <Txt>Loading subscription…</Txt>
      ) : query.isError ? (
        <Txt accessibilityRole="alert">{query.error.message}</Txt>
      ) : data ? (
        <>
          <Txt style={styles.price}>
            ₹{(data.amount_paise / 100).toLocaleString('en-IN')}
            <Txt style={styles.year}> / year</Txt>
          </Txt>
          <Txt style={styles.body}>
            One-time payment. Renew manually each year. No automatic charges.
          </Txt>
          {data.expires_at ? (
            <View
              style={[
                styles.access,
                { backgroundColor: active ? '#EDF8F0' : '#F1F5F9' },
              ]}
            >
              <Icon
                name={active ? 'check-circle' : 'clock'}
                size={16}
                color={active ? '#15803D' : c.muted}
              />
              <Txt style={styles.accessText}>
                {active ? 'Access until' : 'Previous access ended'}{' '}
                {new Date(data.expires_at).toLocaleDateString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Txt>
            </View>
          ) : null}
          <Txt style={styles.body}>
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
            <View style={styles.payments}>
              <Txt style={styles.sectionTitle}>Recent payments</Txt>
              {data.purchases
                .filter((p) => p.status === 'paid')
                .map((p) => (
                  <View key={p.id} style={styles.receipt}>
                    <View style={styles.copy}>
                      <Txt style={styles.receiptAmount}>
                        ₹{(p.amount_paise / 100).toLocaleString('en-IN')}
                      </Txt>
                      <Txt style={styles.body}>
                        {new Date(p.created_at).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Txt>
                    </View>
                    <Badge tone="green">Paid</Badge>
                  </View>
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
const styles = StyleSheet.create({
  card: {
    gap: 16,
    padding: 18,
    borderRadius: 12,
    borderColor: '#D8E3EF',
    borderTopWidth: 3,
    borderTopColor: '#123B70',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: 5 },
  title: { fontSize: 19, lineHeight: 26, fontWeight: '700', color: c.dark },
  body: { fontSize: 12, lineHeight: 19, color: '#60738A' },
  price: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    color: c.dark,
    fontVariant: ['tabular-nums'],
  },
  year: { fontSize: 13, fontWeight: '500', color: c.muted },
  access: {
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accessText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
    color: c.dark,
  },
  payments: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E6EDF5',
    paddingTop: 14,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.dark },
  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F5F8FC',
  },
  receiptAmount: { fontSize: 14, fontWeight: '700', color: c.dark },
});
