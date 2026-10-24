import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { availableCatalogFilters, matchesCatalogSize } from '../src/features/catalog/model/available-filters';
import type { Product } from '../src/features/catalog/model/types';

test('both round bar categories preserve pricing, history and publish lifecycle with exact availability', async () => {
  const db = new PGlite();
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  const actor = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160003_phase4_pricing.sql',
      '202610220001_category_grade_sheets.sql', '202610220003_material_categories.sql',
      '202610220004_round_bar_sheet_data.sql', '202610220002_catalogue_filters.sql',
      '202610220005_shared_steel_categories.sql', '202610220006_grade_sheet_gst.sql',
      '202610220007_round_bright_bar_prices.sql', '202610230001_raw_material_orders.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    }
    const category = await value<string>("select id as data from catalog.categories where slug='round-bar-as-rolled'");
    const product = await value<string>('select product_id as data from catalog.category_grade_sheets where category_id=$1', [category]);
    const snapshot = async (target = product) => (await db.query<{ id: string; price: unknown }>(`
      select v.id,a.value_json as price from catalog.product_variants v
      join catalog.variant_attributes a on a.variant_id=v.id and a.attribute_key='grade_list_price'
      where product_id=$1 order by v.id`, [target])).rows;
    const before = await snapshot();
    const brightProduct = await value<string>("select product_id as data from catalog.category_grade_sheets where category_id=(select id from catalog.categories where slug='round-bright-bar')");
    const brightCategory = await value<string>("select id as data from catalog.categories where slug='round-bright-bar'");
    const brightBefore = await snapshot(brightProduct);
    const migration = readFileSync('supabase/migrations/202610240001_round_bar_availability.sql', 'utf8');
    await db.exec(migration);
    const get = () => value<Product>('select public.fti_catalog_product_get($1) as data', [product]);
    const result = await get();
    assert.equal(result.variants.length, 102);
    const options = availableCatalogFilters(result.variants);
    assert.equal(options.sizes.length, 36);
    assert.equal(options.grades.length, 34);
    assert.ok(!options.sizes.includes(19));
    for (const grade of ['MS', 'FE-500', 'FE-550', 'FE-600', 'FE-600S', 'FE-550D', 'FE-650', 'FE-700']) {
      assert.ok(!options.grades.includes(grade));
    }
    for (const grade of ['SAE-4130', 'SAE-4140', 'SAE-8620', 'SCM-420', 'SCM-435', 'ST-52.3']) {
      assert.ok(options.grades.includes(grade));
    }
    assert.deepEqual(await snapshot(), before);
    for (const size of options.sizes) {
      assert.equal(availableCatalogFilters(result.variants, size).grades.length, 34);
      for (const grade of options.grades) {
        const matches = result.variants.filter(v => v.attributes.grade === grade && matchesCatalogSize(v, size));
        assert.equal(matches.length, 1, `${grade} / ${size} must have exactly one pricing or quote option`);
        assert.equal(await value<boolean>('select internal.catalog_variant_size_matches($1,$2,$3,$4) as data',
          [matches[0].id, matches[0].diameter_mm, matches[0].attributes.size_group ?? matches[0].size_label, size]), true);
      }
    }
    for (const v of result.variants) assert.equal(matchesCatalogSize(v, 19), false);
    const quote = result.variants.find(v => v.attributes.grade === 'EN-8D' && v.attributes.quote_only === true)!;
    assert.deepEqual(quote.attributes.available_sizes, [8, 10, 12, 51]);
    assert.equal(quote.attributes.grade_list_price, undefined);
    const priced = result.variants.find(v => v.attributes.grade === 'EN-8D' && matchesCatalogSize(v, 16))!;
    assert.equal(priced.attributes.grade_list_price, '13500.0000');
    assert.equal(await value<boolean>('select internal.catalog_variant_size_matches($1,$2,$3,19) as data',
      [priced.id, priced.diameter_mm, priced.attributes.size_group]), false);

    await db.exec('set role anon');
    const page = await value<{ items: Product[]; grades: string[] }>("select public.fti_catalog_filtered_list(p_category=>'round-bar-as-rolled',p_size=>8,p_grade=>'EN-8D') as data");
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].variants.length, 1);
    assert.equal(page.grades.length, 34);
    assert.equal((await value<{ total: number }>("select public.fti_catalog_filtered_list(p_category=>'round-bar-as-rolled',p_size=>19) as data")).total, 0);
    await db.exec('reset role');
    const bright = await value<Product>("select public.fti_catalog_product_get(product_id) as data from catalog.category_grade_sheets where category_id=(select id from catalog.categories where slug='round-bright-bar')");
    assert.equal(bright.variants.length, 102);
    assert.deepEqual(availableCatalogFilters(bright.variants), options);
    assert.deepEqual(await snapshot(brightProduct), brightBefore);
    assert.equal(bright.variants.find(v => v.attributes.grade === 'EN-8D' && matchesCatalogSize(v, 16))!.attributes.grade_list_price, '21500.0000');
    assert.deepEqual(bright.variants.find(v => v.attributes.grade === 'EN-8D' && v.attributes.quote_only === true)!.attributes.available_sizes, [8, 10, 12, 51]);
    await assert.rejects(db.query("update catalog.category_grade_sheets set rows=rows||jsonb_build_array(jsonb_build_object('grade','FE-500')) where category_id=$1", [category]), /unavailable/);

    // Re-publishing must restore quote options while retaining the exact grade list.
    await db.query('insert into auth.users values($1,$2,now())', [actor, '919000000001']);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [actor, '{"aal":"aal2"}']);
    await db.exec("set role authenticated; select public.fti_save_profile('Round bar tester'); reset role");
    await db.query("insert into identity.user_roles values($1,'super_admin')", [actor]);
    const revision = await value<number>('select revision as data from catalog.category_grade_sheets where category_id=$1', [category]);
    const brightRevision = await value<number>('select revision as data from catalog.category_grade_sheets where category_id=$1', [brightCategory]);
    await db.exec('set role authenticated');
    await db.query('select public.fti_catalog_grade_sheet_publish($1,$2)', [category, revision]);
    await db.query('select public.fti_catalog_grade_sheet_publish($1,$2)', [brightCategory, brightRevision]);
    const buyer = { name: 'Round bar tester', business: 'Test Works', location: 'Pune, Maharashtra 411001', whatsapp_consent: true };
    const requestId = '00000000-0000-0000-0000-000000000002';
    await db.query('select public.fti_catalog_raw_order_submit($1,$2,8,\'1\',$3)', [requestId, quote.id, buyer]);
    await assert.rejects(db.query('select public.fti_catalog_raw_order_submit($1,$2,19,\'1\',$3)',
      ['00000000-0000-0000-0000-000000000003', priced.id, buyer]), /available size/);
    await db.exec('reset role');
    await db.exec(migration);
    const after = await get();
    assert.equal(after.variants.length, 102);
    assert.deepEqual(after.variants.map(v => v.id).sort(), result.variants.map(v => v.id).sort());
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await snapshot(brightProduct), brightBefore);
    assert.equal(await value<string>('select variant_id as data from sales.raw_material_requests where id=$1', [requestId]), quote.id);

    // Optional fixture for the browser acceptance check, sourced from the real SQL result.
    if (process.env.ROUND_BAR_BROWSER_FIXTURE) {
      mkdirSync('test-results', { recursive: true });
      writeFileSync('test-results/round-bar-browser-fixture.json', JSON.stringify(after));
      writeFileSync('test-results/bright-bar-browser-fixture.json', JSON.stringify(await value<Product>('select public.fti_catalog_product_get($1) as data', [brightProduct])));
    }
  } finally { await db.close(); }
});
