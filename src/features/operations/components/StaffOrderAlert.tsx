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
  const unread = query.data?.filter(notice => !notice.read_at && notice.payload.request_type === 'order' && notice.payload.request_state === 'new') ?? [];
  if (!unread.length) return null;
  return <Card style={{ marginBottom: 12, gap: 8 }}>
    <Txt accessibilityRole="alert" accessibilityLiveRegion="assertive">{unread.length} new order alert{unread.length === 1 ? '' : 's'}</Txt>
    <Row style={{ flexWrap: 'wrap' }}>
      {hasPermission(auth.identity, 'order.manage') ? <Button onPress={() => router.push('/admin?section=tractor-orders' as never)}>Review tractor orders</Button> : null}
      <Button secondary onPress={() => router.push('/account?section=settings' as never)}>View updates</Button>
    </Row>
  </Card>;
}
