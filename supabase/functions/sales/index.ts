const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const operations = new Set([
  'fti_sales_submit', 'fti_sales_my', 'fti_sales_queue', 'fti_sales_detail',
  'fti_sales_category_quote_catalog','fti_sales_category_quote_request','fti_sales_category_quote_requests','fti_sales_submit_with_pdfs',
  'fti_sales_assign', 'fti_sales_quote', 'fti_sales_revision_request', 'fti_sales_accept',
]);
async function wakeQuotationAlerts(url: string, workerSecret: string) {
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
  if (!url || !key) return json({ code: 'UNAVAILABLE', message: 'Sales service is unavailable' }, 503);
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
      method: 'POST',
      headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(12000),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const code = typeof data?.code === 'string' ? data.code : 'FAILED';
      const status = code === '42501' ? 403 : code === '23505' ? 409 : 422;
      const message = code === '42501' || code === '22023' || code === 'P0002'
        ? String(data.message) : code === '23505' ? 'Request changed or was already processed.' : 'Sales request could not be completed.';
      return json({ code, message, requestId }, status);
    }
    if (['fti_sales_category_quote_request','fti_sales_submit_with_pdfs'].includes(String(body.operation)) && (data?.replayed === false || data?.pdf_requests_queued > 0)) {
      const secret = Deno.env.get('OPERATIONS_WORKER_SECRET');
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
      if (secret && runtime) runtime.waitUntil(wakeQuotationAlerts(url, secret));
    }
    return json({ data, requestId }, 200);
  } catch {
    return json({ code: 'UNAVAILABLE', message: 'Unable to process sales request', requestId }, 503);
  }
});
