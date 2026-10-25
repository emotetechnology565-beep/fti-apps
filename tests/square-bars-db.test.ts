import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import sizes from '../src/features/catalog/data/square-bar-sizes.json';
import { availableCatalogFilters } from '../src/features/catalog/model/available-filters';
import { selectionPrice, type SelectionOptions } from '../src/features/catalog/model/material-selection';
import type { Product } from '../src/features/catalog/model/types';

test('Square Bar is a raw material with 40 sizes and MS / Alloy quote options, retaining prices on rerun', async () => {
  const db = new PGlite();
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160003_phase4_pricing.sql',
      '202610220001_category_grade_sheets.sql', '202610220003_material_categories.sql', '202610220004_round_bar_sheet_data.sql',
      '202610220002_catalogue_filters.sql', '202610220005_shared_steel_categories.sql', '202610220006_grade_sheet_gst.sql',
      '202610220007_round_bright_bar_prices.sql', '202610230001_raw_material_orders.sql', '202610240001_round_bar_availability.sql',
      '202610240002_material_selection.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    const sql = readFileSync('deployment/square-bars/publish.sql', 'utf8');
    await db.exec(sql);
    const ids = async () => (await db.query<{ id: string }>(`select v.id from catalog.product_variants v
      join catalog.products p on p.id=v.product_id where p.slug='square-bar' order by v.id`)).rows;
    const before = await ids();
    assert.equal(before.length, 80);
    await db.exec(sql);
    assert.deepEqual(await ids(), before);
    await db.exec('set role anon');
    const page = await value<{ items: Product[]; total: number }>("select public.fti_catalog_filtered_list(p_category => 'square') as data");
    assert.equal(page.total, 1);
    const product = page.items[0];
    assert.equal(product.product_kind, 'steel');
    assert.equal(product.purchase_mode, 'rfq');
    assert.equal(product.name, 'Square Bar');
    assert.equal(product.status, 'published');
    assert.deepEqual(availableCatalogFilters(product.variants), { sizes: sizes.map(row => row.sideMm), grades: ['ALLOY', 'MS'] });
    const options = (sizeId?: string) => value<SelectionOptions>("select public.fti_catalog_selection_options('square',$1) as data", [sizeId ?? null]);
    const selections = await options();
    assert.equal(selections.sizes.length, 40);
    for (const row of sizes) {
      const size = selections.sizes.find(item => item.dimensions.side_mm === row.sideMm);
      assert.ok(size);
      const selected = (await options(size.id)).options;
      assert.deepEqual(selected.map(item => item.grade).sort(), ['ALLOY', 'MS']);
      for (const option of selected) {
        assert.equal(selectionPrice(option), null, 'Blank source rates request a quote');
        assert.equal(option.attributes.cross_section_area_mm2, row.areaMm2);
        assert.equal(option.attributes.weight_kg_per_m, row.weightKgPerMetre);
        assert.equal(option.attributes.grade_list_price, undefined);
      }
    }
    await db.exec('reset role');
    const pricedVariant = product.variants[0].id;
    await db.query("delete from catalog.variant_attributes where variant_id=$1 and attribute_key='quote_only'", [pricedVariant]);
    await db.query("insert into catalog.variant_attributes values($1,'grade_list_price','\"53000\"')", [pricedVariant]);
    await db.exec(sql);
    assert.equal(await value<string>("select value_json #>> '{}' as data from catalog.variant_attributes where variant_id=$1 and attribute_key='grade_list_price'", [pricedVariant]), '53000');
    assert.equal(await value<number>("select count(*)::int as data from catalog.variant_attributes where variant_id=$1 and attribute_key='quote_only'", [pricedVariant]), 0);
  } finally {
    await db.close();
  }
});
