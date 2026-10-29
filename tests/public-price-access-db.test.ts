import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  canViewPublicPrices,
  redactPublicPrices,
} from '../src/shared/lib/price-access';

test('coming-soon access redacts nested prices without removing specifications or pagination', () => {
  assert.equal(canViewPublicPrices(), false);
  const data = {
    total: 3,
    items: [
      {
        id: 'p',
        attributes: {
          grade: 'ZARA TMT',
          diameter_mm: 8,
          grade_list_price: 51975,
          sheet_flat_net_prate: 60000,
          base_price: 12,
          discounted_price: 10,
          bolt_rate: 105,
          generated_at: 'today',
        },
      },
    ],
  };
  assert.deepEqual(redactPublicPrices(data), {
    total: 3,
    items: [
      {
        id: 'p',
        attributes: {
          grade: 'ZARA TMT',
          diameter_mm: 8,
          generated_at: 'today',
        },
      },
    ],
  });
  assert.equal(data.items[0].attributes.grade_list_price, 51975);
});

test('public APIs hide all catalogue prices and rate history while quotations and staff rates remain available', async () => {
  const db = new PGlite();
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ data: T }>(sql, args)).rows[0].data;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(
      readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
    for (const file of [
      '202610150001_phase2_identity.sql',
      '202610160001_phase3_catalog.sql',
      '202610160003_phase4_pricing.sql',
      '202610220001_category_grade_sheets.sql',
      '202610220003_material_categories.sql',
      '202610220004_round_bar_sheet_data.sql',
      '202610220002_catalogue_filters.sql',
      '202610220005_shared_steel_categories.sql',
      '202610220006_grade_sheet_gst.sql',
      '202610220007_round_bright_bar_prices.sql',
      '202610230001_raw_material_orders.sql',
      '202610240001_round_bar_availability.sql',
      '202610240002_material_selection.sql',
    ]) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }

    await db.exec(readFileSync('deployment/tmt-rates/publish.sql', 'utf8'));
    await db.exec(
      readFileSync(
        'supabase/migrations/202610250001_manual_material_requests.sql',
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/202610260010_fastener_grade_rates.sql',
        'utf8',
      ),
    );
    const migration = readFileSync(
      'supabase/migrations/202610290002_public_price_restrictions.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec('set role anon');
    type Product = {
      id: string;
      variants: { attributes: Record<string, unknown> }[];
    };
    const list = await value<{ total: number; items: Product[] }>(
      "select public.fti_catalog_filtered_list(p_category=>'tmt') as data",
    );
    assert.equal(list.total, 10);
    assert.ok(list.items.length);
    assert.ok(!JSON.stringify(list).includes('grade_list_price'));
    const product = await value<Product>(
      'select public.fti_catalog_product_get($1) as data',
      [list.items[0].id],
    );
    assert.ok(!JSON.stringify(product).includes('grade_list_price'));
    assert.ok(product.variants[0].attributes.grade);
    assert.ok(
      !JSON.stringify(
        await value(
          "select public.fti_catalog_list(p_category=>'tmt') as data",
        ),
      ).includes('grade_list_price'),
    );
    const sizes = await value<{ sizes: { id: string }[] }>(
      "select public.fti_catalog_selection_options('tmt') as data",
    );
    const options = await value<{ options: { id: string; grade: string }[] }>(
      "select public.fti_catalog_selection_options('tmt',$1) as data",
      [sizes.sizes[0].id],
    );
    assert.equal(options.options.length, 10);
    assert.ok(!JSON.stringify(options).includes('grade_list_price'));
    assert.ok(options.options[0].grade);
    assert.deepEqual(
      await value('select public.fti_pricing_history(null,null) as data'),
      [],
    );
    assert.deepEqual(
      (
        await value<{ items: unknown[] }>(
          'select public.fti_pricing_rates(null) as data',
        )
      ).items,
      [],
    );
    await assert.rejects(db.exec('select * from public.fastener_grade_rates'));
    await assert.rejects(
      db.exec('select internal.fti_catalog_list_unredacted()'),
    );
    assert.equal(
      (await value<string[]>('select public.fti_fastener_grades() as data'))
        .length,
      4,
    );
    const preview = await value<Record<string, unknown>>(
      "select public.fti_catalog_manual_preview('TMT','8', $1, null) as data",
      [options.options[0].grade],
    );
    assert.equal(preview.status, 'available');
    assert.ok(!JSON.stringify(preview).includes('grade_list_price'));
    await db.exec('reset role');
    const actor = '00000000-0000-0000-0000-000000000001';
    await db.query('insert into auth.users values($1,$2,now())', [
      actor,
      '919000000001',
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      actor,
    ]);
    await db.exec('set role authenticated; select public.fti_identity_me()');
    assert.equal(
      (await db.query('select * from public.fastener_grade_rates')).rows.length,
      0,
    );
    const buyer = {
      name: 'Buyer',
      business: 'Test Works',
      location: 'Pune 411001',
      whatsapp_consent: true,
    };
    const id = '00000000-0000-0000-0000-000000000010';
    const submit = await value<{ reference: string }>(
      'select public.fti_catalog_selection_request_submit($1,$2,$3,$4) as data',
      [id, options.options[0].id, '1', buyer],
    );
    assert.ok(submit.reference);
    const manual = {
      material: 'TMT',
      size: '8',
      grade: options.options[0].grade,
      grade_entry: 'list',
      uom: 'MT',
      product_id: null,
      expected_match: preview,
    };
    const requested = await value<{ reference: string }>(
      'select public.fti_catalog_manual_request_submit($1,$2,$3,$4) as data',
      ['00000000-0000-0000-0000-000000000011', manual, '1', buyer],
    );
    assert.ok(requested.reference);
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin')", [
      actor,
    ]);
    await db.exec(
      `select set_config('request.jwt.claims','{"aal":"aal2"}',false); set role authenticated`,
    );
    assert.equal(
      (await db.query('select * from public.fastener_grade_rates')).rows.length,
      4,
    );
    const admin = await value('select public.fti_catalog_admin_list() as data');
    assert.ok(JSON.stringify(admin).includes('grade_list_price'));
  } finally {
    await db.close();
  }
});
