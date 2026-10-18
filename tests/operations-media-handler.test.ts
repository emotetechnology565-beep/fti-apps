import test from 'node:test';
import assert from 'node:assert/strict';

test('dashboard operations-media uploads ciphertext and serves plaintext only after authorization', async () => {
  const entityId = '00000000-0000-0000-0000-000000000001';
  const assetId = '00000000-0000-0000-0000-000000000002';
  const objectKey = `operations-files/order_mtc/${entityId}/${assetId}.pdf`;
  const plain = Buffer.from('%PDF-1.7\nprivate commercial terms');
  const config: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test', BUNNY_STORAGE_ZONE: 'public-test',
    BUNNY_STORAGE_ACCESS_KEY: 'storage-test', BUNNY_STORAGE_ENDPOINT: 'https://storage.bunnycdn.com',
    BUNNY_MEDIA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let stored: Uint8Array | undefined;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const originalFetch = globalThis.fetch;
  try {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (name: string) => config[name] }, serve: (callback: typeof handler) => { handler = callback; },
    };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user' });
      if (url.endsWith('/rpc/fti_operations_media_prepare')) return Response.json({ id: assetId, object_key: objectKey });
      if (url.endsWith('/rpc/fti_operations_media_complete')) {
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer service-test');
        assert.equal(JSON.parse(init?.body as string).p_storage_zone, 'public-test');
        return Response.json(null);
      }
      if (url.endsWith('/rpc/fti_operations_media_access')) return Response.json({
        object_key: objectKey, storage_zone: 'public-test', mime_type: 'application/pdf', size_bytes: plain.length,
      });
      if (url.includes('storage.bunnycdn.com')) {
        if (init?.method === 'PUT') {
          assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/octet-stream');
          stored = new Uint8Array(init.body as Uint8Array);
          return Response.json({ success: true });
        }
        return new Response(stored?.slice());
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const dashboardFunction = '../deployment/phase7/06_operations-media';
    await import(dashboardFunction);
    assert.ok(handler);
    const request = (body: unknown, authorized = true) => new Request('https://example.supabase.co/functions/v1/operations-media', {
      method: 'POST', headers: authorized ? { Authorization: 'Bearer buyer' } : {}, body: JSON.stringify(body),
    });
    assert.equal((await handler(request({ operation: 'download', assetId }, false))).status, 401);
    const uploaded = await handler(request({ operation: 'upload', kind: 'order_mtc', entityId, mimeType: 'application/pdf', base64: plain.toString('base64') }));
    assert.equal(uploaded.status, 200);
    assert.ok(stored);
    assert.notDeepEqual(stored, plain);
    assert.equal(Buffer.from(stored).includes(plain), false);
    const downloaded = await handler(request({ operation: 'download', assetId }));
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from((await downloaded.json()).data.base64, 'base64'), plain);
    stored[stored.length - 1] ^= 1;
    assert.equal((await handler(request({ operation: 'download', assetId }))).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
  }
});
