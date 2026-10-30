import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { orderHistory } from '@features/orders/services/order-history';
import { salesApi } from '@features/quotations/services/sales-api';
import { Icon, Txt } from '@shared/ui';
import type { Product } from '@features/catalog/model/types';
import { HomeSection, homeColors, homeFont } from './MobileHomeUI';

export function MobileHomeActivity({ products = [] }: { products?: Product[] }) {
  const auth = useAuth();
  const enabled = auth.ready && !!auth.session;
  const orders = useQuery({ queryKey: ['commerce', 'history', auth.session?.user.id, 0, '', 'all'], queryFn: () => orderHistory(0, '', 'all'), enabled, staleTime: 30_000, retry: false });
  const requests = useQuery({ queryKey: ['sales', 'mine', auth.session?.user.id, 0], queryFn: () => salesApi.mine(0), enabled, staleTime: 30_000, retry: false });
  const latestOrder = orders.data?.orders[0];
  const latestRequest = requests.data?.[0];
  const previous = orders.data?.orders.find(order => order.status === 'delivered' && products.some(product => product.name === order.details.material));
  const reorderProduct = products.find(product => product.name === previous?.details.material);
  const label = { color: '#193652', fontSize: 12, lineHeight: 18 } as const;
  return <View style={{ gap: 9 }}>
    <HomeSection title="Your requirements" action="View all" onPress={() => router.push('/rfqs')} />
    <View style={{ borderWidth: 1, borderColor: '#DCE5ED', borderRadius: 6, padding: 14, backgroundColor: '#F9FBFD', gap: 10 }}>
      {!enabled ? <Pressable accessibilityRole="link" onPress={() => router.push('/login?returnTo=requirements')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}><Icon name="file-text" size={36} color="#8BA4BC" /><View style={{ flex: 1, gap: 4 }}><Txt style={{ color: homeColors.text, fontWeight: '700', fontSize: 14, fontFamily: homeFont }}>Sign in to view your requirements</Txt><Txt style={label}>Create your first requirement or follow existing requests.</Txt></View></Pressable> : orders.isPending || requests.isPending ? <Txt style={label}>Loading your business activity…</Txt> : orders.isError || requests.isError ? <Pressable accessibilityRole="button" onPress={() => { void orders.refetch(); void requests.refetch(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Txt style={label}>Activity could not be loaded. Tap to retry.</Txt></Pressable> : <>
        {!latestOrder && !latestRequest ? <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="file-text" size={34} color="#8BA4BC" /><View style={{ flex: 1 }}><Txt style={{ color: '#092749', fontWeight: '700' }}>No requirements yet</Txt><Txt style={label}>Create a requirement to get started.</Txt></View></View> : null}
        <Pressable accessibilityRole="link" onPress={() => router.push('/rfqs')} style={{ minHeight: 44, justifyContent: 'center' }}><Txt style={label}>Latest requirement: {latestRequest ? `${latestRequest.rfq_no} · ${latestRequest.status.replaceAll('_', ' ')}` : 'None yet'}</Txt></Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/orders')} style={{ minHeight: 44, justifyContent: 'center' }}><Txt style={label}>Order / dispatch: {latestOrder ? `${latestOrder.reference} · ${latestOrder.status.replaceAll('_', ' ')}` : 'No orders yet'}</Txt></Pressable>
        {previous && reorderProduct ? <><Pressable accessibilityRole="button" accessibilityLabel={`Reorder ${previous.reference}`} onPress={() => router.push({ pathname: '/product/[id]', params: { id: reorderProduct.id, size: previous.details.size ?? '', grade: previous.details.grade ?? '' } })} style={{ minHeight: 44, borderWidth: 1, borderColor: '#BACBDC', borderRadius: 4, justifyContent: 'center', alignItems: 'center' }}><Txt style={{ color: homeColors.text, fontWeight: '700' }}>Reorder</Txt></Pressable><Txt style={label}>Review current specifications, availability and rates before ordering again.</Txt></> : null}
      </>}
    </View>
  </View>;
}
