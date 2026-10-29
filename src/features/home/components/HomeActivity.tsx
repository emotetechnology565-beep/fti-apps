import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { orderHistory } from '@features/orders/services/order-history';
import { Button, Icon, Txt, c } from '@shared/ui';

export function HomeActivity() {
  const { session, ready } = useAuth();
  const history = useQuery({
    queryKey: ['commerce', 'history', session?.user.id, 0, '', 'all'],
    queryFn: () => orderHistory(0, '', 'all'),
    enabled: ready && !!session,
    staleTime: 30000,
    retry: false,
  });
  const { refetch } = history;
  useFocusEffect(
    useCallback(() => {
      if (ready && session) void refetch();
    }, [ready, session, refetch]),
  );
  const latest = history.data?.orders[0];
  if (!session || (!history.isPending && !history.error && !latest))
    return null;
  return (
    <View style={styles.stack}>
      {session && (history.isPending || history.error || latest) ? (
        <View style={styles.order}>
          <View style={styles.row}>
            <Icon name="truck" color={c.brandBlue} size={18} />
            <Txt style={[styles.eyebrow, { flex: 1 }]}>YOUR LATEST ORDER</Txt>
            {latest ? (
              <View style={styles.badge}>
                <Txt style={styles.status}>
                  {latest.status === 'shipped'
                    ? 'In transit'
                    : latest.status.replaceAll('_', ' ')}
                </Txt>
              </View>
            ) : null}
          </View>
          {history.isPending ? (
            <Txt style={styles.description}>Loading your latest order…</Txt>
          ) : history.error ? (
            <View style={styles.row}>
              <Txt style={[styles.description, styles.text]}>
                Your latest order could not be loaded.
              </Txt>
              <Button secondary onPress={() => void refetch()}>
                Retry
              </Button>
            </View>
          ) : latest ? (
            <>
              <View style={styles.row}>
                <Txt style={[styles.title, styles.text]}>
                  {latest.reference}
                </Txt>
              </View>
              <Txt style={styles.description}>
                {latest.details.material || 'Order request'} ·{' '}
                {new Date(latest.created_at).toLocaleDateString('en-IN')}
              </Txt>
              <View style={styles.update}>
                <Icon name="activity" size={14} color={c.brandRed} />
                <Txt style={[styles.description, styles.text]}>
                  {latest.fulfillment.tracking_number
                    ? `Tracking: ${latest.fulfillment.tracking_number}`
                    : latest.status === 'pending_confirmation'
                      ? 'Awaiting confirmation from FTI'
                      : latest.status === 'delivered'
                        ? 'Delivery recorded'
                        : 'Follow your order and dispatch updates'}
                </Txt>
              </View>
              <Button
                style={styles.actionBtn}
                icon="arrow-right"
                onPress={() => router.push('/orders')}
              >
                View Order Dossier
              </Button>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { paddingHorizontal: 16 },
  order: {
    padding: 18,
    backgroundColor: c.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
    boxShadow: '0 2px 10px rgba(31, 27, 22, 0.04)',
    gap: 12,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  text: { flex: 1, minWidth: 120 },
  title: { fontSize: 18, fontWeight: '700', color: c.ink, letterSpacing: -0.3 },
  description: { fontSize: 12, lineHeight: 19, color: c.muted },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: c.brandBlue,
    textTransform: 'uppercase',
  },
  update: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: c.brandBlueLight,
    borderWidth: 1,
    borderColor: c.brandBlueBorder,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: c.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(76, 107, 79, 0.22)',
  },
  status: { fontSize: 11, fontWeight: '700', color: c.green, textTransform: 'capitalize' },
  actionBtn: {
    backgroundColor: c.brandBlue,
    borderRadius: 10,
    minHeight: 42,
  },
});
