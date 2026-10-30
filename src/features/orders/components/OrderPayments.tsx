import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Button, Field, Txt } from '@shared/ui';
import type { OrderKind } from '../model/order-actions';
import {
  newPaymentDraft,
  paymentDraftError,
  remainingAfterPayment,
  type PaymentDraft,
  type PaymentSummary,
} from '../model/order-payments';
import {
  orderPayments,
  recordOrderPayment,
} from '../services/order-payments-api';

const money = (value: string) =>
  `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function PaymentTotals({ summary }: { summary: PaymentSummary }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt>
        Order total:{' '}
        {summary.total === null
          ? 'Awaiting confirmation'
          : money(summary.total)}
      </Txt>
      <Txt>Payment received: {money(summary.paid)}</Txt>
      <Txt style={{ fontWeight: '700' }}>
        Remaining amount:{' '}
        {summary.remaining === null
          ? 'Awaiting confirmation'
          : money(summary.remaining)}
      </Txt>
    </View>
  );
}
export function PaymentFields({
  draft,
  onChange,
  remaining,
}: {
  draft: PaymentDraft;
  onChange: (value: PaymentDraft) => void;
  remaining?: string | null;
}) {
  const auth = useAuth();
  const allowed = hasPermission(auth.identity, 'payment.review');
  if (!allowed)
    return (
      <Txt>Accounts permission is required to record payment received.</Txt>
    );
  const error = paymentDraftError(draft, remaining);
  const after = remainingAfterPayment(remaining, draft.payment_amount);
  return (
    <View style={{ gap: 8 }}>
      <Field
        label="Payment received at this step (INR, optional)"
        placeholder="Leave blank if no payment received"
        numeric
        value={draft.payment_amount}
        onChangeText={(payment_amount) =>
          onChange({ ...draft, payment_amount })
        }
      />
      {draft.payment_amount.trim() ? (
        <>
          <Field
            label="Payment / receipt reference"
            placeholder="Bank UTR or receipt number (5–120 characters)"
            value={draft.payment_reference}
            onChangeText={(payment_reference) =>
              onChange({ ...draft, payment_reference })
            }
          />
          {error ? (
            <Txt accessibilityRole="alert">{error}</Txt>
          ) : after !== null ? (
            <Txt>Remaining after this payment: {money(after)}</Txt>
          ) : null}
          <Txt>
            Record only money already received and verified. This amount is
            added to earlier payments.
          </Txt>
        </>
      ) : null}
    </View>
  );
}
export function OrderPayments({
  kind,
  id,
  editable = false,
}: {
  kind: OrderKind;
  id: string;
  editable?: boolean;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['order-payments', auth.session?.user.id, kind, id],
    queryFn: () => orderPayments(kind, id),
    retry: false,
    enabled: !!auth.session,
  });
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(false);
  const [draft, setDraft] = useState(newPaymentDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const summary = query.data;
  const permitted =
    editable &&
    hasPermission(auth.identity, 'payment.review') &&
    summary?.total !== null &&
    Number(summary?.remaining) > 0 &&
    !['cancelled', 'rejected', 'refunded', 'expired'].includes(
      summary?.status ?? '',
    );
  async function save() {
    if (
      !permitted ||
      !review ||
      busy ||
      !draft.payment_amount ||
      paymentDraftError(draft, summary?.remaining)
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      await recordOrderPayment(kind, id, draft);
      setDraft(newPaymentDraft());
      setEditing(false);
      setReview(false);
      setMessage('Payment recorded.');
      await Promise.all(
        [
          'order-payments',
          'commerce',
          'admin-orders',
          'raw-orders',
          'fastener-orders',
          'operations',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontWeight: '700' }}>Payment tracking</Txt>
      {query.isPending ? (
        <Txt>Loading payment totals…</Txt>
      ) : query.error ? (
        <>
          <Txt accessibilityRole="alert">{query.error.message}</Txt>
          <Button secondary onPress={() => void query.refetch()}>
            Retry payment totals
          </Button>
        </>
      ) : summary ? (
        <>
          <PaymentTotals summary={summary} />
          {summary.receipts.length ? (
            <>
              <Txt>Recorded payments</Txt>
              {summary.receipts.map((receipt) => (
                <Txt selectable key={receipt.id}>
                  {money(receipt.amount)} · {receipt.reference} ·{' '}
                  {new Date(receipt.at).toLocaleDateString('en-IN')}
                </Txt>
              ))}
            </>
          ) : null}
          {permitted && !editing ? (
            <Button
              secondary
              onPress={() => {
                setEditing(true);
                setMessage('');
              }}
            >
              Record a payment
            </Button>
          ) : null}
          {permitted && editing ? (
            <>
              <PaymentFields
                draft={draft}
                remaining={summary.remaining}
                onChange={(value) => {
                  setDraft(value);
                  setReview(false);
                }}
              />
              {review ? (
                <Txt>
                  Confirm receipt of {money(draft.payment_amount)} against{' '}
                  {draft.payment_reference}?
                </Txt>
              ) : null}
              <Button
                disabled={
                  busy ||
                  !draft.payment_amount ||
                  !!paymentDraftError(draft, summary.remaining)
                }
                onPress={() => (review ? void save() : setReview(true))}
              >
                {busy
                  ? 'Recording payment…'
                  : review
                    ? 'Confirm payment received'
                    : 'Review payment'}
              </Button>
              <Button
                secondary
                disabled={busy}
                onPress={() => {
                  setEditing(false);
                  setReview(false);
                }}
              >
                Cancel entry
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </View>
  );
}
