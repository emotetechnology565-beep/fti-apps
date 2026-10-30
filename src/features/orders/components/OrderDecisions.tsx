import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase-client';
import { hasPermission } from '@features/auth';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Row, Txt } from '@shared/ui';
import { OrderClosure } from './OrderClosure';

export function OrderDecisions() {
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const permitted = hasPermission(auth.identity, 'order.manage');
  const list = useQuery({
    queryKey: ['commerce', 'decisions', auth.session?.user.id, offset],
    enabled: permitted,
    retry: false,
    queryFn: async () => {
      if (!supabase) throw new Error('Ordering service is not configured.');
      const { data, error } = await supabase.rpc('fti_order_decision_queue', {
        p_offset: offset,
      });
      if (error) throw new Error(error.message);
      return data as { id: string; order_no: string; status: string }[];
    },
  });
  if (!permitted) return null;
  return (
    <Card style={{ gap: 12 }}>
      <Txt>Parts order decisions</Txt>
      <Txt>
        Reject orders before dispatch with a reason. Resolve any payment already
        received separately with accounts.
      </Txt>
      {list.isPending ? (
        <Txt>Loading orders...</Txt>
      ) : list.error ? (
        <Txt accessibilityRole="alert">{list.error.message}</Txt>
      ) : (
        <>
          {!list.data.length ? <Txt>No orders awaiting a decision.</Txt> : null}
          {list.data.map((order) => (
            <Card key={order.id + order.status} style={{ gap: 8 }}>
              <Txt>
                {order.order_no} · {order.status.replaceAll('_', ' ')}
              </Txt>
              <OrderClosure
                kind="commerce"
                id={order.id}
                status={order.status}
                admin
              />
            </Card>
          ))}
          <Row>
            <Button
              secondary
              disabled={!offset}
              onPress={() => setOffset(Math.max(0, offset - 24))}
            >
              Previous
            </Button>
            <Button
              secondary
              disabled={list.data.length < 24}
              onPress={() => setOffset(offset + 24)}
            >
              Next
            </Button>
          </Row>
        </>
      )}
    </Card>
  );
}
