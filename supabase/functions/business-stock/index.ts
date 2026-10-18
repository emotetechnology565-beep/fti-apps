const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const operations = new Set([
  'fti_stock_list', 'fti_stock_detail', 'fti_stock_save', 'fti_stock_transition',
  'fti_stock_enquire', 'fti_stock_enquiries', 'fti_stock_thread', 'fti_stock_reply', 'fti_stock_media_list', 'fti_stock_media_remove',
]);
Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const json = (body: unknown, status: number) => Response.json(body, {
    status, headers: { ...cors, 'X-Request-Id': requestId },
  });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) return json({ code: 'UNAVAILABLE', message: 'Business stock service is unavailable' }, 503);
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
      const status = code === '42501' ? 403 : ['23505','40001'].includes(code) ? 409 : code === 'P0002' ? 404 : 422;
      const message = code === '42501' || code === '22023' || code === 'P0002' || code === '40001'
        ? String(data.message) : code === '23505' ? 'Request changed or was already processed.' : 'Stock request could not be completed.';
      return json({ code, message, requestId }, status);
    }
    return json({ data, requestId }, 200);
  } catch {
    return json({ code: 'UNAVAILABLE', message: 'Unable to process stock request', requestId }, 503);
  }
});

