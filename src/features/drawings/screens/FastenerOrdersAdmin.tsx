import {
  RequestFulfillment,
  type RequestFulfillmentState,
} from '@features/operations/ui';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { supabase } from '@core/api/supabase-client';
import {
  Button,
  Card,
  Row,
  Txt,
  RequestSummary,
  OrderStatusFilters,
  Badge,
  s,
} from '@shared/ui';
import { DrawingPreview } from '../components/DrawingPreview';
import type { DrawingDefinition, DrawingInput } from '../model/types';
type RequestRow = {
  id: string;
  created_at: string;
  details: Record<string, unknown>;
  definition: DrawingDefinition;
  fulfillment?: RequestFulfillmentState;
  selection: { input: DrawingInput };
  deliveries:
    | { id: string; phone: string; status: string; error: string | null }[]
    | null;
};
export function FastenerOrdersAdmin() {
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('all');
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['fastener-orders', auth.session?.user.id, offset, status],
    queryFn: async () => {
      if (!supabase) throw new Error('Orders unavailable');
      const { data, error } = await supabase.rpc(
        'fti_catalog_fastener_orders',
        { p_offset: offset, p_status: status },
      );
      if (error) throw new Error(error.message);
      return data as RequestRow[];
    },
    retry: false,
  });
  async function replay(id: string) {
    if (!supabase || busy) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.rpc(
        'fti_catalog_fastener_delivery_replay',
        { p_id: id },
      );
      if (error) throw new Error(error.message);
      setReview('');
      await query.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Fastener order requests</Txt>
      <Txt>
        Review fastener specifications and drawing snapshots. Recipient numbers
        are managed in Notification settings.
      </Txt>
      <Button secondary onPress={() => void query.refetch()}>
        Refresh fastener requests
      </Button>
      <OrderStatusFilters
        value={status}
        onChange={(value) => {
          setStatus(value);
          setOffset(0);
        }}
      />
      {query.isPending ? (
        <Txt>Loading requests...</Txt>
      ) : query.isError ? (
        <Txt accessibilityRole="alert">{query.error.message}</Txt>
      ) : !query.data.length ? (
        <Txt>No fastener requests match this filter.</Txt>
      ) : (
        query.data.map((order) => (
          <RequestSummary
            key={order.id}
            details={order.details}
            createdAt={order.created_at}
            status={order.fulfillment?.status}
            fulfillment={
              <RequestFulfillment
                kind="fastener"
                requestId={order.id}
                initial={order.fulfillment}
              />
            }
            detailLabel="drawing & notifications"
          >
            <Txt style={s.h2}>Drawing & WhatsApp delivery</Txt>
            <DrawingPreview
              definition={order.definition}
              input={order.selection.input}
            />
            {!order.deliveries?.length ? (
              <Txt>No notification deliveries recorded.</Txt>
            ) : null}
            {order.deliveries?.map((job) => (
              <Card key={job.id}>
                <Row
                  style={{
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Txt selectable>{job.phone}</Txt>
                  <Badge
                    tone={
                      ['failed', 'manual_review'].includes(job.status)
                        ? 'red'
                        : job.status === 'sent'
                          ? 'green'
                          : 'gray'
                    }
                  >
                    {job.status.replaceAll('_', ' ')}
                  </Badge>
                </Row>
                {job.error ? <Txt>{job.error}</Txt> : null}
                {['failed', 'manual_review'].includes(job.status) ? (
                  review === job.id ? (
                    <>
                      <Txt>
                        Confirm in Meta that this message was not delivered
                        before retrying.
                      </Txt>
                      <Button
                        disabled={busy}
                        onPress={() => void replay(job.id)}
                      >
                        Confirm not delivered and retry
                      </Button>
                      <Button secondary onPress={() => setReview('')}>
                        Cancel retry
                      </Button>
                    </>
                  ) : (
                    <Button secondary onPress={() => setReview(job.id)}>
                      Review failed delivery
                    </Button>
                  )
                ) : null}
              </Card>
            ))}
          </RequestSummary>
        ))
      )}
      <Row style={{ flexWrap: 'wrap' }}>
        <Button
          secondary
          disabled={offset === 0}
          onPress={() => setOffset(Math.max(0, offset - 25))}
        >
          Previous fastener requests
        </Button>
        <Button
          secondary
          disabled={!query.data || query.data.length < 25}
          onPress={() => setOffset(offset + 25)}
        >
          Next fastener requests
        </Button>
      </Row>
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
    </Card>
  );
}
