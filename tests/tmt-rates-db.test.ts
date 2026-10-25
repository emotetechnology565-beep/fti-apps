import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { selectionPrice, type SelectionOption } from '../src/features/catalog/model/material-selection';
import { orderConfirmationChargesNote } from '../src/features/catalog/model/price-disclosure';

type SelectionPage = {
  sizes: { id: string; dimensions: { diameter_mm: number } }[];
  options: SelectionOption[];
};

test('TMT import publishes 70 exact source rates without GST or freight and preserves IDs on rerun', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160003_phase4_pricing.sql',
      '202610220001_category_grade_sheets.sql', '202610220003_material_categories.sql', '202610220004_round_bar_sheet_data.sql',
      '202610220002_catalogue_filters.sql', '202610220005_shared_steel_categories.sql', '202610220006_grade_sheet_gst.sql',
      '202610220007_round_bright_bar_prices.sql', '202610230001_raw_material_orders.sql', '202610240001_round_bar_availability.sql',
      '202610240002_material_selection.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const sql = readFileSync('deployment/tmt-rates/publish.sql', 'utf8');
    await db.exec(sql);
    const ids = async () => (await db.query<{ id: string }>(`select v.id from catalog.product_variants v
      join catalog.products p on p.id=v.product_id join catalog.categories c on c.id=p.category_id
      where c.slug='tmt' order by v.id`)).rows.map(row => row.id);
    const before = await ids();
    assert.equal(before.length, 70);
    await db.exec(sql);
    assert.deepEqual(await ids(), before);
    await db.exec('set role anon');
    const list = (await db.query<{ data: { total: number; items: { name: string; variants: unknown[] }[] } }>(
      "select public.fti_catalog_filtered_list(p_category => 'tmt',p_limit => 50) as data")).rows[0].data;
    assert.equal(list.total, 10);
    assert.ok(list.items.every(product => product.variants.length === 7));
    assert.ok(list.items.every(product => !product.name.includes('SUPER 600')));
    const page = async (sizeId?: string) => (await db.query<{ data: SelectionPage }>(
      "select public.fti_catalog_selection_options('tmt',$1) as data", [sizeId ?? null])).rows[0].data;
    const sizes = (await page()).sizes;
    assert.deepEqual(sizes.map(size => size.dimensions.diameter_mm), [8, 10, 12, 16, 20, 25, 32]);
    // Independent source-sheet checkpoints: total before GST, minus the excluded 5,000 freight.
    const normalRates: Record<string, number> = {
      'ZARA TMT': 49875, 'STAR TMT': 49875, 'ZEE CON TMT': 49875, 'AWADH TMT': 49875,
      'MAJHI TMT': 49775, 'SUPERX TMT': 49775, 'HR PLATINUM': 49775, 'SMS TMT': 49675,
      'BALSHALI 550D': 50275, 'RATHI TMT': 51275,
    };
    for (const size of sizes) {
      const options = (await page(size.id)).options;
      assert.equal(options.length, 10);
      for (const option of options) {
        const diameter = size.dimensions.diameter_mm;
        const expected = normalRates[option.grade] + ([8, 32].includes(diameter) ? 2000 : 0)
          + (option.grade === 'ZARA TMT' && [8, 10].includes(diameter) ? 100 : 0);
        assert.equal(Number(option.attributes.grade_list_price), expected, `${option.grade} ${diameter}mm`);
        assert.equal(option.attributes.grade_list_gst_included, false);
        assert.equal(option.attributes.grade_list_freight_excluded, true);
        assert.equal(selectionPrice(option)?.tax, orderConfirmationChargesNote);
        assert.equal(option.uom, 'MT');
        assert.equal(option.min_order_qty, 1);
        for (const privateCost of ['rolling', 'profile', 'loading', 'freight', 'gst']) {
          assert.equal(option.attributes[privateCost], undefined);
        }
      }
    }
    await db.exec('reset role');
    const audit = await db.query<{ count: number }>("select count(*)::integer as count from platform.audit_logs where action='catalog.tmt_rates.import'");
    assert.equal(audit.rows[0].count, 2);
  } finally {
    await db.close();
  }
});
