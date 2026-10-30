import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('short references update every order submit path, retain permissions and never truncate the sequence', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const sources = [
    [
      '202610240001_round_bar_availability.sql',
      'fti_catalog_raw_order_submit',
      'RM',
    ],
    [
      '202610290001_tmt_optional_grade.sql',
      'fti_catalog_selection_request_submit',
      'RM',
    ],
    [
      '202610250001_manual_material_requests.sql',
      'fti_catalog_manual_request_submit',
      'RM',
    ],
    [
      '202610270001_fastener_optional_dimensions.sql',
      'fti_catalog_fastener_order_submit',
      'FN',
    ],
    [
      '202610290004_fastener_guided_requirements.sql',
      'fti_catalog_fastener_requirement_submit',
      'FN',
    ],
    ['202610210001_tractor_cart_orders.sql', 'fti_commerce_cart_order', 'O'],
    ['202610160007_phase6_commerce.sql', 'fti_commerce_quote_order', 'O'],
  ];
  try {
    // Compile actual submit bodies without their unrelated application schemas.
    // The migration changes only the reference expression in these definitions.
    await db.exec(`create role anon; create role authenticated; create schema internal;
      set check_function_bodies=off;`);
    const originals = new Map<string, string>();
    for (const [file, name] of sources) {
      const source = await readFile(`supabase/migrations/${file}`, 'utf8');
      const start = source.indexOf(
        `create or replace function public.${name}(`,
      );
      assert.ok(start >= 0, name);
      await db.exec(source.slice(start, source.indexOf('$$;', start) + 3));
      const definition = await db.query<{ definition: string }>(
        `select pg_get_functiondef(oid) as definition from pg_proc where proname=$1`,
        [name],
      );
      originals.set(name, definition.rows[0].definition);
    }
    await db.exec(`revoke all on all functions in schema public from public,anon;
      grant execute on all functions in schema public to authenticated;`);
    await db.exec(
      await readFile(
        'supabase/migrations/202610300006_short_order_references.sql',
        'utf8',
      ),
    );
    for (const [, name, prefix] of sources) {
      const result = await db.query<{
        definition: string;
        allowed: boolean;
        anonymous: boolean;
      }>(
        `select pg_get_functiondef(oid) as definition,
          has_function_privilege('authenticated',oid,'execute') as allowed,
          has_function_privilege('anon',oid,'execute') as anonymous
         from pg_proc where proname=$1`,
        [name],
      );
      const original = originals.get(name)!;
      const expected = original
        .replace(
          /'FTI-RM-'\|\|upper\(replace\(p_id::text,'-',''\)\)/g,
          "internal.next_order_reference('RM')",
        )
        .replace(
          /'FTI-FN-'\|\|upper\(replace\(p_id::text,'-',''\)\)/g,
          "internal.next_order_reference('FN')",
        )
        .replace(
          /'FTI-O-'\|\|upper\(substr\(replace\((?:result|order_id)::text,'-',''\),1,12\)\)/g,
          "internal.next_order_reference('O')",
        );
      assert.notEqual(expected, original, name);
      assert.equal(result.rows[0].definition, expected, name);
      assert.ok(
        result.rows[0].definition.includes(
          `internal.next_order_reference('${prefix}')`,
        ),
      );
      assert.equal(result.rows[0].allowed, true);
      assert.equal(result.rows[0].anonymous, false);
    }
    const first = await db.query<{ ref: string }>(
      `select internal.next_order_reference('RM') as ref`,
    );
    assert.equal(first.rows[0].ref, 'RM-000001');
    const second = await db.query<{ ref: string }>(
      `select internal.next_order_reference('FN') as ref`,
    );
    assert.equal(second.rows[0].ref, 'FN-000002');
    const batch = await db.query<{ ref: string }>(
      `select internal.next_order_reference('O') as ref from generate_series(1,1000)`,
    );
    assert.equal(new Set(batch.rows.map((row) => row.ref)).size, 1000);
    assert.ok(batch.rows.every((row) => /^O-\d{6}$/.test(row.ref)));
    await db.exec(`select setval('internal.order_reference_sequence',999998)`);
    const boundary = await db.query<{ ref: string }>(
      `select internal.next_order_reference('RM') as ref from generate_series(1,2)`,
    );
    assert.deepEqual(
      boundary.rows.map((row) => row.ref),
      ['RM-999999', 'RM-1000000'],
    );
    await assert.rejects(
      db.query(`select internal.next_order_reference(null)`),
      /Invalid order reference prefix/,
    );
    await db.exec('set role authenticated');
    await assert.rejects(
      db.query(`select internal.next_order_reference('RM')`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
