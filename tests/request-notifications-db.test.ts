import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('request notifications cover all workflows, recipient permissions, consent, rollback and replay', async () => {
  const db = new PGlite();
  const users = [1,2,3,4,5].map(n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{v:T}>(sql,args)).rows[0].v;
  const asUser = async (n: number, aal = 'aal1') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [users[n],JSON.stringify({aal})]);
    await db.exec('set role authenticated; select public.fti_identity_me()');
  };
  const notices = async (kind: string, state: string) => value<number>("select count(*)::int as v from platform.notifications where payload->>'request_type'=$1 and payload->>'request_state'=$2",[kind,state]);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160004_catalog_media.sql',
      '202610160005_phase5_sales.sql','202610160006_phase5_private_media.sql','202610160007_phase6_commerce.sql',
      '202610160008_phase7_operations.sql','202610160009_phase7_private_documents.sql','202610160010_phase7_outbox.sql',
      '202610160011_phase7_whatsapp.sql','202610160012_phase7_reporting.sql','202610160013_phase7_announcements.sql',
      '202610170001_phase8_business_stock.sql','202610180001_request_notifications.sql','202610180002_whatsapp_phone_format.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
    }
    for (let n=0;n<users.length;n++) {
      await db.exec('reset role');
      await db.query('insert into auth.users values($1,$2,now())',[users[n],`91900000000${n}`]);
      await asUser(n);
      await db.query("select public.fti_save_profile('Isolated request tester')");
    }
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin'),($1,'sales_executive'),($2,'sales_executive'),($3,'super_admin')",[users[1],users[3],users[4]]);
    await db.query("update identity.profiles set account_status='blocked' where id=$1",[users[4]]);
    for (const n of [0,1,2,3]) { await asUser(n);await db.exec('select public.fti_operations_whatsapp_opt_in(true)'); }

    const address = {line1:'123 Industrial Road',city:'Delhi',state:'Delhi',pincode:'110001'};
    const application = {legal_name:'Isolated request business',customer_type:'dealer',gstin:'',pan:'',billing:address,shipping:address,consent:true};
    await asUser(0);
    const business = await value<string>('select public.fti_apply_business($1) as v',[application]);
    await db.exec('reset role');
    assert.equal(await notices('business verification','received'),1);
    assert.equal(await notices('business verification','new'),1,'only active business reviewers get alerted');
    const businessJobs = await value<number>("select count(*)::int as v from platform.whatsapp_jobs where template_code in ('fti_request_received_v1','fti_admin_request_v1')");
    assert.equal(businessJobs,2);
    await asUser(1,'aal2');
    await db.query("select public.fti_review_business($1,1,'rejected','Please correct the business details')",[business]);
    await db.exec('reset role');assert.equal(await notices('business verification','rejected'),1);
    await asUser(0);
    await db.query('select public.fti_apply_business($1)',[{...application,revision:2}]);
    await asUser(1,'aal2');
    await db.query("select public.fti_review_business($1,3,'verified','Business details verified')",[business]);
    await assert.rejects(db.query("select public.fti_review_business($1,3,'verified','Duplicate decision')",[business]));
    await db.exec('reset role');assert.equal(await notices('business verification','approved'),1);
    assert.equal(await notices('business verification','received'),2,'one new receipt per real resubmission');

    // Sales/commerce use their existing outbox projection; worker replay must not duplicate jobs.
    const rfq = await value<string>("insert into sales.rfqs(rfq_no,buyer_id,status) values('ISOLATED-RFQ',$1,'submitted') returning id as v",[users[0]]);
    const event = await value<string>("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('sales.rfq.submitted','rfq',$1,'{}') returning id as v",[rfq]);
    assert.equal(await notices('quotation','new'),2,'duplicate staff roles do not duplicate alerts');
    await db.exec('set role service_role;select public.fti_operations_process_outbox(50);select public.fti_operations_process_outbox(50);reset role');
    assert.equal(await value<number>('select count(*)::int as v from platform.notifications where event_id=$1',[event]),1);
    const quote = await value<string>("insert into sales.quotations(quote_no,rfq_id,status) values('ISOLATED-QUOTE',$1,'sent') returning id as v",[rfq]);
    for (const type of ['sales.quote.sent','sales.quote.revision_requested','sales.quote.accepted']) {
      await db.query("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values($1,'quotation',$2,jsonb_build_object('rfq_id',$3::text))",[type,quote,rfq]);
    }
    await db.exec('set role service_role;select public.fti_operations_process_outbox(50);reset role');
    assert.equal(await notices('quotation revision','new'),2);
    await db.query("update sales.rfqs set status='rejected' where id=$1",[rfq]);
    assert.equal(await notices('quotation','rejected'),1);

    const order = await value<string>("insert into commerce.orders(order_no,buyer_id,delivery_address_snapshot,status,subtotal,grand_total,amount_due) values('ISOLATED-ORDER',$1,'{}','pending_payment',100,100,100) returning id as v",[users[0]]);
    const payment = await value<string>("insert into commerce.payments(order_id,gateway,amount,status) values($1,'bank_transfer',100,'review') returning id as v",[order]);
    await db.query("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('commerce.order.created','order',$1,'{}')",[order]);
    for (const type of ['commerce.payment.review_requested','commerce.payment.verified','commerce.payment.rejected']) {
      await db.query("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values($1,'payment',$2,jsonb_build_object('order_id',$3::text))",[type,payment,order]);
    }
    await db.exec('set role service_role;select public.fti_operations_process_outbox(50);reset role');
    assert.equal(await notices('order','new'),1);assert.equal(await notices('payment review','new'),1);
    for (const template of ['fti_request_received_v1','fti_request_approved_v1','fti_request_rejected_v1']) {
      assert.equal(await value<number>("select count(*)::int as v from platform.whatsapp_jobs where template_code=$1 and parameters->>0='payment review'",[template]),1);
    }

    await asUser(0);
    const ticket = await value<string>("select public.fti_operations_ticket_create('Request help','Please help with this request') as v");
    await db.query("select public.fti_operations_reply($1,'Additional details',false)",[ticket]);
    await asUser(1,'aal2');await db.query("select public.fti_operations_reply($1,'Request resolved',true)",[ticket]);
    await db.exec('reset role');
    assert.equal(await notices('support','new'),2);assert.equal(await notices('support reply','new'),2);
    assert.equal(await value<number>("select count(*)::int as v from platform.whatsapp_jobs where template_code='fti_request_update_v1' and parameters->>0='support' and parameters->>2='resolved'"),1);

    const listing = '10000000-0000-4000-8000-000000000001';
    await db.query(`insert into marketplace.listings(id,seller_id,business_id,material,grade,specification,condition,quantity,uom,asking_price,price_unit,city,state,pincode,available_until)
      values($1,$2,$3,'Steel angles','IS2062','50 x 50 x 6','surplus',100,'kg',52,'kg','Delhi','Delhi','110001',now()+interval '30 days')`,[listing,users[0],business]);
    assert.equal(await notices('stock listing','received'),0,'drafts never notify');
    await asUser(0);await db.query("select public.fti_stock_transition($1,1,'submit','')",[listing]);
    await asUser(1,'aal2');await db.query("select public.fti_stock_transition($1,2,'reject','Please correct the listing')",[listing]);
    await asUser(0);await db.query("select public.fti_stock_transition($1,3,'submit','')",[listing]);
    await asUser(1,'aal2');await db.query("select public.fti_stock_transition($1,4,'approve','Stock details reviewed')",[listing]);
    await asUser(2);
    const enquiry = '20000000-0000-4000-8000-000000000001';
    await db.query("select public.fti_stock_enquire($1,$2,'10','Please confirm availability')",[enquiry,listing]);
    await db.exec('reset role');
    assert.equal(await notices('stock listing','approved'),1);assert.equal(await notices('stock listing','rejected'),1);
    assert.equal(await notices('stock enquiry','new'),2);assert.equal(await notices('stock enquiry','received'),1);
    const version = await value<number>('select version as v from marketplace.enquiries where id=$1',[enquiry]);
    await asUser(0);await db.query("select public.fti_stock_reply($1,gen_random_uuid(),$2,'Available for collection',false)",[enquiry,version]);
    await db.exec('reset role');assert.equal(await notices('stock enquiry','update'),2,'seller new enquiry and buyer reply alerts');

    await asUser(2);await db.exec('select public.fti_request_account_deletion();select public.fti_request_account_deletion();');
    await db.exec('reset role');assert.equal(await notices('account deletion','received'),1);assert.equal(await notices('account deletion','new'),1);
    await db.exec('begin');
    await db.query("insert into platform.support_tickets(buyer_id,subject) values($1,'Rollback notification test')",[users[0]]);
    await db.exec('rollback');assert.equal(await notices('support','received'),1);

    // Unsubscribed recipients still get in-app notices; no new WhatsApp jobs.
    await asUser(2);await db.exec('select public.fti_operations_whatsapp_opt_in(false)');
    await db.exec('reset role');
    const prior = await value<number>('select count(*)::int as v from platform.whatsapp_jobs where user_id=$1',[users[2]]);
    await db.query("insert into platform.support_tickets(buyer_id,subject) values($1,'No WhatsApp without consent')",[users[2]]);
    assert.equal(await value<number>('select count(*)::int as v from platform.whatsapp_jobs where user_id=$1',[users[2]]),prior);

    await db.exec('set role service_role');
    const jobs = await value<{id:string;template:string;phone:string}[]>("select public.fti_operations_whatsapp_claim(array['fti_admin_request_v1'],20) as v");
    assert.ok(jobs.length);
    await db.exec('reset role');await db.query('delete from identity.user_roles where user_id=$1',[users[1]]);
    await db.exec('set role service_role');
    const adminJob = jobs.find(j => j.phone==='+919000000001')!;
    assert.ok(adminJob);assert.equal(await value<boolean>('select public.fti_operations_whatsapp_can_send($1) as v',[adminJob.id]),false);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.fti_operations_whatsapp_claim(array[\'fti_admin_request_v1\'],10)'));
    await assert.rejects(db.query("select internal.request_staff('business.review',null,'forged',gen_random_uuid())"));
  } finally { await db.close(); }
});
