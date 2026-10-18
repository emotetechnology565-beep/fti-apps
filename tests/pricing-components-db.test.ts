import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { calculateRate } from '../src/features/pricing/model/rate-calculation';

test('continuous pricing preserves legacy history, calculates percentage profit, and keeps costs private', async () => {
  const db = new PGlite();
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{v:T}>(sql,args)).rows[0].v;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160003_phase4_pricing.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
    }
    const actor='00000000-0000-0000-0000-000000000001';
    await db.query('insert into auth.users values($1,$2,now())',[actor,'919000000001']);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[actor,'{"aal":"aal2"}']);
    await db.exec("set role authenticated;select public.fti_save_profile('Pricing tester');reset role;");
    await db.query("insert into identity.user_roles values($1,'price_manager')",[actor]);
    await db.exec('set role authenticated');
    const market=await value<string>("select public.fti_pricing_market_create('DELHI','Delhi','Delhi') as v");
    await db.exec('reset role');
    const category=await value<string>("insert into catalog.categories(slug,name) values('test','Test') returning id as v");
    const product=await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'test-bolt','Test bolt','fastener','published') returning id as v",[category]);
    const variant=await value<string>("insert into catalog.product_variants(product_id,sku,uom) values($1,'TEST-BOLT','kg') returning id as v",[product]);
    const legacy=await value<string>("insert into pricing.price_versions(variant_id,market_id,amount,uom,rate_status,effective_at,expires_at) values($1,$2,40,'kg','indicative','2000-01-01','2001-01-01') returning id as v",[variant,market]);
    await db.query("insert into pricing.current_prices(variant_id,market_id,tier_key,price_version_id) values($1,$2,'public',$3)",[variant,market,legacy]);
    const migration=readFileSync('supabase/migrations/202610180003_continuous_pricing.sql','utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec('set role anon');
    type Page={items:{id:string;amount:string;expires_at:null;effective_at:string;previous_amount:string;revision:number}[];total:number};
    const rates=()=>value<Page>('select public.fti_pricing_rates($1) as v',[market]);
    assert.equal((await rates()).items[0].id,legacy);
    assert.equal((await rates()).items[0].expires_at,null);
    await assert.rejects(db.query('select public.fti_pricing_admin()'));
    await db.exec('reset role');
    assert.equal(await value("select expires_at='2001-01-01'::timestamptz as v from pricing.price_versions where id=$1",[legacy]),true);
    await db.exec('set role authenticated');
    type Staff={drafts:{id:string;items:{amount:string;profit_percent:string}[]}[];current_rates:{base_price:string;profit_percent:string}[]};
    assert.equal((await value<Staff>('select public.fti_pricing_admin() as v')).current_rates[0].base_price,'40.0000');
    const parts={base_price:'70',increased_price:'2',rolling_price:'3',profit_percent:'10'};
    const save=(fields:Record<string,unknown>)=>value<string>('select public.fti_pricing_draft_save(null,null,$1,$2,null,$3) as v',[market,'Continuous rate',JSON.stringify([{variant_id:variant,...fields}])]);
    const id=await save(parts);
    const admin=await value<Staff>('select public.fti_pricing_admin() as v');
    assert.equal(admin.drafts[0].items[0].amount,'82.5000');
    assert.equal(admin.drafts[0].items[0].profit_percent,'10.0000');
    for(const invalid of [
      {...parts,base_price:'0'},{...parts,increased_price:'-1'},{...parts,profit_percent:'-1'},
      {...parts,base_price:'NaN'},{...parts,profit_percent:'1.00001'},{...parts,amount:'999'},
    ]) await assert.rejects(save(invalid));
    assert.equal((await value<Staff>('select public.fti_pricing_admin() as v')).drafts.length,1);
    const before=await value<string>('select clock_timestamp()::text as v');
    await db.query('select public.fti_pricing_publish($1,1)',[id]);
    const after=await value<string>('select clock_timestamp()::text as v');
    await db.exec('set role anon');
    const first=(await rates()).items[0];
    assert.equal(first.amount,'82.5000');assert.equal(first.previous_amount,'40.0000');assert.equal(first.expires_at,null);
    assert.ok(Date.parse(first.effective_at)>=Date.parse(before)&&Date.parse(first.effective_at)<=Date.parse(after));
    for(const key of ['base_price','increased_price','rolling_price','profit_percent']) assert.equal(key in first,false);
    const history=await value<Record<string,unknown>[]>('select public.fti_pricing_history($1,$2) as v',[market,variant]);
    assert.equal(history.length,2);assert.equal('profit_percent' in history[0],false);
    await db.exec('reset role');
    await assert.rejects(db.query('update pricing.price_versions set amount=1 where id=$1',[first.id]));
    await db.exec('set role authenticated');
    const nextParts={base_price:'70',increased_price:'7',rolling_price:'3',profit_percent:'12.5'};
    const next=await save(nextParts);
    await db.query('select public.fti_pricing_publish($1,1)',[next]);
    assert.equal((await rates()).items[0].amount,calculateRate(nextParts)?.amount);
    assert.equal((await rates()).items[0].previous_amount,'82.5000');
    assert.equal((await rates()).items[0].revision,3);
    await assert.rejects(db.query('select public.fti_pricing_publish($1,1)',[next]));
    await db.query("select set_config('request.jwt.claims',$1,false)",['{"aal":"aal1"}']);
    await assert.rejects(db.query('select public.fti_pricing_admin()'));
    await assert.rejects(save(parts));
  } finally {await db.close();}
});
