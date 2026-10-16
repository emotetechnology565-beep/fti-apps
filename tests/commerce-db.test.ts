import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('quote-to-order reserves tracked stock once and requires MFA bank verification', async () => {
  const db = new PGlite();
  const ids = ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('../FTI_Implementation_Documentation_v2/14_PostgreSQL_Schema_Blueprint.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160005_phase5_sales.sql','202610160007_phase6_commerce.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
    await db.exec(`insert into auth.users values('${ids[0]}','+910000000001',now()),('${ids[1]}','+910000000002',now()),('${ids[2]}','+910000000003',now());`);
    async function as(index: number, aal = 'aal1') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[ids[index],JSON.stringify({ aal })]);
      await db.exec('set role authenticated');
      await db.exec('select public.fti_identity_me()');
    }
    async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ data: T }>(sql,params)).rows[0].data; }
    await db.exec('reset role');
    const category=await value<string>("insert into catalog.categories(slug,name) values('real','Real') returning id as data");
    const product=await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'real','Real','steel','published') returning id as data",[category]);
    const variant=await value<string>("insert into catalog.product_variants(product_id,sku,uom,min_order_qty) values($1,'REAL-1','kg',10) returning id as data",[product]);
    await as(1); await as(2); await db.exec('reset role');
    await db.query('insert into identity.user_roles values($1,$2),($3,$4)',[ids[1],'super_admin',ids[2],'accounts']);
    await as(0);
    const rfq=await value<{ id: string }>('select public.fti_sales_submit($1,null,null,$2,$3) as data',[
      '00000000-0000-0000-0000-000000000011','Needed for site',JSON.stringify([{variant_id:variant,qty:'10',uom:'kg',requirements:''}])]);
    await as(1,'aal2');
    const quote=await value<{quotation_id:string}>('select public.fti_sales_quote($1,$2,$3,0,50,25,$4,$5) as data',[
      rfq.id,new Date(Date.now()+3600000).toISOString(),JSON.stringify([{variant_id:variant,rate:'100'}]),'Full bank transfer','Manual approved amounts']);
    await as(0);
    await db.query('select public.fti_sales_accept($1,1)',[quote.quotation_id]);
    await as(0);
    const address=await value<string>('select public.fti_commerce_address_save($1,$2,$3,$4) as data',[
      'Industrial Road','Mumbai','Maharashtra','400001']);
    assert.equal((await value<unknown[]>('select public.fti_commerce_addresses() as data')).length,1);
    const request='00000000-0000-0000-0000-000000000012';
    const place=()=>value<{id:string;replayed:boolean}>('select public.fti_commerce_quote_order($1,$2,$3) as data',[request,quote.quotation_id,address]);
    await assert.rejects(place(),/reservation policy has not been approved/);
    await as(1);
    await assert.rejects(db.query('select public.fti_commerce_policy_set(2)'));
    await as(1,'aal2');
    await db.query('select public.fti_commerce_policy_set(2)');
    const location=await value<string>("select public.fti_commerce_location_create('MUM1','Mumbai warehouse','Mumbai') as data");
    await db.query('select public.fti_commerce_stock_adjust($1,$2,10,$3,$4)',[variant,location,'Verified goods receipt','GRN-1']);
    await as(0);
    const order=await place();
    assert.equal(order.replayed,false);
    assert.equal((await place()).replayed,true);
    await assert.rejects(db.query('select public.fti_commerce_quote_order($1,$2,$3)',[
      '00000000-0000-0000-0000-000000000013',quote.quotation_id,address]));
    const detail=await value<{grand_total:string;status:string;items:unknown[]}>('select public.fti_commerce_detail($1) as data',[order.id]);
    assert.equal(detail.grand_total,'1075.00');
    assert.equal(detail.status,'pending_payment');
    assert.equal(detail.items.length,1);
    const payment=await value<{id:string}>('select public.fti_commerce_bank_submit($1,$2) as data',[order.id,'UTR123456']);
    await assert.rejects(db.query('select public.fti_commerce_bank_submit($1,$2)',[order.id,'UTR999999']));
    await as(2);
    await assert.rejects(db.exec('select public.fti_commerce_payment_queue()'));
    await as(2,'aal2');
    assert.equal((await value<unknown[]>('select public.fti_commerce_payment_queue() as data')).length,1);
    await db.query('select public.fti_commerce_payment_decide($1,true,$2)',[payment.id,'Verified against bank statement']);
    await assert.rejects(db.query('select public.fti_commerce_payment_decide($1,true,$2)',[payment.id,'Again verified']));
    await as(0);
    const confirmed=await value<{status:string;amount_due:number;payments:{status:string}[]}>('select public.fti_commerce_detail($1) as data',[order.id]);
    assert.equal(confirmed.status,'confirmed');
    assert.equal(Number(confirmed.amount_due),0);
    assert.equal(confirmed.payments[0].status,'successful');
    await as(1,'aal2');
    const stockAfterPayment=await value<{inventory:{on_hand:string;reserved:string}[]}>('select public.fti_commerce_stock() as data');
    assert.equal(stockAfterPayment.inventory[0].on_hand,'0.000');
    assert.equal(stockAfterPayment.inventory[0].reserved,'0.000');
    await db.query('select public.fti_commerce_stock_adjust($1,$2,10,$3,$4)',[variant,location,'Second verified goods receipt','GRN-2']);
    await as(0);
    const nextRfq=await value<{id:string}>('select public.fti_sales_submit($1,null,null,$2,$3) as data',[
      '00000000-0000-0000-0000-000000000021','Second real request',JSON.stringify([{variant_id:variant,qty:'10',uom:'kg',requirements:''}])]);
    await as(1,'aal2');
    const nextQuote=await value<{quotation_id:string}>('select public.fti_sales_quote($1,$2,$3,0,50,25,$4,$5) as data',[
      nextRfq.id,new Date(Date.now()+3600000).toISOString(),JSON.stringify([{variant_id:variant,rate:'100'}]),'Full bank transfer','Manual approved amounts']);
    await as(0);
    await db.query('select public.fti_sales_accept($1,1)',[nextQuote.quotation_id]);
    const nextOrder=await value<{id:string}>('select public.fti_commerce_quote_order($1,$2,$3) as data',[
      '00000000-0000-0000-0000-000000000022',nextQuote.quotation_id,address]);
    await db.exec('reset role');
    await db.query("update commerce.stock_reservations set expires_at=now()-interval '1 minute' where order_item_id in (select id from commerce.order_items where order_id=$1)",[nextOrder.id]);
    await as(1,'aal2');
    assert.equal(await value<number>('select public.fti_commerce_expire(20) as data'),1);
    const stockAfterExpiry=await value<{inventory:{on_hand:string;reserved:string}[]}>('select public.fti_commerce_stock() as data');
    assert.equal(stockAfterExpiry.inventory[0].on_hand,'10.000');
    assert.equal(stockAfterExpiry.inventory[0].reserved,'0.000');
    await as(0);
    assert.equal((await value<{status:string}>('select public.fti_commerce_detail($1) as data',[nextOrder.id])).status,'cancelled');
    await db.exec('set role anon');
    await assert.rejects(db.exec('select * from commerce.orders'));
  } finally { await db.close(); }
});
