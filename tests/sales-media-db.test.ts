import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('private RFQ attachments are visible only to the buyer or authorized MFA staff', async () => {
  const db = new PGlite();
  const ids = ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated,service_role;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160004_catalog_media.sql','202610160005_phase5_sales.sql','202610160006_phase5_private_media.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
    await db.exec(`insert into auth.users values('${ids[0]}','+910000000001',now()),('${ids[1]}','+910000000002',now()),('${ids[2]}','+910000000003',now());`);
    async function as(index: number, aal = 'aal1') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [ids[index], JSON.stringify({ aal })]);
      await db.exec('set role authenticated'); await db.exec('select public.fti_identity_me()');
    }
    async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ data: T }>(sql, params)).rows[0].data; }
    await db.exec('reset role');
    const category = await value<string>("insert into catalog.categories(slug,name) values('test','Test') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'test','Test','steel','published') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom) values($1,'TEST-1','kg') returning id as data", [product]);
    await as(0);
    const rfq = await value<{ id: string }>('select public.fti_sales_submit($1,null,null,$2,$3) as data',
      ['00000000-0000-0000-0000-000000000011','Private test',JSON.stringify([{ variant_id: variant, qty: '10', uom: 'kg' }])]);
    const prepare = () => value<{ id: string; object_key: string }>('select public.fti_sales_media_prepare($1,100,$2,$3) as data',
      [rfq.id,'application/pdf','a'.repeat(64)]);
    const asset = await prepare();
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.fti_sales_media_access($1)', [asset.id]));
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.fti_sales_media_access($1)', [asset.id]));
    await assert.rejects(db.query("select public.fti_sales_media_complete($1,'verified','private-test')", [asset.id]));
    await db.exec('set role service_role');
    await db.query("select public.fti_sales_media_complete($1,'verified','private-test')", [asset.id]);
    await db.exec('set role authenticated');
    const allowed = await value<{ object_key: string; storage_zone: string }>('select public.fti_sales_media_access($1) as data', [asset.id]);
    assert.equal(allowed.object_key, asset.object_key); assert.equal(allowed.storage_zone, 'private-test');
    await as(1);
    await assert.rejects(db.query('select public.fti_sales_media_access($1)', [asset.id]));
    await as(2);
    await assert.rejects(db.query('select public.fti_sales_media_access($1)', [asset.id]));
    await db.exec('reset role'); await db.query('insert into identity.user_roles values($1,$2)', [ids[2],'sales_executive']);
    await as(2);
    await assert.rejects(db.query('select public.fti_sales_media_access($1)', [asset.id]));
    await as(2,'aal2');
    await db.query('select public.fti_sales_assign($1,$2)', [rfq.id, ids[2]]);
    assert.equal((await value<{ object_key: string }>('select public.fti_sales_media_access($1) as data', [asset.id])).object_key, asset.object_key);
  } finally { await db.close(); }
});
