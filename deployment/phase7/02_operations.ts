const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const operations = new Set(['fti_operations_tickets', 'fti_operations_ticket_create', 'fti_operations_thread', 'fti_operations_reply', 'fti_operations_orders', 'fti_operations_shipments', 'fti_operations_dispatch', 'fti_operations_deliver', 'fti_operations_notifications', 'fti_operations_read', 'fti_operations_report','fti_operations_media_list','fti_operations_failed_events','fti_operations_replay','fti_operations_whatsapp_preferences','fti_operations_whatsapp_opt_in','fti_operations_whatsapp_attention','fti_operations_whatsapp_replay','fti_operations_audit','fti_operations_daily','fti_operations_announcements','fti_operations_content_queue','fti_operations_content_save','fti_operations_content_publish']);
Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const json = (body: unknown, status: number) => Response.json(body, {
    status, headers: { ...cors, 'X-Request-Id': requestId },
  });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) return json({ code: 'UNAVAILABLE', message: 'Operations service is unavailable' }, 503);
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
    const text = await response.text();
    const voidOperation = ['fti_operations_whatsapp_opt_in', 'fti_operations_whatsapp_replay',
      'fti_operations_reply', 'fti_operations_deliver', 'fti_operations_read',
      'fti_operations_replay', 'fti_operations_content_publish'].includes(String(body.operation));
    const data = response.ok && voidOperation && !text.trim() ? null : JSON.parse(text);
    if (!response.ok) {
      const code = typeof data?.code === 'string' ? data.code : 'FAILED';
      const status = code === '42501' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : 422;
      const message = ['42501','22023','P0002'].includes(code) ? String(data.message)
        : code === '23505' ? 'This record already exists.' : 'Operations request could not be completed.';
      return json({ code, message, requestId }, status);
    }
    return json({ data, requestId }, 200);
  } catch { return json({ code: 'UNAVAILABLE', message: 'Unable to process operations request', requestId }, 503); }
});
