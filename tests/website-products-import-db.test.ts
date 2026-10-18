import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('real website catalogue import preserves existing records and is repeatable', async () => {
  const source = JSON.parse(readFileSync('deployment/website-products/products.json', 'utf8'));
  assert.equal(source.length, 37);
  assert.equal(source.filter((item: {category: string}) => item.category === 'fasteners').length, 17);
  for (const item of source) {
    const image = readFileSync(`deployment/website-products/images/${item.image_id}.jpg`);
    assert.equal(createHash('sha256').update(image).digest('hex'), item.sha256_hex);
    assert.equal(image.length, item.size_bytes);
    assert.ok(item.cdn_url.startsWith('https://ftis.b-cdn.net/product-images/'));
  }
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    await db.exec('alter table platform.media_assets add column cdn_url text, add column sha256_hex text, add column storage_zone text;');
    await db.exec(`insert into catalog.categories(slug,name) values('fasteners','Existing category');
      insert into catalog.products(category_id,slug,name,status)
      select id,'csk-screw','Existing staff product','published' from catalog.categories;`);
    const sql = readFileSync('deployment/website-products/01_import_products.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const count = async (table: string) => Number((await db.query<{n: number}>(`select count(*) n from ${table}`)).rows[0].n);
    assert.equal(await count('catalog.products'), 37);
    assert.equal(await count('catalog.categories'), 2);
    assert.equal(await count('catalog.product_variants'), 0);
    assert.equal(await count('platform.media_assets'), 36);
    assert.equal(await count('platform.audit_logs'), 36);
    const existing = (await db.query<{name: string; status: string}>("select name,status from catalog.products where slug='csk-screw'")).rows[0];
    assert.deepEqual(existing, {name: 'Existing staff product', status: 'published'});
    assert.equal(Number((await db.query<{n: number}>("select count(*) n from catalog.products where status='draft'")).rows[0].n), 36);
  } finally { await db.close(); }
});
