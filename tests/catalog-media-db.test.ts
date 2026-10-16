import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('catalogue photos remain private until a staff upload is verified', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated,service_role;`);
    await db.exec(readFileSync('../FTI_Implementation_Documentation_v2/14_PostgreSQL_Schema_Blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const name of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160004_catalog_media.sql'])
      await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8').replace(/^\uFEFF/, ''));
    const actor = '00000000-0000-0000-0000-000000000001';
    await db.exec(`insert into auth.users values('${actor}','+910000000001',now());`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [actor, '{"aal":"aal1"}']);
    await db.exec("set role authenticated; select public.fti_save_profile('Isolated staff')");
    await db.exec(`reset role; insert into identity.user_roles values('${actor}','super_admin');`);
    async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ data: T }>(sql, params)).rows[0].data; }
    const category = await value<string>("insert into catalog.categories(slug,name) values('test','Test') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'test','Test','steel','draft') returning id as data", [category]);
    const hash = 'a'.repeat(64);
    const prepare = () => db.query<{ data: { id: string; object_key: string } }>('select public.fti_catalog_media_prepare($1,4,$2) as data', [product, hash]);
    await db.exec('set role authenticated');
    await assert.rejects(prepare());
    await db.query("select set_config('request.jwt.claims',$1,false)", ['{"aal":"aal2"}']);
    const asset = (await prepare()).rows[0].data;
    await db.exec('set role anon');
    assert.deepEqual(await value<unknown[]>('select public.fti_catalog_media_public(array[$1]::uuid[]) as data', [product]), []);
    await assert.rejects(db.exec('select * from platform.media_assets'));
    await assert.rejects(db.query("select public.fti_catalog_media_complete($1,'verified',$2,'test')", [asset.id, `https://photos.b-cdn.net/${asset.object_key}`]));
    await db.exec('set role service_role');
    await assert.rejects(db.query("select public.fti_catalog_media_complete($1,'verified',$2,'test')", [asset.id, 'https://wrong.b-cdn.net/product-images/x.jpg']));
    await db.query("select public.fti_catalog_media_complete($1,'verified',$2,'test')", [asset.id, `https://photos.b-cdn.net/${asset.object_key}`]);
    await assert.rejects(db.query("select public.fti_catalog_media_complete($1,'verified',$2,'test')", [asset.id, `https://photos.b-cdn.net/${asset.object_key}`]));
    await db.exec('set role anon');
    assert.deepEqual(await value<unknown[]>('select public.fti_catalog_media_public(array[$1]::uuid[]) as data', [product]), []);
    await db.exec('reset role');
    await db.query("update catalog.products set status='published' where id=$1", [product]);
    await db.exec('set role anon');
    const visible = await value<{ id: string; url: string }[]>('select public.fti_catalog_media_public(array[$1]::uuid[]) as data', [product]);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, asset.id);
    assert.ok(visible[0].url.endsWith(asset.object_key));
    await db.exec('set role authenticated');
    assert.equal(await value<string>('select public.fti_catalog_media_remove($1) as data', [asset.id]), asset.object_key);
    await assert.rejects(db.query('select public.fti_catalog_media_remove($1)', [asset.id]));
    await db.exec('set role anon');
    assert.deepEqual(await value<unknown[]>('select public.fti_catalog_media_public(array[$1]::uuid[]) as data', [product]), []);
  } finally { await db.close(); }
});
