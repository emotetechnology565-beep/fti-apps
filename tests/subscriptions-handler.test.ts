import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createSubscriptionHandler,
  validSignature,
} from '../supabase/functions/subscriptions/handler';

test('Razorpay checkout binds server prices and confirms only owned, signed, captured payments', async () => {
  const secrets: Record<string, string> = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    RAZORPAY_KEY_ID: 'rzp_test_id',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_WEBHOOK_SECRET: 'webhook',
  };
  let owner = 'user-1',
    status = 'captured',
    amount = 120000,
    settled = 0,
    prepared = 0;
  const calls: string[] = [];
  const handler = createSubscriptionHandler(
    (name) => secrets[name],
    async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1' });
      const args = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.endsWith('/fti_subscription_prepare')) {
        prepared++;
        assert.deepEqual(args, { p_user: 'user-1', p_revision: 1 });
        return Response.json({ id: 'purchase-1', amount_paise: 120000 });
      }
      if (url.endsWith('/orders')) {
        assert.equal(args.amount, 120000);
        assert.equal(args.currency, 'INR');
        return Response.json({
          id: 'order_1',
          amount: 120000,
          currency: 'INR',
        });
      }
      if (url.endsWith('/fti_subscription_order_attach'))
        return new Response(null, { status: 204 });
      if (url.endsWith('/fti_subscription_order_get'))
        return Response.json({ user_id: owner, razorpay_order_id: 'order_1' });
      if (url.endsWith('/payments/pay_1'))
        return Response.json({
          id: 'pay_1',
          order_id: 'order_1',
          amount,
          currency: 'INR',
          status,
          captured: status === 'captured',
        });
      if (url.endsWith('/fti_subscription_settle')) {
        assert.equal(args.p_amount, amount);
        if (amount !== 120000)
          return Response.json(
            { code: '22023', message: 'Payment amount mismatch' },
            { status: 400 },
          );
        settled++;
        return Response.json({ expires_at: '2027-10-29T00:00:00Z' });
      }
      throw new Error(`Unexpected request ${url}`);
    },
  );
  const request = (body: unknown, auth = true) =>
    new Request('https://db.example/functions/v1/subscriptions', {
      method: 'POST',
      headers: auth ? { Authorization: 'Bearer user-token' } : {},
      body: JSON.stringify(body),
    });
  assert.equal(
    (await handler(request({ action: 'create', revision: 1 }, false))).status,
    401,
  );
  assert.equal(prepared, 0);
  const created = await handler(
    request({ action: 'create', revision: 1, amount: 1, user_id: 'other' }),
  );
  assert.equal(created.status, 200);
  assert.equal((await created.json()).data.amount, 120000);
  const signature = createHmac('sha256', 'secret')
    .update('order_1|pay_1')
    .digest('hex');
  const verify = {
    action: 'verify',
    order_id: 'order_1',
    payment_id: 'pay_1',
    signature,
  };
  assert.equal(
    (await handler(request({ ...verify, signature: '0'.repeat(64) }))).status,
    401,
  );
  assert.equal(settled, 0);
  owner = 'other';
  assert.equal((await handler(request(verify))).status, 403);
  owner = 'user-1';
  status = 'authorized';
  assert.equal((await handler(request(verify))).status, 409);
  assert.equal(settled, 0);
  status = 'captured';
  amount = 1;
  assert.equal((await handler(request(verify))).status, 422);
  assert.equal(settled, 0);
  amount = 120000;
  assert.equal((await handler(request(verify))).status, 200);
  assert.equal(settled, 1);
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
  });
  const webhook = (sig: string) =>
    new Request('https://db.example/functions/v1/subscriptions?webhook=1', {
      method: 'POST',
      headers: { 'x-razorpay-signature': sig },
      body: raw,
    });
  assert.equal((await handler(webhook('invalid'))).status, 401);
  assert.equal(
    (
      await handler(
        webhook(createHmac('sha256', 'webhook').update(raw).digest('hex')),
      )
    ).status,
    200,
  );
  assert.equal(settled, 2); // Database test verifies repeat settlement grants no extra year.
  assert.ok(calls.some((url) => url.endsWith('/payments/pay_1')));
});

test('signature verification covers the exact raw body and rejects malformed signatures', async () => {
  const message = '{"event":"payment.captured"}';
  const signature = createHmac('sha256', 'secret')
    .update(message)
    .digest('hex');
  assert.equal(await validSignature('secret', message, signature), true);
  assert.equal(await validSignature('secret', message + ' ', signature), false);
  assert.equal(await validSignature('secret', message, 'zz'.repeat(32)), false);
});

test('development defaults to test mode and rejects live keys before contacting payment services', async () => {
  const secrets: Record<string, string> = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    RAZORPAY_KEY_ID: 'rzp_live_example',
    RAZORPAY_KEY_SECRET: 'secret',
  };
  const handler = createSubscriptionHandler(
    (name) => secrets[name],
    async () => {
      throw new Error('Must not contact provider');
    },
  );
  const result = await handler(
    new Request('https://db.example/functions/v1/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', revision: 1 }),
    }),
  );
  assert.equal(result.status, 503);
  assert.match((await result.json()).message, /credentials do not match/);
});
