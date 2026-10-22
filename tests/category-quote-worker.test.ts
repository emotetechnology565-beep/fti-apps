import test from 'node:test';
import assert from 'node:assert/strict';
import { importDocumentKey, sealDocument } from '../supabase/functions/sales-media/crypto';

test('quotation worker sends a verified PDF as the template document header, and never sends corrupt bytes', async () => {
  const globals = globalThis as typeof globalThis & { Deno?: unknown };
  const oldDeno = globals.Deno;
  const oldFetch = globalThis.fetch;
  const config: Record<string, string> = {
    SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', OPERATIONS_WORKER_SECRET: 'worker',
    WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_BUSINESS_ID: '123', WHATSAPP_PHONE_NUMBER_ID: '456', WHATSAPP_GRAPH_VERSION: 'v23.0', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US',
    BUNNY_STORAGE_ZONE: 'private-zone', BUNNY_STORAGE_ACCESS_KEY: 'storage', BUNNY_STORAGE_ENDPOINT: 'https://storage.bunnycdn.com', BUNNY_MEDIA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const key = 'category-quote-files/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.pdf';
  const plain = new TextEncoder().encode('%PDF-1.7\nConfidential category quotation');
  const sealed = await sealDocument(plain, key, await importDocumentKey(config.BUNNY_MEDIA_ENCRYPTION_KEY));
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', plain)).toString('hex');
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let corrupt = false;
  let sends = 0;
  let finishes: string[] = [];
  try {
    globals.Deno = { env: { get: (name: string) => config[name] }, serve: (callback: typeof handler) => { handler = callback; } };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/message_templates?')) return Response.json({ data: [{ name: 'fti_category_quotation_v1', status: 'APPROVED', language: 'en_US' }] });
      if (url.endsWith('/fti_operations_whatsapp_claim')) return Response.json([{ id: 'job', template: 'fti_category_quotation_v1', parameters: ['Hex bolts', '21 Oct 2026 15:30 IST', 'FTI-Q-123'], phone: '+919000000000' }]);
      if (url.endsWith('/fti_operations_whatsapp_can_send')) return Response.json(true);
      if (url.endsWith('/fti_sales_category_quote_delivery')) return Response.json({ object_key: key, storage_zone: 'private-zone', size_bytes: plain.length, sha256_hex: hash });
      if (url.startsWith('https://storage.bunnycdn.com/')) return new Response(corrupt ? new Uint8Array([1, 2, 3]) : sealed.slice());
      if (url.endsWith('/456/media')) {
        assert.ok(init?.body instanceof FormData);
        const file = init.body.get('file') as File;
        assert.equal(file.type, 'application/pdf');
        assert.deepEqual(new Uint8Array(await file.arrayBuffer()), plain);
        return Response.json({ id: '789' });
      }
      if (url.endsWith('/456/messages')) {
        const payload = JSON.parse(init?.body as string);
        assert.equal(payload.to, '919000000000');
        assert.equal(payload.template.name, 'fti_category_quotation_v1');
        assert.deepEqual(payload.template.components[0], { type: 'header', parameters: [{ type: 'document', document: { id: '789', filename: 'FTI-quotation.pdf' } }] });
        sends++;
        return Response.json({ messages: [{ id: 'wamid.test' }] });
      }
      if (url.endsWith('/fti_operations_whatsapp_finish')) { finishes.push(JSON.parse(init?.body as string).p_result); return new Response(null, { status: 204 }); }
      throw new Error('Unexpected mocked endpoint');
    };
    const file = '../supabase/functions/operations-whatsapp/index';
    await import(file);
    assert.ok(handler);
    const run = () => handler!(new Request('https://test/worker', { method: 'POST', headers: { 'X-Worker-Secret': 'worker' } }));
    assert.equal((await run()).status, 200);
    assert.equal(sends, 1);
    assert.deepEqual(finishes, ['sent']);
    corrupt = true; finishes = [];
    assert.equal((await run()).status, 200);
    assert.equal(sends, 1, 'a corrupt private PDF never reaches the recipient');
    assert.deepEqual(finishes, ['retry']);
  } finally { globals.Deno = oldDeno; globalThis.fetch = oldFetch; }
});
