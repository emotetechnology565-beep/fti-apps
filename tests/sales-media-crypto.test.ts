import test from 'node:test';
import assert from 'node:assert/strict';
import { importDocumentKey, openDocument, sealDocument } from '../supabase/functions/sales-media/crypto';

test('RFQ documents stay encrypted on the shared public Bunny zone', async () => {
  const key = await importDocumentKey(Buffer.alloc(32, 7).toString('base64'));
  const path = 'rfq-files/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.pdf';
  const plain = new TextEncoder().encode('%PDF-1.7\nprivate invoice details');
  const sealed = await sealDocument(plain, path, key);
  assert.notDeepEqual(sealed, plain);
  assert.equal(new TextDecoder().decode(sealed).includes('private invoice details'), false);
  assert.deepEqual(await openDocument(sealed, path, key, 3 * 1024 * 1024), plain);
  await assert.rejects(openDocument(sealed, `${path}.other`, key, 3 * 1024 * 1024));
  const tampered = sealed.slice();
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(openDocument(tampered, path, key, 3 * 1024 * 1024));
  await assert.rejects(openDocument(plain, path, key, 3 * 1024 * 1024));
  await assert.rejects(importDocumentKey('not-a-key'));
});
