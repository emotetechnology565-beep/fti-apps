import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('bright bar copies all published round bar sizes with exactly 8000 uplift and is rerunnable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql',
      '202610220001_category_grade_sheets.sql', '202610220003_material_categories.sql',
      '202610220004_round_bar_sheet_data.sql', '202610220002_catalogue_filters.sql',
      '202610220005_shared_steel_categories.sql', '202610220006_grade_sheet_gst.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));

    const migration = readFileSync('supabase/migrations/202610220007_round_bright_bar_prices.sql', 'utf8');
    const prices = async (slug: string) => (await db.query<{ grade: string; size: string; price: string }>(`
      select a.value_json #>> '{}' as grade,b.value_json #>> '{}' as size,n.value_json #>> '{}' as price
      from catalog.products p join catalog.categories c on c.id=p.category_id
      join catalog.product_variants v on v.product_id=p.id and v.is_active
      join catalog.variant_attributes a on a.variant_id=v.id and a.attribute_key='grade'
      join catalog.variant_attributes b on b.variant_id=v.id and b.attribute_key='size_group'
      join catalog.variant_attributes n on n.variant_id=v.id and n.attribute_key='grade_list_price'
      where c.slug=$1 order by grade,size`, [slug])).rows;
    const before = await prices('round-bar-as-rolled');
    await db.exec(migration);
    const bright = await prices('round-bright-bar');
    assert.equal(bright.length, 68);
    assert.deepEqual(bright, before.map(row => ({ ...row, price: (Number(row.price) + 8000).toFixed(4) })));
    assert.deepEqual(await prices('round-bar-as-rolled'), before);
    await db.exec(migration);
    assert.deepEqual(await prices('round-bright-bar'), bright);
    const overlap = await db.query(`select id from catalog.product_variants group by id having count(*)>1`);
    assert.equal(overlap.rows.length, 0);
  } finally { await db.close(); }
});
