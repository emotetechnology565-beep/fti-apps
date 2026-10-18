import test from 'node:test';
import assert from 'node:assert/strict';
import { readIdentityResponse } from '../src/features/auth/services/identity-response';
import { identityErrorMessage } from '../src/features/auth/services/identity-error';

test('approval accepts successful void responses, including empty JSON bodies', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('', { headers: { 'Content-Type': 'application/json' } }),
    Response.json(null),
    Response.json({ data: null }),
  ]) {
    assert.equal(await readIdentityResponse(response, 'fti_review_business'), null);
  }
});

test('account reads require data and malformed or failed writes never report success', async () => {
  assert.deepEqual(await readIdentityResponse(Response.json({ data: [] }), 'fti_review_queue'), []);
  await assert.rejects(readIdentityResponse(new Response(''), 'fti_review_queue'), /unreadable response/);
  await assert.rejects(readIdentityResponse(new Response('<html>Error<\/html>'), 'fti_review_business'), /unreadable response/);
  await assert.rejects(readIdentityResponse(Response.json({ message: 'Cannot review your own business' }, { status: 403 }), 'fti_review_business'), /Cannot review your own business.*HTTP 403/);
  await assert.rejects(readIdentityResponse(new Response('', { status: 503 }), 'fti_review_business'), /HTTP 503/);
});

test('native response objects do not need to share the global Response constructor', async () => {
  const response = {
    status: 409,
    headers: { get: () => 'review-reference' },
    json: async () => ({ message: 'Application changed; refresh before reviewing' }),
  };
  assert.match(await identityErrorMessage({ context: response }), /Application changed.*HTTP 409; reference review-reference/);
});
