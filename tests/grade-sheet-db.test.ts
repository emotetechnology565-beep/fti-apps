import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { GradeSheet } from '../src/features/catalog/model/grade-sheet';

test('category grade lists save privately and publish complete, revision-checked catalogue snapshots', async () => {
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  const entry = { grade: 'EN-8D', base_price: '40000', base_charge: '4000', profile: '1000', rolling: '8500',
    size_groups: [{ label: '16MM TO 50MM', add_price: '0' }, { label: '53MM TO 80MM', add_price: '1000' }] };
  const payload = { product_kind: 'steel', uom: 'MT', min_order_qty: '1', rows: [entry] };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160003_phase4_pricing.sql', '202610220001_category_grade_sheets.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    await db.exec(readFileSync('supabase/migrations/202610220001_category_grade_sheets.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/202610220006_grade_sheet_gst.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/202610220006_grade_sheet_gst.sql', 'utf8'));
    await db.query('insert into auth.users values($1,$2,now())', [actor, '919000000001']);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [actor, '{"aal":"aal2"}']);
    await db.exec("set role authenticated; select public.fti_save_profile('Grade sheet tester'); reset role");
    const category = await value<string>("insert into catalog.categories(slug,name) values('round-bar','Round Bar') returning id as data");
    const other = await value<string>("insert into catalog.categories(slug,name) values('tmt','TMT') returning id as data");
    const get = () => value<GradeSheet>('select public.fti_catalog_grade_sheet_get($1) as data', [category]);
    const save = (revision: number | null, data: unknown = payload, target = category) => value<GradeSheet>('select public.fti_catalog_grade_sheet_save($1,$2,$3) as data', [target, revision, JSON.stringify(data)]);
    const publish = (revision: number) => value<GradeSheet>('select public.fti_catalog_grade_sheet_publish($1,$2) as data', [category, revision]);
    await db.exec('set role authenticated');
    await assert.rejects(get());
    await assert.rejects(save(null));
    await db.exec(`reset role; insert into identity.user_roles values('${actor}','super_admin'); set role authenticated`);
    assert.equal(await get(), null);
    let sheet = await save(null, { ...payload, rows: [{ ...entry, rolling: '' }] });
    assert.equal(sheet.revision, 1);
    assert.equal(sheet.product_id, null);
    assert.ok(sheet.rows[0].size_groups[0].id);
    await assert.rejects(publish(1), /all prices are required/);
    await assert.rejects(save(null), /list changed/);
    for (const invalid of ['NaN', '-1', '1e3', 'Infinity', '0.12345'])
      await assert.rejects(save(1, { ...payload, rows: [{ ...entry, base_price: invalid }] }), /valid non-negative/);
    await assert.rejects(save(1, { ...payload, rows: [entry, { ...entry, grade: ' en-8d ' }] }), /duplicated/);
    await assert.rejects(save(1, { ...payload, uom: '' }), /price unit/);
    await assert.rejects(save(1, { ...payload, rows: [{ ...entry, size_groups: [{ id: actor, label: 'All', add_price: '0' }] }] }), /does not belong/);
    sheet = await save(1, { ...payload, rows: [{ ...sheet.rows[0], rolling: '8500', net_price: '1' }] });
    await assert.rejects(publish(1), /list changed/);
    sheet = await publish(2);
    assert.equal(sheet.published_revision, 2);
    const product = sheet.product_id!;
    type PublicProduct = { variants: { id: string; uom: string; attributes: Record<string, string> }[] };
    const publicProduct = () => value<PublicProduct>('select public.fti_catalog_product_get($1) as data', [product]);
    await db.exec('set role anon');
    const visible = await publicProduct();
    assert.equal(visible.variants.length, 2);
    assert.deepEqual(visible.variants.map(v => v.attributes.grade_list_price).sort(), ['53500.0000', '54500.0000']);
    for (const variant of visible.variants) {
      assert.equal(variant.uom, 'MT');
      assert.equal(variant.attributes.grade_list_base_price, '40000.0000');
      for (const key of ['base_price', 'base_charge', 'profile', 'rolling']) assert.equal(variant.attributes[key], undefined);
    }
    await assert.rejects(get());
    await assert.rejects(db.exec('select * from catalog.category_grade_sheets'));
    await assert.rejects(publish(2));
    await db.exec('set role authenticated');
    for (const rate of ['', '-1', '101', '18.123', 'NaN'])
      await assert.rejects(save(2, { ...payload, gst_included: true, gst_rate: rate }), /GST/);
    const changed = { ...payload, gst_included: true, gst_rate: '18', rows: [{ ...sheet.rows[0], base_price: '41000', size_groups: [sheet.rows[0].size_groups[0]] }] };
    sheet = await save(2, changed);
    assert.equal(sheet.gst_included, true);
    assert.equal(sheet.gst_rate, '18.00');
    assert.deepEqual(await publicProduct(), visible, 'saving a draft must not change published prices');
    await publish(3);
    const next = await publicProduct();
    assert.equal(next.variants[0].attributes.grade_list_gst_rate, '18.00');
    assert.equal(next.variants[0].attributes.grade_list_gst_included, true);
    assert.equal(next.variants.length, 1);
    assert.equal(next.variants[0].id, sheet.rows[0].size_groups[0].id);
    assert.equal(next.variants[0].attributes.grade_list_price, '54500.0000');
    const tmt = await save(null, { ...payload, rows: [{ ...entry, grade: 'ZARA TMT' }] }, other);
    assert.notEqual(tmt.rows[0].size_groups[0].id, sheet.rows[0].size_groups[0].id);
    await assert.rejects(save(tmt.revision, { ...payload, rows: sheet.rows }, other), /does not belong/);
    await db.exec('reset role');
    assert.equal(await value<number>('select count(*)::int as data from catalog.product_variants where product_id=$1', [product]), 2, 'removed variants survive for historical references');
    await db.query("select set_config('request.jwt.claims',$1,false)", ['{"aal":"aal1"}']);
    await db.exec('set role authenticated');
    await assert.rejects(save(3, changed));
    await assert.rejects(publish(3));
  } finally { await db.close(); }
});
