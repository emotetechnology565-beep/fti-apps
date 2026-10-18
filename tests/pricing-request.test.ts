import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPricing } from '../src/features/pricing/services/pricing-request';

const connection = { url: 'https://test.supabase.co/', key: 'public-key', accessToken: 'current-staff-token' };
test('market creation forwards the current user token and exact market details once', async () => {
  let calls = 0;
  const args = {p_code:'TEST_DELHI',p_name:'Delhi Test Market',p_state:'Delhi'};
  const result = await requestPricing(connection, 'fti_pricing_market_create', args, async (url, init) => {
    calls++;
    assert.equal(url, 'https://test.supabase.co/functions/v1/pricing');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, {apikey:'public-key',Authorization:'Bearer current-staff-token','Content-Type':'application/json'});
    assert.deepEqual(JSON.parse(String(init?.body)), {operation:'fti_pricing_market_create',arguments:args});
    return Response.json({data:'market-id'});
  });
  assert.equal(result, 'market-id');
  assert.equal(calls, 1);
});

test('public markets work without sign-in but market writes require a user session', async () => {
  const guest = {url:connection.url,key:connection.key};
  assert.deepEqual(await requestPricing(guest, 'fti_pricing_markets', {}, async (_url, init) => {
    assert.equal((init?.headers as Record<string,string>).Authorization, 'Bearer public-key');
    return Response.json({data:[]});
  }), []);
  await assert.rejects(requestPricing(guest, 'fti_pricing_market_create', {}, async () => {
    assert.fail('Guest writes must not be sent');
  }), /Sign in and complete authenticator/);
});

test('pricing shows server errors, HTTP status and references without reporting false success', async () => {
  for (const [status,message] of [[401,'Session expired; sign in again'],[403,'Staff MFA verification required'],[409,'That market code or draft variant is already in use.']] as const) {
    await assert.rejects(requestPricing(connection,'fti_pricing_market_create',{},async () => Response.json({message,requestId:'test-reference'},{status})), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(message));
      assert.ok(error.message.includes(`HTTP ${status}; reference test-reference`));
      return true;
    });
  }
  await assert.rejects(requestPricing(connection,'fti_pricing_market_create',{},async () => new Response('<html>Unavailable</html>',{status:503})), /HTTP 503/);
  for (const response of [new Response(''), Response.json(null), Response.json({data:null})]) {
    await assert.rejects(requestPricing(connection,'fti_pricing_market_create',{},async () => response), /unexpected response/);
  }
  let attempts=0;
  await assert.rejects(requestPricing(connection,'fti_pricing_market_create',{},async () => { attempts++;throw new TypeError('Network failed'); }), /Check your connection/);
  assert.equal(attempts,1);
});
