import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Button, Card, Row, Txt } from '@shared/ui';
import { operationsRpc, type Notice } from '../services/operations-api';

export function StaffOrderAlert() {
  const auth = useAuth();
  const staff = hasPermission(auth.identity, 'staff.access');
  const query = useQuery({
    queryKey: ['operations', 'staff-order-alerts', auth.session?.user.id],
    queryFn: () => operationsRpc<Notice[]>('fti_operations_notifications', { p_offset: 0 }),
    enabled: !!auth.session && staff,
    refetchInterval: 5000,
    retry: false,
  });
  if (!staff) return null;
  const unread = query.data?.filter(notice => !notice.read_at && ['order', 'quotation', 'category quotation'].includes(notice.payload.request_type ?? '') && notice.payload.request_state === 'new') ?? [];
  if (!unread.length) return null;
  const orders = unread.filter(notice => notice.payload.request_type === 'order').length;
  const quotations = unread.length - orders;
  const label = orders && quotations ? 'order or quotation' : orders ? 'order' : 'quotation';
  return <Card style={{ marginBottom: 12, gap: 8 }}>
    <Txt accessibilityRole="alert" accessibilityLiveRegion="assertive">{unread.length} new {label} alert{unread.length === 1 ? '' : 's'}</Txt>
    <Row style={{ flexWrap: 'wrap' }}>
      {orders > 0 && hasPermission(auth.identity, 'order.manage') ? <Button onPress={() => router.push('/admin?section=tractor-orders' as never)}>Review tractor orders</Button> : null}
      {quotations > 0 && hasPermission(auth.identity, 'sales.manage') ? <Button onPress={() => router.push('/admin?section=sales' as never)}>Review quotation requests</Button> : null}
      <Button secondary onPress={() => router.push('/account?section=settings' as never)}>View updates</Button>
    </Row>
  </Card>;
}
