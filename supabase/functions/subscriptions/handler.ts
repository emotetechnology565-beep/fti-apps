type Env = (name: string) => string | undefined;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
class Failure extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export async function validSignature(
  secret: string,
  message: string,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    Uint8Array.from(signature.match(/../g)!, (hex) => parseInt(hex, 16)),
    new TextEncoder().encode(message),
  );
}
export function createSubscriptionHandler(
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: cors });
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')
      return json({ message: 'POST required' }, 405);
    try {
      const url = env('SUPABASE_URL'),
        service = env('SUPABASE_SERVICE_ROLE_KEY'),
        key = env('RAZORPAY_KEY_ID'),
        secret = env('RAZORPAY_KEY_SECRET');
      if (!url || !service || !key || !secret)
        throw new Failure('Subscription checkout is not configured yet.', 503);
      // Development defaults to Test Mode. Live charging requires an explicit server setting.
      const mode = env('RAZORPAY_MODE') ?? 'test';
      if (!['test', 'live'].includes(mode) || !key.startsWith(`rzp_${mode}_`))
        throw new Failure(
          'Payment credentials do not match the configured Razorpay mode.',
          503,
        );
      const raw = await request.text();
      if (raw.length > 65536) throw new Failure('Request too large', 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new Failure('Invalid request');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Failure('Invalid request');
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const response = await fetcher(`${url}/rest/v1/rpc/${name}`, {
          method: 'POST',
          headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(15000),
        });
        const data = response.status === 204 ? null : await response.json();
        if (!response.ok)
          throw new Failure(
            data?.code === '22023'
              ? data.message
              : 'Subscription could not be updated.',
            data?.code === '42501' ? 403 : 422,
          );
        return data;
      };
      const razorpay = async (path: string, payload?: unknown) => {
        const response = await fetcher(`https://api.razorpay.com/v1/${path}`, {
          method: payload ? 'POST' : 'GET',
          headers: {
            Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
            'Content-Type': 'application/json',
          },
          ...(payload ? { body: JSON.stringify(payload) } : {}),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Failure(
            'Payment provider is unavailable. Try again later.',
            502,
          );
        return response.json();
      };
      const settle = async (
        paymentId: string,
        expectedOrder?: string,
        user?: string,
      ) => {
        if (!/^pay_[A-Za-z0-9]+$/.test(paymentId))
          throw new Failure('Invalid payment');
        const payment = await razorpay(`payments/${paymentId}`);
        if (expectedOrder && payment.order_id !== expectedOrder)
          throw new Failure('Payment order mismatch');
        const order = await rpc('fti_subscription_order_get', {
          p_order: payment.order_id,
        });
        if (!order) throw new Failure('Unknown subscription order', 404);
        if (user && order.user_id !== user)
          throw new Failure('This checkout belongs to another account.', 403);
        if (payment.status !== 'captured' || payment.captured !== true)
          throw new Failure(
            'Payment is awaiting capture. Refresh subscription status shortly.',
            409,
          );
        return rpc('fti_subscription_settle', {
          p_order: payment.order_id,
          p_payment: payment.id,
          p_amount: payment.amount,
          p_currency: payment.currency,
        });
      };
      // The webhook endpoint has JWT verification disabled; the raw body HMAC authenticates it.
      if (new URL(request.url).searchParams.get('webhook') === '1') {
        const webhookSecret = env('RAZORPAY_WEBHOOK_SECRET');
        if (!webhookSecret) throw new Failure('Webhook unavailable', 503);
        if (
          !(await validSignature(
            webhookSecret,
            raw,
            request.headers.get('x-razorpay-signature') ?? '',
          ))
        )
          throw new Failure('Invalid webhook signature', 401);
        if (body.event !== 'payment.captured' && body.event !== 'order.paid')
          return json({ received: true, ignored: true });
        const payment = body.payload?.payment?.entity;
        if (
          typeof payment?.id !== 'string' ||
          typeof payment?.order_id !== 'string'
        )
          throw new Failure('Missing payment');
        const known = await rpc('fti_subscription_order_get', {
          p_order: payment.order_id,
        });
        if (!known) return json({ received: true, ignored: true });
        await settle(payment.id, payment.order_id);
        return json({ received: true });
      }
      const authorization = request.headers.get('Authorization');
      if (!authorization?.startsWith('Bearer '))
        throw new Failure('Sign in required', 401);
      const verified = await fetcher(`${url}/auth/v1/user`, {
        headers: { apikey: service, Authorization: authorization },
        signal: AbortSignal.timeout(10000),
      });
      if (!verified.ok) throw new Failure('Sign in again to continue.', 401);
      const user = await verified.json();
      if (typeof user.id !== 'string')
        throw new Failure('Sign in required', 401);
      if (body.action === 'create') {
        if (!Number.isInteger(body.revision))
          throw new Failure('Refresh the subscription price.');
        const purchase = await rpc('fti_subscription_prepare', {
          p_user: user.id,
          p_revision: body.revision,
        });
        const order = await razorpay('orders', {
          amount: purchase.amount_paise,
          currency: 'INR',
          receipt: purchase.id,
          notes: { subscription_purchase: purchase.id },
        });
        if (
          typeof order.id !== 'string' ||
          order.amount !== purchase.amount_paise ||
          order.currency !== 'INR'
        )
          throw new Failure('Invalid payment provider response', 502);
        await rpc('fti_subscription_order_attach', {
          p_id: purchase.id,
          p_order: order.id,
        });
        return json({
          data: {
            order_id: order.id,
            amount: purchase.amount_paise,
            currency: 'INR',
            key_id: key,
          },
        });
      }
      if (body.action === 'verify') {
        const { order_id, payment_id, signature } = body;
        if (
          typeof order_id !== 'string' ||
          typeof payment_id !== 'string' ||
          typeof signature !== 'string'
        )
          throw new Failure('Invalid payment confirmation');
        const order = await rpc('fti_subscription_order_get', {
          p_order: order_id,
        });
        if (!order || order.user_id !== user.id)
          throw new Failure('This checkout belongs to another account.', 403);
        if (
          !(await validSignature(
            secret,
            `${order.razorpay_order_id}|${payment_id}`,
            signature,
          ))
        )
          throw new Failure('Invalid payment signature', 401);
        return json({
          data: await settle(payment_id, order.razorpay_order_id, user.id),
        });
      }
      throw new Failure('Unsupported action');
    } catch (error) {
      return json(
        {
          message:
            error instanceof Failure
              ? error.message
              : 'Subscription service is temporarily unavailable.',
        },
        error instanceof Failure ? error.status : 503,
      );
    }
  };
}
