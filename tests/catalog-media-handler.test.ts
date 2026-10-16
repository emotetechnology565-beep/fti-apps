import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCatalogMedia, type CatalogMediaConfig } from '../supabase/functions/catalog-media/handler';

const productId = '00000000-0000-0000-0000-000000000001';
const assetId = '00000000-0000-0000-0000-000000000002';
const objectKey = `product-images/${productId}/${assetId}.jpg`;
const config: CatalogMediaConfig = {
  supabaseUrl: 'https://test.supabase.co', anonKey: 'isolated-anon', serviceKey: 'isolated-service',
  storageZone: 'isolated-zone', storageAccessKey: 'isolated-storage-password',
  storageEndpoint: 'https://storage.bunnycdn.com', cdnBaseUrl: 'https://photos.b-cdn.net',
};
const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]).toString('base64');
const request = (body: unknown, auth = 'Bearer user-session') => new Request('https://test.supabase.co/functions/v1/catalog-media', {
  method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(body),
});

test('catalogue image upload verifies identity, checks bytes and never exposes storage credentials', async () => {
  let calls = 0;
  const send: typeof fetch = async (url, init) => {
    calls++;
    const path = String(url);
    if (path.endsWith('/auth/v1/user')) return Response.json({ id: 'staff' });
    if (path.endsWith('/rpc/fti_catalog_media_prepare')) {
      assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, 'Bearer user-session');
      return Response.json({ id: assetId, object_key: objectKey });
    }
    if (path.endsWith('/rpc/fti_catalog_media_complete')) {
      assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, 'Bearer isolated-service');
      return Response.json(null);
    }
    if (path.includes('storage.bunnycdn.com')) {
      assert.equal((init?.headers as Record<string, string>).AccessKey, config.storageAccessKey);
      assert.equal(init?.method, 'PUT');
      return Response.json({ success: true });
    }
    throw new Error('Unexpected request');
  };
  assert.equal((await handleCatalogMedia(request({ operation: 'upload', productId, base64: image }, ''), config, send)).status, 401);
  assert.equal((await handleCatalogMedia(request({ operation: 'upload', productId, base64: 'not-an-image' }), config, send)).status, 400);
  assert.equal(calls, 0);
  const uploaded = await handleCatalogMedia(request({ operation: 'upload', productId, base64: image }), config, send);
  assert.equal(uploaded.status, 200);
  const body = await uploaded.text();
  assert.ok(body.includes('photos.b-cdn.net'));
  assert.ok(!body.includes(config.storageAccessKey));
  assert.ok(!body.includes(config.serviceKey));
  assert.equal(calls, 4);
});

test('failed Bunny upload cannot make a product photo public', async () => {
  let rejected = false;
  const send: typeof fetch = async (url, init) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/user')) return Response.json({ id: 'staff' });
    if (path.endsWith('/rpc/fti_catalog_media_prepare')) return Response.json({ id: assetId, object_key: objectKey });
    if (path.endsWith('/rpc/fti_catalog_media_complete')) {
      rejected = JSON.parse(init?.body as string).p_status === 'rejected';
      return Response.json(null);
    }
    if (path.includes('storage.bunnycdn.com')) return Response.json({}, { status: 401 });
    throw new Error('Unexpected request');
  };
  const response = await handleCatalogMedia(request({ operation: 'upload', productId, base64: image }), config, send);
  assert.equal(response.status, 502);
  assert.equal(rejected, true);
});
