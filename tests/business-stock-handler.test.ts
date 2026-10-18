import test from 'node:test';
import assert from 'node:assert/strict';

test('business-stock authenticates every route, limits RPCs and forwards caller JWT with version conflicts', async () => {
  const originalDeno = (globalThis as {Deno?: unknown}).Deno;
  const originalFetch = globalThis.fetch;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let calls = 0;
  let denied = false;
  let conflict = false;
  try {
    (globalThis as {Deno?: unknown}).Deno = {
      env: {get: (name: string) => ({SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key'}[name])},
      serve: (fn: typeof handler) => {handler = fn;},
    };
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/auth/v1/user')) return Response.json(denied ? {} : {id: 'verified-user'}, {status: denied ? 401 : 200});
      calls++;
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer caller-jwt');
      assert.ok(String(input).includes('/rest/v1/rpc/fti_stock_'));
      return conflict ? Response.json({code: '40001',message: 'Listing changed; refresh before saving'},{status: 400}) : Response.json([]);
    };
    const dashboardFunction = '../deployment/phase8/03_business-stock';
    await import(dashboardFunction);
    assert.ok(handler);
    const request = (body: unknown, auth = true) => new Request('https://example.supabase.co/functions/v1/business-stock',{method: 'POST',headers: auth ? {Authorization: 'Bearer caller-jwt'} : {},body: JSON.stringify(body)});
    assert.equal((await handler(request({operation: 'fti_stock_list'},false))).status,401);
    assert.equal((await handler(request({operation: 'fti_operations_whatsapp_claim'}))).status,400);
    assert.equal((await handler(request({operation: 'fti_stock_media_complete'}))).status,400);
    assert.equal((await handler(request({operation: 'fti_stock_list',arguments: []}))).status,400);
    denied = true;
    assert.equal((await handler(request({operation: 'fti_stock_list'}))).status,401);
    assert.equal(calls,0);
    denied = false;
    const success = await handler(request({operation: 'fti_stock_list',arguments: {p_scope: 'browse'}}));
    assert.equal(success.status,200);assert.deepEqual((await success.json()).data,[]);
    conflict = true;
    const failed = await handler(request({operation: 'fti_stock_save',arguments: {}}));
    assert.equal(failed.status,409);assert.match((await failed.json()).message,/Listing changed/);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as {Deno?: unknown}).Deno = originalDeno;
  }
});
