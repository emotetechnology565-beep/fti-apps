import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

type Option = { id: string; grade: string; variant_id: string | null; product_id: string; min_order_qty: number; attributes: Record<string, unknown> };
type Page = { category: { id: string } | null; categories: unknown[]; sizes: { id: string; label: string; dimensions: Record<string, number> }[]; options: Option[] };

test('material options isolate category dimensions and preserve prices, manual overrides, history and request deduplication', async () => {
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  const stranger = '00000000-0000-0000-0000-000000000002';
  const buyer = { name: 'Selection buyer', business: 'Test Works', location: 'Pune 411001', whatsapp_consent: true };
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  const page = (category: string | null, size: string | null = null, product: string | null = null) => value<Page>('select public.fti_catalog_selection_options($1,$2,$3) as data', [category, size, product]);
  async function as(id: string, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ aal })]);
    await db.exec('set role authenticated; select public.fti_identity_me()');
  }
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
      '202610220007_round_bright_bar_prices.sql', '202610230001_raw_material_orders.sql', '202610240001_round_bar_availability.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    }
    const sheet = await value<string>("select id as data from catalog.categories where slug='sheet'");
    const flat = await value<string>("select id as data from catalog.categories where slug='flat'");
    const tmt = await value<string>("select id as data from catalog.categories where slug='tmt'");
    async function stock(cat: string, slug: string, label: string, grade = 'MS') {
      const p = await value<string>("insert into catalog.products(category_id,slug,name,status) values($1,$2,$2,'published') returning id as data", [cat, slug]);
      const v = await value<string>("insert into catalog.product_variants(product_id,sku,size_label,uom,min_order_qty) values($1,$2,$3,'MT',0.5) returning id as data", [p, slug, label]);
      await db.query("insert into catalog.variant_attributes values($1,'grade',$2),($1,'size_group',$3),($1,'sheet_flat_net_prate','\"65000\"')", [v, JSON.stringify(grade), JSON.stringify(label)]);
      return { p, v };
    }
    const s = await stock(sheet, 'sheet-2-5', '2.5MM');
    const f = await stock(flat, 'flat-2', '2MM');
    await stock(tmt, 'tmt-range', '8MM TO 80MM', 'FE-500');
    const migration = readFileSync('supabase/migrations/202610240002_material_selection.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(readFileSync('supabase/migrations/202610290001_tmt_optional_grade.sql', 'utf8'));
    await db.exec('set role anon');
    await assert.rejects(db.exec('select * from catalog.availability_options'));
    await assert.rejects(db.query('select public.fti_catalog_selection_admin($1)', [sheet]));
    assert.equal((await page(null)).categories.length, 6);
    assert.equal((await page('missing')).category, null);
    const round = await page('round-bar-as-rolled');
    assert.equal(round.sizes.length, 36);
    assert.equal(round.options.length, 0);
    assert.equal((await page('tmt')).sizes.length, 0, 'A pricing range cannot invent available stock');
    assert.equal((await page('flat')).sizes.length, 1);
    const sheetPage = await page('sheet');
    assert.equal(sheetPage.sizes.length, 1);
    assert.equal((await page(null, null, s.p)).category?.id, sheet);
    assert.equal((await page('sheet', null, f.p)).sizes.length, 0);
    assert.deepEqual(sheetPage.sizes[0].dimensions, { thickness_mm: 2.5 });
    const sheetOption = (await page('sheet', sheetPage.sizes[0].id)).options[0];
    assert.equal(sheetOption.attributes.sheet_flat_net_prate, '65000');
    assert.equal((await page('round-bar-as-rolled', sheetPage.sizes[0].id)).options.length, 0);
    const size16 = round.sizes.find(sz => sz.dimensions.diameter_mm === 16)!;
    const size8 = round.sizes.find(sz => sz.dimensions.diameter_mm === 8)!;
    const at16 = await page('round-bar-as-rolled', size16.id);
    assert.equal(at16.options.length, 34);
    const en8d = at16.options.find(o => o.grade === 'EN-8D')!;
    assert.equal(en8d.attributes.grade_list_price, '13500.0000');
    const quote = (await page('round-bar-as-rolled', size8.id)).options.find(o => o.grade === 'EN-8D')!;
    assert.equal(quote.attributes.quote_only, true);
    assert.equal(quote.attributes.grade_list_price, undefined);

    await db.exec('reset role');
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())', [actor, '919000000001', stranger, '919000000002']);
    await as(actor); await as(stranger);
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin')", [actor]);
    await db.exec("insert into identity.role_permissions values('super_admin','order.manage') on conflict do nothing");
    await as(actor);
    await assert.rejects(db.query('select public.fti_catalog_selection_spec_save($1,$2,$3)', [sheet, 'Thickness', ['thickness_mm']]), /MFA/);
    await as(actor, 'aal2');
    await db.query("select public.fti_catalog_raw_recipient_save('+919000000003','Sales',true)");
    await db.query('select public.fti_catalog_selection_spec_save($1,$2,$3)', [flat, 'Thickness × width (mm)', ['thickness_mm', 'width_mm']]);
    const sizeSave = (cat: string, data: unknown) => value<string>('select public.fti_catalog_selection_size_save($1,$2) as data', [cat, data]);
    const optionSave = (cat: string, data: unknown) => value<string>('select public.fti_catalog_selection_option_save($1,$2) as data', [cat, data]);
    const flatSize = await sizeSave(flat, { label: '2.5 × 25 mm', dimensions: { thickness_mm: 2.5, width_mm: 25 }, enabled: true });
    await assert.rejects(sizeSave(sheet, { label: 'Bad', dimensions: { diameter_mm: 2 }, enabled: true }), /dimensions/);
    await assert.rejects(sizeSave(sheet, { label: 'Bad', dimensions: { thickness_mm: -2 }, enabled: true }), /dimensions/);
    const manual = { product_id: f.p, size_id: flatSize, grade: 'EN-8', uom: 'MT', min_order_qty: '0.25', enabled: true, variant_id: null };
    const flatOption = await optionSave(flat, manual);
    await assert.rejects(optionSave(sheet, manual), /steel product/);
    await assert.rejects(optionSave(flat, { ...manual, grade: 'LC', variant_id: s.v }), /Pricing variant/);
    const updatedSize = await sizeSave(flat, { id: flatSize, label: '2.5 × 25 mm', dimensions: { thickness_mm: 2.5, width_mm: 25 }, enabled: true, sort_order: 2.5 });
    assert.equal(updatedSize, flatSize);
    const req = '00000000-0000-0000-0000-000000000010';
    const submit = (id: string, option: string, qty = '1') => value<{ reference: string; replayed: boolean }>('select public.fti_catalog_selection_request_submit($1,$2,$3,$4) as data', [id, option, qty, buyer]);
    await assert.rejects(submit(req, flatOption, '0.1'), /minimum/);
    assert.equal((await submit(req, flatOption)).replayed, false);
    assert.equal((await submit(req, flatOption)).replayed, true);
    await assert.rejects(submit(req, flatOption, '2'), /different details/);
    await submit('00000000-0000-0000-0000-000000000011', sheetOption.id);
    await db.exec('reset role');
    assert.equal(await value<number>('select count(*)::int as data from sales.raw_material_jobs where request_id=$1', [req]), 2);
    const recorded = await value<{ variant_id: null; size_mm: null; details: Record<string, unknown> }>('select to_jsonb(r) as data from sales.raw_material_requests r where id=$1', [req]);
    assert.equal(recorded.variant_id, null); assert.equal(recorded.size_mm, null);
    assert.deepEqual(recorded.details.dimensions, { thickness_mm: 2.5, width_mm: 25 });
    assert.equal(recorded.details.price_state, 'request_quote');
    assert.equal(await value<string>("select details->>'published_price' as data from sales.raw_material_requests where id='00000000-0000-0000-0000-000000000011'"), '65000');
    await as(stranger);
    await assert.rejects(submit(req, flatOption), /unavailable/);
    await assert.rejects(db.exec('select * from sales.raw_material_requests'));
    await as(actor, 'aal2');
    await optionSave(flat, { ...manual, id: flatOption, enabled: false });
    await assert.rejects(submit('00000000-0000-0000-0000-000000000012', flatOption), /no longer available/);
    const roundCat = round.category!.id;
    await optionSave(roundCat, { ...en8d, size_id: size16.id, uom: 'MT', min_order_qty: '1', enabled: false });
    const sheetState = await value<{ revision: number }>('select public.fti_catalog_grade_sheet_get($1) as data', [roundCat]);
    await db.query('select public.fti_catalog_grade_sheet_publish($1,$2)', [roundCat, sheetState.revision]);
    assert.ok(!(await page('round-bar-as-rolled', size16.id)).options.some(o => o.id === en8d.id));
    await db.exec('reset role');
    await db.exec(migration);
    assert.ok(!(await page('round-bar-as-rolled', size16.id)).options.some(o => o.id === en8d.id));
    assert.equal((await page('flat', flatSize)).options.length, 0, 'Migration must preserve staff-disabled options');
    assert.equal(await value<string>("select details->>'size' as data from sales.raw_material_requests where id=$1", [req]), '2.5 × 25 mm');
    await as(actor, 'aal2');
    await db.query("select public.fti_catalog_raw_order_submit($1,$2,8,'1',$3)", ['00000000-0000-0000-0000-000000000013', quote.variant_id, buyer]);
    // The legacy product editor must not bypass round-bar diameter approval.
    const invalidStock = await value<string>('select public.fti_catalog_product_upsert($1,$2) as data', [
      { category_id: roundCat, slug: 'round-unapproved-19', name: 'Round unapproved 19', product_kind: 'steel', purchase_mode: 'rfq' },
      [{ sku: 'ROUND-UNAPPROVED-19', size_label: '19MM', uom: 'MT', min_order_qty: 1, attributes: { grade: 'EN-8D', size_group: '19MM' } }],
    ]);
    await db.query("select public.fti_catalog_product_status($1,'published')", [invalidStock]);
    assert.equal((await page('round-bar-as-rolled', null, invalidStock)).sizes.length, 0);
    await db.exec('reset role');
    assert.equal(await value<number>('select count(*)::int as data from catalog.availability_options where product_id=$1', [invalidStock]), 0);
    // Even a legacy/manual row inserted by a privileged migration cannot leak 19mm publicly.
    const invalidSize = await value<string>("insert into catalog.category_sizes(category_id,label,dimensions) values($1,'19 mm','{\"diameter_mm\":19}') returning id as data", [roundCat]);
    await db.query("insert into catalog.availability_options(category_id,product_id,size_id,grade,uom,min_order_qty) values($1,$2,$3,'EN-8D','MT',1)", [roundCat, invalidStock, invalidSize]);
    assert.equal((await page('round-bar-as-rolled', invalidSize)).options.length, 0);
    // Explicit dimensions take precedence over a permissive legacy pricing label.
    await db.query("insert into catalog.variant_attributes values($1,'dimensions','{\"thickness_mm\":2,\"width_mm\":25}') on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json", [f.v]);
    await db.query("update catalog.variant_attributes set value_json='\"ALL SIZES\"' where variant_id=$1 and attribute_key='size_group'", [f.v]);
    assert.equal(await value<boolean>('select internal.selection_variant_matches($1,$2) as data', [f.v, { thickness_mm: 2, width_mm: 25 }]), true);
    assert.equal(await value<boolean>('select internal.selection_variant_matches($1,$2) as data', [f.v, { thickness_mm: 2, width_mm: 50 }]), false);
  } finally { await db.close(); }
});
