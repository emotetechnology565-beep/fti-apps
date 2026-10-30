import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase-client';
import { hasPermission } from '@features/auth';
import { useAuth } from '@features/auth/ui';
import { Button, Field, Txt } from '@shared/ui';
import {
  canCancelOrder,
  canRejectOrder,
  isClosedOrder,
  type OrderKind,
} from '../model/order-actions';

export function OrderClosure({
  kind,
  id,
  status,
  admin = false,
  onClosed,
}: {
  kind: OrderKind;
  id: string;
  status: string;
  admin?: boolean;
  onClosed?: () => void | Promise<unknown>;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const [review, setReview] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [closed, setClosed] = useState(false);
  const staff = hasPermission(auth.identity, 'staff.access');
  const allowed = admin
    ? hasPermission(auth.identity, 'order.manage') && canRejectOrder(status)
    : !staff && canCancelOrder(status);
  async function submit() {
    if (!allowed || busy || !review) return;
    setBusy(true);
    setMessage('');
    try {
      if (!supabase) throw new Error('Ordering service is not configured.');
      const { error } = await supabase.rpc('fti_order_close', {
        p_kind: kind,
        p_id: id,
        p_action: admin ? 'reject' : 'cancel',
        p_expected_status: status,
        p_note: note.trim(),
      });
      if (error)
        throw new Error(
          error.code === 'PGRST202'
            ? 'This action needs the latest database update. Please contact FTI admin.'
            : error.message,
        );
      setClosed(true);
      setReview(false);
      setMessage(admin ? 'Order rejected.' : 'Order cancelled.');
      await Promise.all(
        [
          'commerce',
          'raw-orders',
          'fastener-orders',
          'operations',
          'admin-orders',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      await onClosed?.();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (closed) return <Txt accessibilityLiveRegion="polite">{message}</Txt>;
  if (isClosedOrder(status)) return null;
  if (!allowed)
    return !admin && !staff ? (
      <View style={{ gap: 8 }}>
        <Txt>
          Processing has started. To request cancellation, contact FTI admin.
        </Txt>
        <Button
          secondary
          onPress={() =>
            router.push({
              pathname: '/support',
              params: {
                ...(kind === 'commerce' ? { order: id } : {}),
                subject: 'Order cancellation request',
                body: `Please help me cancel my ${kind} order ${id}.`,
              },
            })
          }
        >
          Contact admin
        </Button>
      </View>
    ) : null;
  return (
    <View style={{ gap: 10 }}>
      {!review ? (
        <Button secondary onPress={() => setReview(true)}>
          {admin ? 'Reject order' : 'Cancel order'}
        </Button>
      ) : (
        <>
          <Txt>
            {admin
              ? 'Reject this order? Enter a reason for the buyer.'
              : 'Cancel this order before processing starts?'}
          </Txt>
          {admin ? (
            <Field
              label="Rejection reason (5–1000 characters)"
              value={note}
              onChangeText={setNote}
              multiline
            />
          ) : null}
          <Txt>
            Any payment already received must be resolved with FTI admin
            separately.
          </Txt>
          <Button
            disabled={
              busy ||
              (admin && (note.trim().length < 5 || note.trim().length > 1000))
            }
            onPress={() => void submit()}
          >
            {busy
              ? 'Saving...'
              : admin
                ? 'Confirm rejection'
                : 'Confirm cancellation'}
          </Button>
          <Button secondary disabled={busy} onPress={() => setReview(false)}>
            Keep order
          </Button>
        </>
      )}
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </View>
  );
}
