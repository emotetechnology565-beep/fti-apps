import test from 'node:test';
import assert from 'node:assert/strict';
import { identityErrorMessage } from '../src/features/auth/services/identity-error';

test('account errors preserve server validation and the request reference', async () => {
  const message = await identityErrorMessage({
    context: Response.json({ message: 'Cannot review your own business', requestId: 'review-123' }, { status: 403 }),
  });
  assert.equal(message, 'Cannot review your own business (HTTP 403; reference review-123)');
});

test('account errors distinguish gateway authentication and network failures', async () => {
  const gateway = await identityErrorMessage({ context: new Response('Unauthorized', { status: 401 }) });
  assert.match(gateway, /Sign in again/);
  assert.match(gateway, /HTTP 401/);
  const network = await identityErrorMessage({ name: 'FunctionsFetchError' });
  assert.match(network, /Check your connection/);
  assert.match(network, /Refresh the application list/);
});

test('account errors handle JSON null and retain an HTTP request reference', async () => {
  const message = await identityErrorMessage({
    context: Response.json(null, { status: 503, headers: { 'x-request-id': 'gateway-123' } }),
  });
  assert.match(message, /HTTP 503; reference gateway-123/);
});
