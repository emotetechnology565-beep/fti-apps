import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('pricing publication is authorized, atomic, immutable and stays active until replaced', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160003_phase4_pricing.sql','202610180003_continuous_pricing.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    const actor = '00000000-0000-0000-0000-000000000001';
    await db.exec(`insert into auth.users values('${actor}','+910000000001',now());`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [actor, '{"aal":"aal1"}']);
    await db.exec("set role authenticated; select public.fti_save_profile('Isolated test staff')");
    await assert.rejects(db.exec('select public.fti_pricing_admin()'));
    await db.exec(`reset role; insert into identity.user_roles values('${actor}','price_manager'); set role authenticated;`);
    await assert.rejects(db.exec('select public.fti_pricing_admin()'));
    await db.query("select set_config('request.jwt.claims',$1,false)", ['{"aal":"aal2"}']);
    async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ data: T }>(sql, params)).rows[0].data; }
    const market = await value<string>("select public.fti_pricing_market_create('TEST','Test market','Test state') as data");
    await db.exec('reset role');
    const category = await value<string>("insert into catalog.categories(slug,name) values('test','Test') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'test','Test','steel','published') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom) values($1,'TEST-1','kg') returning id as data", [product]);
    const second = await value<string>("insert into catalog.product_variants(product_id,sku,uom) values($1,'TEST-2','kg') returning id as data", [product]);
    await db.exec('set role authenticated');
    const draft = (amount: string, items = [{ variant_id: variant, amount }]) => value<string>('select public.fti_pricing_draft_save(null,null,$1,$2,null,$3) as data', [market, 'Test draft', JSON.stringify(items)]);
    await assert.rejects(draft('0'));
    await assert.rejects(draft('NaN'));
    await assert.rejects(draft('1.00001'));
    await assert.rejects(draft('1', [{ variant_id: variant, amount: '1' }, { variant_id: variant, amount: '2' }]));
    const first = await draft('50.1250');
    await assert.rejects(db.query('select public.fti_pricing_publish($1,2)', [first]));
    await db.query('select public.fti_pricing_publish($1,1)', [first]);
    await assert.rejects(db.query('select public.fti_pricing_publish($1,1)', [first]));
    await assert.rejects(db.query('select public.fti_pricing_draft_save($1,1,$2,$3,null,$4)', [first, market, 'Attempt rewrite', JSON.stringify([{ variant_id: variant, amount: '1' }])]));
    const replacement = await draft('55.2500');
    await db.query('select public.fti_pricing_publish($1,1)', [replacement]);
    await db.exec('set role anon');
    type Page = { total: number; items: { id: string; amount: string; previous_amount: string; revision: number }[] };
    const rates = () => value<Page>('select public.fti_pricing_rates($1) as data', [market]);
    const page = await rates();
    assert.equal(page.total, 1); assert.equal(page.items[0].amount, '55.2500');
    assert.equal(page.items[0].previous_amount, '50.1250'); assert.equal(page.items[0].revision, 2);
    assert.equal((await value<unknown[]>('select public.fti_pricing_history($1,$2) as data', [market, variant])).length, 2);
    await assert.rejects(db.exec('select public.fti_pricing_admin()'));
    await assert.rejects(db.exec('select * from pricing.draft_items'));
    await db.exec('reset role');
    await assert.rejects(db.query('update pricing.price_versions set amount=1 where id=$1', [page.items[0].id]));
    await assert.rejects(db.query('delete from pricing.price_versions where id=$1', [page.items[0].id]));
    assert.equal(await value<number>("select count(*)::int as data from platform.outbox_events where event_type='pricing.published'"), 2);
    // A failure in a multi-item batch must roll back every pointer, history and outbox write.
    await db.exec('set role authenticated');
    const invalidated = await draft('60', [{ variant_id: variant, amount: '60' }, { variant_id: second, amount: '70' }]);
    await db.exec('reset role');
    await db.query('update catalog.product_variants set is_active=false where id=$1', [second]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.fti_pricing_publish($1,1)', [invalidated]));
    assert.equal((await rates()).items[0].revision, 2);
    await db.exec('reset role');
    assert.equal(await value<number>('select count(*)::int as data from pricing.price_versions'), 2);
    assert.equal(await value<number>("select count(*)::int as data from platform.outbox_events where event_type='pricing.published'"), 2);
    // Private tiers and future versions remain hidden; elapsed expiry no longer hides a current rate.
    const tier = await value<string>("insert into pricing.customer_price_tiers(code,name) values('private','Private') returning id as data");
    await db.query(`insert into pricing.price_versions(variant_id,market_id,tier_id,amount,uom,rate_status,effective_at,expires_at)
      values($1,$2,$3,1,'kg','indicative',now(),now()+interval '1 hour')`, [variant, market, tier]);
    assert.equal((await value<unknown[]>('select public.fti_pricing_history($1,$2) as data', [market, variant])).length, 2);
    const expired = await value<string>(`insert into pricing.price_versions(variant_id,market_id,amount,uom,rate_status,effective_at,expires_at)
      values($1,$2,10,'kg','indicative',now()-interval '2 hours',now()-interval '1 hour') returning id as data`, [variant, market]);
    await db.query("update pricing.current_prices set price_version_id=$1 where variant_id=$2 and market_id=$3 and tier_key='public'", [expired, variant, market]);
    assert.equal((await rates()).total, 1);
    assert.equal((await rates()).items[0].amount, '10.0000');
    const scheduled = await value<string>(`insert into pricing.price_versions(variant_id,market_id,amount,uom,rate_status,effective_at,expires_at)
      values($1,$2,10,'kg','indicative',now()+interval '1 hour',now()+interval '2 hours') returning id as data`, [variant, market]);
    await db.query("update pricing.current_prices set price_version_id=$1 where variant_id=$2 and market_id=$3 and tier_key='public'", [scheduled, variant, market]);
    assert.equal((await rates()).total, 0);
    assert.equal((await value<unknown[]>('select public.fti_pricing_history($1,$2) as data', [market, variant])).length, 3);
  } finally { await db.close(); }
});
