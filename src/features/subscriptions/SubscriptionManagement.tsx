import { useState } from 'react';
import { Button, Card, Field, Txt, s } from '@shared/ui';
import { subscriptionRpc } from './api';
import { useSubscription } from './SubscriptionProvider';
export function SubscriptionManagement() {
  const query = useSubscription();
  const [price, setPrice] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    const amount = Number(price) * 100;
    if (
      !/^\d+(\.\d{1,2})?$/.test(price) ||
      !Number.isSafeInteger(Math.round(amount)) ||
      amount < 100 ||
      amount > 100000000
    ) {
      setMessage(
        'Enter a price from ₹1 to ₹10,00,000 with at most two decimal places.',
      );
      return;
    }
    if (!query.data || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await subscriptionRpc('fti_subscription_plan_save', {
        p_amount: Math.round(amount),
        p_revision: query.data.revision,
      });
      setPrice('');
      await query.refetch();
      setMessage('Annual price updated. Existing paid validity is unchanged.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 14 }}>
      <Txt style={s.h2}>Annual rate subscription</Txt>
      <Txt>Per user · All categories · Manual renewal · INR</Txt>
      {query.data ? (
        <Txt>
          Current price: ₹
          {(query.data.amount_paise / 100).toLocaleString('en-IN')} / year
        </Txt>
      ) : (
        <Txt>{query.error?.message ?? 'Loading price…'}</Txt>
      )}
      <Field
        label="New annual price (INR)"
        value={price}
        onChangeText={setPrice}
        numeric
        placeholder="1200"
      />
      <Txt>
        Applies to new checkout orders. Checkout orders already created retain
        their quoted amount.
      </Txt>
      <Button disabled={busy || !query.data} onPress={() => void save()}>
        {busy ? 'Saving…' : 'Update annual price'}
      </Button>
      <Button secondary onPress={() => void query.refetch()}>
        Refresh price
      </Button>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}
