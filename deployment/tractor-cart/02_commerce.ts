const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const operations = new Set([
  'fti_commerce_policy_get','fti_commerce_policy_set','fti_commerce_location_create',
  'fti_commerce_stock_adjust','fti_commerce_stock','fti_commerce_addresses',
  'fti_commerce_address_save','fti_commerce_quote_order','fti_commerce_my',
  'fti_commerce_detail','fti_commerce_bank_submit','fti_commerce_payment_queue',
  'fti_commerce_payment_decide','fti_commerce_expire',
  'fti_commerce_cart_order','fti_commerce_cart_queue','fti_commerce_cart_confirm',
]);

async function wakeOrderAlerts(url: string, workerSecret: string) {
  // Drain bounded batches promptly; the scheduled worker remains the fallback.
  // Jobs are claimed atomically and retain existing consent/permission checks.
  try {
    for (let batch = 0; batch < 10; batch++) {
      const response = await fetch(`${url}/functions/v1/operations-whatsapp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
        body: '{}', signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) return;
      const result = await response.json();
      if (typeof result.claimed !== 'number' || result.claimed < 10) return;
    }
  } catch {
    // Sending failures must not turn a committed order into an apparent failure.
    // Pending jobs remain available to the existing scheduled worker.
  }
}
Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const json = (body: unknown, status: number) => Response.json(body, {
    status, headers: { ...cors, 'X-Request-Id': requestId },
  });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) return json({ code: 'UNAVAILABLE', message: 'Commerce service is unavailable' }, 503);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ code: 'UNAUTHENTICATED', message: 'Sign in required' }, 401);
  try {
    const verified = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: key }, signal: AbortSignal.timeout(8000),
    });
    if (!verified.ok) return json({ code: 'UNAUTHENTICATED', message: 'Session expired; sign in again' }, 401);
    const raw = await request.text();
    if (raw.length > 65536) return json({ code: 'INVALID_INPUT', message: 'Request too large' }, 413);
    let body: { operation?: unknown; arguments?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ code: 'INVALID_INPUT', message: 'Expected JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !operations.has(String(body.operation)))
      return json({ code: 'INVALID_OPERATION', message: 'Unsupported operation' }, 400);
    const args = body.arguments ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args))
      return json({ code: 'INVALID_INPUT', message: 'Expected arguments object' }, 400);
    const response = await fetch(`${url}/rest/v1/rpc/${body.operation}`, {
      method: 'POST', headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(12000),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const code = typeof data?.code === 'string' ? data.code : 'FAILED';
      const status = code === '42501' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : 422;
      const message = ['42501','22023','P0002'].includes(code) ? String(data.message)
        : code === '23505' ? 'This request or bank reference already exists.' : 'Commerce request could not be completed.';
      return json({ code, message, requestId }, status);
    }
    if (['fti_commerce_cart_order', 'fti_commerce_quote_order'].includes(String(body.operation)) && data?.replayed === false) {
      const workerSecret = Deno.env.get('OPERATIONS_WORKER_SECRET');
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
      if (workerSecret && runtime) runtime.waitUntil(wakeOrderAlerts(url, workerSecret));
    }
    return json({ data, requestId }, 200);
  } catch { return json({ code: 'UNAVAILABLE', message: 'Unable to process commerce request', requestId }, 503); }
});
