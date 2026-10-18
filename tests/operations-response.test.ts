import test from 'node:test';
import assert from 'node:assert/strict';
import { readOperationsResponse } from '../src/features/operations/services/operations-response';

test('WhatsApp opt-in accepts successful void responses without a false service failure', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('', { headers: { 'Content-Type': 'application/json' } }),
    Response.json(null),
    Response.json({ data: null }),
  ]) assert.equal(await readOperationsResponse(response, 'fti_operations_whatsapp_opt_in'), null);
});

test('operations reads and malformed or failed consent writes never report success', async () => {
  assert.deepEqual(await readOperationsResponse(Response.json({ data: { enabled: true } }), 'fti_operations_whatsapp_preferences'), { enabled: true });
  for (const body of ['', 'null', '{}', '<html>Unavailable</html>']) {
    await assert.rejects(readOperationsResponse(new Response(body), 'fti_operations_whatsapp_preferences'), /unreadable|unexpected/);
  }
  await assert.rejects(readOperationsResponse(new Response('<html>Error</html>'), 'fti_operations_whatsapp_opt_in'), /unreadable/);
  await assert.rejects(readOperationsResponse(Response.json({ message: 'A verified WhatsApp phone number is required' }, { status: 422 }), 'fti_operations_whatsapp_opt_in'), /verified WhatsApp phone.*HTTP 422/);
  await assert.rejects(readOperationsResponse(new Response('', { status: 503 }), 'fti_operations_whatsapp_opt_in'), /HTTP 503/);
  await assert.rejects(readOperationsResponse(new Response('', { status: 401 }), 'fti_operations_whatsapp_opt_in'), /session expired.*HTTP 401/);
});
