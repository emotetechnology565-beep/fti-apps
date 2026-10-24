import test from 'node:test';
import assert from 'node:assert/strict';

test('raw-material worker sends both templates, skips removed recipients and does not retry ambiguous sends', async () => {
  const globals = globalThis as typeof globalThis & { Deno?: unknown };
  const oldDeno = globals.Deno; const oldFetch = globalThis.fetch;
  const config: Record<string, string> = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', OPERATIONS_WORKER_SECRET: 'worker',
    WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_BUSINESS_ID: '123', WHATSAPP_PHONE_NUMBER_ID: '456', WHATSAPP_GRAPH_VERSION: 'v23.0', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US' };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let mode = 'success'; let sends = 0; const finishes: string[] = [];
  const names = ['fti_raw_material_received_v1', 'fti_raw_material_admin_v1'];
  try {
    globals.Deno = { env: { get: (key: string) => config[key] }, serve: (callback: typeof handler) => { handler = callback; } };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/message_templates?')) return Response.json({ data: names.map(name => ({ name, status: 'APPROVED', language: 'en_US' })) });
      if (url.endsWith('/fti_operations_whatsapp_claim')) return Response.json([]);
      if (url.endsWith('/fti_raw_material_claim')) return Response.json(names.map((template, i) => ({ id: String(i), template, phone: '+919000000001', parameters: Array(i ? 9 : 6).fill('Sample') })));
      if (url.endsWith('/fti_raw_material_can_send')) return Response.json(mode !== 'removed');
      if (url.endsWith('/fti_raw_material_finish')) { finishes.push(JSON.parse(String(init?.body)).p_result); return new Response(null, { status: 204 }); }
      if (url.endsWith('/456/messages')) {
        sends++; const payload = JSON.parse(String(init?.body));
        assert.ok(names.includes(payload.template.name));
        assert.equal(payload.template.components[0].parameters.length, payload.template.name.includes('admin') ? 9 : 6);
        if (mode === 'timeout') throw new Error('Timeout');
        return Response.json({ messages: [{ id: 'wamid.test' }] });
      }
      throw new Error('Unexpected endpoint: ' + url);
    };
    const file = '../supabase/functions/operations-whatsapp/index'; await import(file);
    const run = () => handler!(new Request('https://test/worker', { method: 'POST', headers: { 'X-Worker-Secret': 'worker' } }));
    assert.equal((await run()).status, 200); assert.equal(sends, 2); assert.deepEqual(finishes.splice(0), ['sent', 'sent']);
    mode = 'removed'; await run(); assert.equal(sends, 2); assert.deepEqual(finishes.splice(0), ['failed', 'failed']);
    mode = 'timeout'; await run(); assert.equal(sends, 4); assert.deepEqual(finishes.splice(0), ['manual_review', 'manual_review']);
  } finally { globals.Deno = oldDeno; globalThis.fetch = oldFetch; }
});
