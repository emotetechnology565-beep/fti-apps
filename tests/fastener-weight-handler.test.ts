import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleFastenerWeight } from '../supabase/functions/fastener-weight/handler';

const config = { supabaseUrl: 'https://example.supabase.co', anonKey: 'public-key' };
const body = { chart: '01 Half bolts+nuts Metric 1', rowLabel: '16mm', columnLabel: 'DIAMETER / M 5', quantity: 100 };
const request = (value: unknown) => new Request('https://example.com', { method: 'POST', body: JSON.stringify(value) });
const bolt = { weight_basis: '100_pieces', weight_kg_per_piece: 0.00448, weight_kg_per_metre: null };
const rod = { weight_basis: 'metre', weight_kg_per_piece: null, weight_kg_per_metre: 0.0187 };

test('lookup calls only the fixed RPC using read-only credentials and computes piece totals', async () => {
  const send: typeof fetch = async (url, init) => {
    assert.equal(url, `${config.supabaseUrl}/rest/v1/rpc/fti_fastener_weight_lookup`);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer public-key');
    assert.deepEqual(JSON.parse(init?.body as string), {
      p_chart: body.chart, p_row_label: body.rowLabel, p_column_label: body.columnLabel,
    });
    return Response.json([bolt]);
  };
  const response = await handleFastenerWeight(request(body), config, send);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(Math.abs(data.totalWeightKg - 0.448) < 1e-12);
  assert.equal(data.unit, 'kg/piece');
  assert.equal(data.approximate, true);
});

test('rod totals require length and other charts reject a length multiplier', async () => {
  const send: typeof fetch = async () => Response.json([rod]);
  const noLength = await (await handleFastenerWeight(request(body), config, send)).json();
  assert.equal(noLength.totalWeightKg, null);
  assert.equal(noLength.requiresLength, true);
  const withLength = await (await handleFastenerWeight(request({ ...body, lengthM: 2 }), config, send)).json();
  assert.ok(Math.abs(withLength.totalWeightKg - 3.74) < 1e-12);
  assert.equal((await handleFastenerWeight(request({ ...body, lengthM: 2 }), config, async () => Response.json([bolt]))).status, 400);
});

test('invalid requests never call the database', async () => {
  const send: typeof fetch = async () => { throw new Error('Must not fetch'); };
  for (const value of [null, [], {}, { ...body, quantity: 0 }, { ...body, quantity: 1.5 },
    { ...body, lengthM: -1 }, { ...body, operation: 'delete' }, { ...body, chart: '' }]) {
    assert.equal((await handleFastenerWeight(request(value), config, send)).status, 400);
  }
  assert.equal((await handleFastenerWeight(new Request('https://example.com', { method: 'POST', body: '{' }), config, send)).status, 400);
  assert.equal((await handleFastenerWeight(request('x'.repeat(5000)), config, send)).status, 413);
  assert.equal((await handleFastenerWeight(new Request('https://example.com'), config, send)).status, 405);
  const options = await handleFastenerWeight(new Request('https://example.com', { method: 'OPTIONS' }), config, send);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), '*');
});

test('no match, duplicate matches, database errors and timeouts are explicit', async () => {
  for (const [response, status] of [
    [Response.json([]), 404], [Response.json([bolt, bolt]), 409],
    [Response.json({ secret: 'must not leak' }, { status: 404 }), 503],
    [Response.json({}), 503],
  ] as const) {
    const result = await handleFastenerWeight(request(body), config, async () => response);
    assert.equal(result.status, status);
    assert.ok(!(await result.text()).includes('must not leak'));
  }
  assert.equal((await handleFastenerWeight(request(body), config, async () => { throw new Error('timeout'); })).status, 503);
  assert.equal((await handleFastenerWeight(request(body), {})).status, 503);
});

test('manual deployment file contains the current tested handler and entry point', () => {
  const bundle = readFileSync('deployment/fastener-weights/fastener-weight.ts', 'utf8');
  assert.ok(bundle.includes(readFileSync('supabase/functions/fastener-weight/handler.ts', 'utf8')));
  assert.ok(bundle.includes('Deno.serve('));
  assert.ok(!bundle.includes('import '));
});
