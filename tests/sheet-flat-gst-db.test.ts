import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('existing Sheet MS and Flat rates lose GST once and fresh imports remain exclusive', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const importSql = readFileSync('scripts/publish-sheet-flat-rates.sql', 'utf8');
    await db.exec(importSql);
    // Reproduce the old inclusive catalogue state for all 25 existing variants.
    await db.exec(`update catalog.variant_attributes a set value_json=to_jsonb((a.value_json #>> '{}')::numeric * 1.18)
      where attribute_key='sheet_flat_net_prate';
      delete from catalog.variant_attributes where attribute_key in
        ('sheet_flat_gst_included','grade_list_price','grade_list_gst_included');`);
    const oldIds = (await db.query<{ id: string }>('select id from catalog.product_variants order by id')).rows;
    const migration = readFileSync('supabase/migrations/202610250003_sheet_flat_exclude_gst.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const rows = async () => (await db.query<{ category: string; size_label: string; attributes: Record<string, unknown> }>(`
      select c.slug as category,v.size_label,jsonb_object_agg(a.attribute_key,a.value_json) as attributes
      from catalog.product_variants v join catalog.products p on p.id=v.product_id
      join catalog.categories c on c.id=p.category_id join catalog.variant_attributes a on a.variant_id=v.id
      group by c.slug,v.id order by c.slug,v.size_label`)).rows;
    const exclusive = await rows();
    assert.equal(exclusive.length, 25);
    for (const row of exclusive) {
      const attrs = row.attributes;
      const expected = Number(attrs.sheet_flat_base_rate_pmt) + Number(attrs.sheet_flat_vadha);
      assert.equal(Number(attrs.sheet_flat_net_prate), expected);
      assert.equal(Number(attrs.grade_list_price), expected);
      assert.equal(Number(attrs.sheet_flat_gst), 0);
      assert.equal(attrs.sheet_flat_gst_included, false);
      assert.equal(attrs.grade_list_gst_included, false);
    }
    assert.equal(Number(exclusive.find(row => row.category === 'sheet' && row.size_label === '2MM')?.attributes.sheet_flat_net_prate), 56200);
    assert.equal(Number(exclusive.find(row => row.category === 'flat' && row.size_label === '5MM')?.attributes.sheet_flat_net_prate), 59000);
    await db.exec(importSql);
    const fresh = await rows();
    assert.equal(fresh.length, 25);
    for (const row of fresh) {
      assert.equal(Number(row.attributes.sheet_flat_net_prate), Number(row.attributes.sheet_flat_total));
      assert.equal(row.attributes.sheet_flat_gst_included, false);
    }
    assert.deepEqual((await db.query('select id from catalog.product_variants order by id')).rows, oldIds);
  } finally {
    await db.close();
  }
});
