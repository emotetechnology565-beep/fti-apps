import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Workbook import preserves weights, units, invalid cells and read-only exact lookups', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    const root = 'deployment/fastener-weights/';
    const manifest = JSON.parse(readFileSync(root + 'sql-editor-files.json', 'utf8')) as {
      max_part_bytes: number; files: {file: string; bytes: number}[];
    };
    for (const entry of manifest.files) {
      const sql = readFileSync(root + entry.file, 'utf8');
      assert.equal(Buffer.byteLength(sql), entry.bytes);
      assert.ok(entry.bytes <= manifest.max_part_bytes);
      const result = await db.exec(sql);
      if (entry.file === '03_verify.sql')
        assert.equal(result[0].rows[0].import_complete, true);
    }
    // Independent retries must preserve row identity and numeric conversions.
    for (const entry of manifest.files.filter(entry => entry.file.startsWith('02_')).reverse())
      await db.exec(readFileSync(root + entry.file, 'utf8'));
    const counts = (await db.query(`select count(*)::int as total,
      count(distinct chart)::int as charts,
      count(*) filter (where review_required)::int as review
      from public.fastener_weight_reference`)).rows[0];
    assert.deepEqual(counts, { total: 4925, charts: 26, review: 1 });
    await db.exec('set role anon');
    const lookup = async (chart: string, row: string, col: string) =>
      (await db.query<Record<string, unknown>>(
        'select * from public.fti_fastener_weight_lookup($1,$2,$3)', [chart, row, col])).rows;
    const [bolt] = await lookup('01 Half bolts+nuts Metric 1', '16mm', 'DIAMETER / M 5');
    assert.equal(Number(bolt.weight_kg_per_piece), 0.00448);
    assert.equal(bolt.weight_kg_per_metre, null);
    const [rod] = await lookup('16 Threaded rods', 'M2', 'Weight per Metre');
    assert.equal(Number(rod.weight_kg_per_metre), 0.0187);
    assert.equal(rod.weight_kg_per_piece, null);
    const [stud] = await lookup('17 UNC studs', '50 mm', 'DIAMETER / 1/2"');
    assert.equal(Number(stud.weight_kg_per_piece), 0.044);
    assert.deepEqual(await lookup('25 Socket head cap screws', '100', 'M16'), []);
    assert.deepEqual(await lookup('01 Half bolts+nuts Metric 1', '999mm', 'DIAMETER / M 5'), []);
    assert.deepEqual(await lookup('missing chart', '16mm', 'DIAMETER / M 5'), []);
    const bad = (await db.query(`select published_text,published_weight from public.fastener_weight_reference
      where review_required`)).rows[0];
    assert.deepEqual(bad, { published_text: '18.6.', published_weight: null });
    await assert.rejects(db.exec('delete from public.fastener_weight_reference'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.exec("update public.fastener_weight_reference set published_weight=1"), /permission denied/);
    assert.equal((await lookup('16 Threaded rods', 'M2', 'Weight per Metre')).length, 1);
  } finally {
    await db.close();
  }
});
