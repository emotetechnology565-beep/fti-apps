import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { matchesSize } from '../src/features/catalog/model/catalog-filters';

test('shared size and grade filters operate before pagination across categories', async () => {
  const db = new PGlite();
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610220002_catalogue_filters.sql', '202610220005_shared_steel_categories.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    const steelCategories = await value<string[]>("select array_agg(slug order by sort_order) as data from catalog.categories where is_active");
    assert.deepEqual(steelCategories, ['round-bar-as-rolled', 'round-bright-bar', 'tmt', 'flat', 'sheet', 'square']);
    const round = await value<string>("select id as data from catalog.categories where slug='round-bar-as-rolled'");
    const tmt = await value<string>("select id as data from catalog.categories where slug='tmt'");
    const hidden = await value<string>("insert into catalog.categories(slug,name,is_active) values('hidden','Hidden',false) returning id as data");
    async function add(category: string, name: string, grade: string, group: string, status = 'published', active = true) {
      const id = await value<string>('insert into catalog.products(category_id,slug,name,status) values($1,$2,$2,$3) returning id as data', [category, name, status]);
      const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom,is_active) values($1,$2,'MT',$3) returning id as data", [id, name, active]);
      await db.query("insert into catalog.variant_attributes values($1,'grade',$2),($1,'size_group',$3)", [variant, JSON.stringify(grade), JSON.stringify(group)]);
      return id;
    }
    const ids = [];
    for (let i = 0; i < 27; i++) ids.push(await add(round, `round-${String(i).padStart(2, '0')}`, 'EN-8D', '16MM TO 50MM'));
    const wide = await add(round, 'wide-round', 'EN-19', '53MM TO 80MM');
    await add(tmt, 'tmt-stock', 'FE-500', '16MM TO 80MM');
    await add(round, 'draft', 'DRAFT', '16MM TO 80MM', 'draft');
    await add(round, 'inactive-variant', 'INACTIVE', '16MM TO 80MM', 'published', false);
    await add(hidden, 'hidden-category', 'HIDDEN', '16MM TO 80MM');
    type Page = { total: number; grades: string[]; items: { id: string; variants: { attributes: { grade: string } }[] }[] };
    const list = (category: string | null, size: number | null = null, grade: string | null = null, offset = 0, saved: string[] | null = null, search = '') =>
      value<Page>('select public.fti_catalog_filtered_list($1,$2,24,$3,$4,$5,$6) as data', [search, category, offset, saved, size, grade]);
    await db.exec('set role anon');
    const first = await list('round-bar-as-rolled');
    assert.equal(first.total, 28);
    assert.equal(first.items.length, 24);
    assert.equal(first.grades.length, 42);
    assert.ok(first.grades.includes('EN-19'));
    assert.ok(first.grades.includes('FE-500'));
    const small = await list('round-bar-as-rolled', 16, 'en-8d');
    assert.equal(small.total, 27);
    assert.equal((await list('round-bar-as-rolled', 16, 'EN-8D', 24)).items.length, 3);
    assert.equal((await list('round-bar-as-rolled', 50)).total, 27);
    assert.equal((await list('round-bar-as-rolled', 51)).total, 0);
    assert.deepEqual((await list('round-bar-as-rolled', 53)).items.map(p => p.id), [wide]);
    assert.equal((await list('round-bar-as-rolled', 80)).total, 1);
    assert.equal((await list('round-bar-as-rolled', 80)).grades.length, 42);
    assert.equal((await list('round-bar-as-rolled', 80, 'EN-8D')).total, 0);
    assert.equal((await list('tmt', 16)).grades.length, 42);
    assert.equal((await list('round-bar-as-rolled', 16, null, 0, [ids[26]])).items[0].id, ids[26]);
    assert.equal((await list('round-bar-as-rolled', 16, null, 0, [])).total, 0);
    assert.equal((await list('round-bar-as-rolled', 16, null, 0, null, 'round-26')).total, 1);
    assert.ok(!(await list(null)).grades.some(g => ['HIDDEN', 'DRAFT', 'INACTIVE'].includes(g)));
    await assert.rejects(list('round-bar-as-rolled', 9), /shared steel size list/);
    await assert.rejects(list('round-bar-as-rolled', 52), /shared steel size list/);
    // Frontend detail filtering must use the same range semantics as the server.
    await db.exec('reset role');
    for (const label of ['16MM TO 50MM', '53 - 80 mm', '16–80 MM', 'All sizes', '20 mm', 'M20 x 50', 'unknown']) {
      for (const size of [16, 20, 50, 51, 52, 53, 80]) {
        const server = await value<boolean>('select internal.catalog_size_matches(null,$1,$2) as data', [label, size]);
        assert.equal(matchesSize({ diameter_mm: null, size_label: null, attributes: { size_group: label } }, size), server, `${label}, ${size}`);
      }
    }
  } finally { await db.close(); }
});
