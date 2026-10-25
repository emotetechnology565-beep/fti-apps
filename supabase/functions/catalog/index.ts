const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const writeOperations = new Set([
  'fti_catalog_manual_request_submit',
  'fti_catalog_selection_request_submit', 'fti_catalog_selection_admin',
  'fti_catalog_selection_spec_save', 'fti_catalog_selection_size_save', 'fti_catalog_selection_option_save',
  'fti_catalog_raw_order_submit', 'fti_catalog_raw_orders', 'fti_catalog_raw_recipients',
  'fti_catalog_raw_recipient_save', 'fti_catalog_raw_recipient_remove', 'fti_catalog_raw_delivery_replay',
  'fti_catalog_admin_list',
  'fti_catalog_category_upsert',
  'fti_catalog_product_upsert',
  'fti_catalog_product_status',
  'fti_catalog_media_admin',
  'fti_catalog_grade_sheet_get',
  'fti_catalog_grade_sheet_save',
  'fti_catalog_grade_sheet_publish',
]);

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const json = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { ...cors, 'X-Request-Id': requestId },
    });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST')
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const apikey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !apikey)
    return json({ code: 'UNAVAILABLE', message: 'Catalogue is unavailable' }, 503);

  try {
    const raw = await request.text();
    if (raw.length > 262144)
      return json({ code: 'INVALID_INPUT', message: 'Request too large' }, 413);
    const body = JSON.parse(raw);
    const operation = body.operation;
    if (
      typeof operation !== 'string' ||
      (!operation.startsWith('fti_catalog_'))
    )
      return json({ code: 'INVALID_OPERATION', message: 'Unsupported operation' }, 400);

    const authorization = request.headers.get('Authorization');
    if (writeOperations.has(operation)) {
      if (!authorization?.startsWith('Bearer '))
        return json({ code: 'UNAUTHENTICATED', message: 'Sign in required' }, 401);
      const verified = await fetch(`${url}/auth/v1/user`, {
        headers: { Authorization: authorization, apikey },
        signal: AbortSignal.timeout(8000),
      });
      if (!verified.ok)
        return json({ code: 'UNAUTHENTICATED', message: 'Session expired; sign in again' }, 401);
    }

    const allowed =
      operation === 'fti_catalog_list' ||
      operation === 'fti_catalog_filtered_list' ||
      operation === 'fti_catalog_selection_options' ||
      operation === 'fti_catalog_manual_preview' ||
      operation === 'fti_catalog_product_get' ||
      operation === 'fti_catalog_media_public' ||
      writeOperations.has(operation);
    if (!allowed)
      return json({ code: 'INVALID_OPERATION', message: 'Unsupported operation' }, 400);
    const args = body.arguments ?? {};
    const headers: Record<string, string> = {
      apikey,
      'Content-Type': 'application/json',
    };
    if (authorization) headers.Authorization = authorization;
    const response = await fetch(`${url}/rest/v1/rpc/${operation}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const status = data.code === '42501' ? 403 : data.code === '23505' ? 409 : 422;
      const message =
        data.code === '42501'
          ? data.message
          : data.code === '23505'
            ? 'That category, product slug, or SKU is already in use.'
            : data.code === '22023' || data.code === 'P0002'
              ? data.message
              : 'Catalogue request could not be completed.';
      return json({ code: data.code, message, requestId }, status);
    }
    return json({ data, requestId });
  } catch {
    return json({ code: 'UNAVAILABLE', message: 'Unable to process catalogue request', requestId }, 503);
  }
});
