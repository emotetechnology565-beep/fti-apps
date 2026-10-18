import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('shared material bases atomically reprice a grade without crossing markets, units or stale drafts', async () => {
  const db=new PGlite();
  const value=async<T>(sql:string,args:unknown[]=[]) => (await db.query<{v:T}>(sql,args)).rows[0].v;
  const actor='00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160003_phase4_pricing.sql','202610180003_continuous_pricing.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
    }
    await db.query('insert into auth.users values($1,$2,now())',[actor,'919000000001']);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[actor,'{"aal":"aal2"}']);
    await db.exec("set role authenticated;select public.fti_save_profile('Material pricing tester');reset role");
    await db.query("insert into identity.user_roles values($1,'price_manager')",[actor]);
    await db.exec('set role authenticated');
    const market=await value<string>("select public.fti_pricing_market_create('DELHI','Delhi','Delhi') as v");
    const otherMarket=await value<string>("select public.fti_pricing_market_create('PUNJAB','Punjab','Punjab') as v");
    await db.exec('reset role');
    const category=await value<string>("insert into catalog.categories(slug,name) values('test','Test') returning id as v");
    const product=await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'test','Test','fastener','published') returning id as v",[category]);
    async function variant(sku:string,grade:string,uom='kg') {
      await db.exec('reset role');
      const id=await value<string>("insert into catalog.product_variants(product_id,sku,uom) values($1,$2,$3) returning id as v",[product,sku,uom]);
      await db.query("insert into catalog.variant_attributes(variant_id,attribute_key,value_json) values($1,'grade',$2)",[id,JSON.stringify(grade)]);
      return id;
    }
    const ms1=await variant('MS-1','MS'),ms2=await variant('MS-2','Mild Steel'),en8=await variant('EN8-1','EN-8'),piece=await variant('MS-PIECE','MS','piece');
    const save=async(id:string,base:string,increase='0',rolling='0',profit='0',target=market)=>{
      await db.exec('set role authenticated');
      return value<string>('select public.fti_pricing_draft_save(null,null,$1,$2,null,$3) as v',[target,'Grade test',JSON.stringify([{variant_id:id,base_price:base,increased_price:increase,rolling_price:rolling,profit_percent:profit}])]);
    };
    const publish=async(id:string,base:string,increase='0',rolling='0',profit='0',target=market)=>{
      const draft=await save(id,base,increase,rolling,profit,target);
      await db.query('select public.fti_pricing_publish($1,1)',[draft]);return draft;
    };
    await publish(ms1,'70','2','3','10');await publish(ms2,'70','1','4','20');
    await publish(en8,'100','5','5','15');await publish(piece,'20','2','0','10');await publish(ms1,'70','0','0','0',otherMarket);
    const stale=await save(ms1,'70','2','3','10');
    await db.exec('reset role');
    const migration=readFileSync('supabase/migrations/202610180004_grade_base_pricing.sql','utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec('set role authenticated');
    type Base={id:string;base_price:string;revision:number;updated_products:number;updated_at:string};
    const update=(grade:string,base:string,revision:number|null=null,uom='kg')=>value<Base>('select public.fti_pricing_grade_base_update($1,$2,$3,$4,$5) as v',[market,grade,uom,base,revision]);
    const current=async()=> (await value<{current_rates:{id:string;market_id:string;variant_id:string;amount:string;base_price:string;increased_price:string;rolling_price:string;profit_percent:string;effective_at:string}[]}>('select public.fti_pricing_admin() as v')).current_rates.filter(rate=>rate.market_id===market);
    const rates=(target=market)=>value<{items:{id:string;variant_id:string;amount:string;effective_at:string}[]}>('select public.fti_pricing_rates($1) as v',[target]);
    const before=(await rates()).items;
    const ms=await update('MS','75');assert.equal(ms.updated_products,2);assert.equal(ms.base_price,'75.0000');assert.equal(ms.revision,1);
    assert.equal(typeof (await value<{grade_bases:{base_price:string}[]}>('select public.fti_pricing_admin() as v')).grade_bases[0].base_price,'string');
    const after=(await rates()).items;
    assert.equal(after.find(rate=>rate.variant_id===ms1)?.amount,'88.0000');
    assert.equal(after.find(rate=>rate.variant_id===ms2)?.amount,'96.0000');
    for (const id of [en8,piece]) assert.equal(after.find(rate=>rate.variant_id===id)?.id,before.find(rate=>rate.variant_id===id)?.id);
    assert.equal((await rates(otherMarket)).items[0].amount,'70.0000');
    assert.equal(after.find(rate=>rate.variant_id===ms1)?.effective_at,ms.updated_at);
    const details=(await current()).find(rate=>rate.variant_id===ms1)!;
    assert.equal(details.increased_price,'2.0000');assert.equal(details.rolling_price,'3.0000');assert.equal(details.profit_percent,'10.0000');
    await assert.rejects(db.query('select public.fti_pricing_publish($1,1)',[stale]),/shared material base price changed/);
    await assert.rejects(update('MS','80'),/base changed/);
    for (const invalid of ['0','-1','NaN','Infinity','1.00001']) await assert.rejects(update('MS',invalid,1));
    await assert.rejects(update('SS304','80'),/Choose MS or EN8/);
    const next=await update('MS','80',1);assert.equal(next.updated_products,2);assert.equal(next.revision,2);
    assert.equal((await rates()).items.find(rate=>rate.variant_id===ms1)?.amount,'93.5000');
    assert.equal((await rates()).items.find(rate=>rate.variant_id===ms2)?.amount,'102.0000');
    const steel=await update('EN8','110');assert.equal(steel.updated_products,1);
    assert.equal((await rates()).items.find(rate=>rate.variant_id===en8)?.amount,'138.0000');
    assert.equal((await rates()).items.find(rate=>rate.variant_id===ms1)?.amount,'93.5000');
    await assert.rejects(save(ms1,'70'),/shared material base price changed/);
    await publish(ms1,'80','2','3','10');
    // A single oversized result must roll back the base, every replacement and audit/outbox writes.
    const huge=await variant('MS-HUGE','MS');await publish(huge,'80','0','0','1000000000000000');
    const snapshot=JSON.stringify((await rates()).items);
    await db.exec('reset role');
    const count=await value<number>('select count(*)::int as v from pricing.price_versions');
    await db.exec('set role authenticated');
    await assert.rejects(update('MS','1000',2),/exceeds the supported range/);
    assert.equal(JSON.stringify((await rates()).items),snapshot);
    await db.exec('reset role');
    assert.equal(await value('select count(*)::int as v from pricing.price_versions'),count);
    assert.equal(await value("select base_price::text as v from pricing.grade_base_prices where grade_code='MS'"),'80.0000');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from pricing.grade_base_prices'));
    await assert.rejects(update('MS','90',2));
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claims',$1,false)",['{"aal":"aal1"}']);
    await assert.rejects(update('MS','90',2),/MFA/);
  } finally {await db.close();}
});
