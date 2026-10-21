import test from 'node:test';
import assert from 'node:assert/strict';

test('new cart orders wake WhatsApp delivery in background; retries and delivery failures do not duplicate orders', async () => {
  const globals = globalThis as typeof globalThis & { Deno?: unknown; EdgeRuntime?: unknown };
  const previous = { Deno: globals.Deno, EdgeRuntime: globals.EdgeRuntime, fetch: globalThis.fetch };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const tasks: Promise<unknown>[] = [];
  let replayed = false;
  let failed = false;
  let wakes = 0;
  try {
    globals.Deno = { env: { get: (key: string) => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'anon', OPERATIONS_WORKER_SECRET: 'worker-test' } as Record<string, string>)[key] }, serve: (callback: typeof handler) => { handler = callback; } };
    globals.EdgeRuntime = { waitUntil: (task: Promise<unknown>) => tasks.push(task) };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'buyer' });
      if (url.endsWith('/rpc/fti_commerce_cart_order')) {
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer buyer-jwt');
        return Response.json({ id: 'order', replayed });
      }
      assert.ok(url.endsWith('/functions/v1/operations-whatsapp'));
      assert.equal((init?.headers as Record<string, string>)['X-Worker-Secret'], 'worker-test');
      wakes++;
      if (failed) throw new Error('Worker unavailable');
      return Response.json({ claimed: wakes === 1 ? 10 : 0 });
    };
    const module = '../supabase/functions/commerce/index';
    await import(module);
    assert.ok(handler);
    const request = () => new Request('https://test.supabase.co/functions/v1/commerce', { method: 'POST', headers: { Authorization: 'Bearer buyer-jwt' }, body: JSON.stringify({ operation: 'fti_commerce_cart_order', arguments: {} }) });
    assert.equal((await handler(request())).status, 200);
    await Promise.all(tasks);
    assert.equal(wakes, 2, 'full batches are drained promptly');
    replayed = true;
    assert.equal((await handler(request())).status, 200);
    assert.equal(wakes, 2, 'replayed submissions do not wake delivery again');
    replayed = false; failed = true;
    assert.equal((await handler(request())).status, 200, 'a worker failure cannot report a committed order as failed');
    await Promise.all(tasks);
    assert.equal(wakes, 3);
  } finally {
    globals.Deno = previous.Deno; globals.EdgeRuntime = previous.EdgeRuntime; globalThis.fetch = previous.fetch;
  }
});
