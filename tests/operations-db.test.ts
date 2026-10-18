import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('operations enforce ownership, MFA, shipment transitions and transactional notifications', async()=>{
 const db=new PGlite();const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
 try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160004_catalog_media.sql','202610160005_phase5_sales.sql','202610160006_phase5_private_media.sql','202610160007_phase6_commerce.sql','202610160008_phase7_operations.sql','202610160009_phase7_private_documents.sql','202610160010_phase7_outbox.sql','202610160011_phase7_whatsapp.sql','202610160012_phase7_reporting.sql','202610160013_phase7_announcements.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
    await db.exec(`insert into auth.users values('${ids[0]}','910000000001',now()),('${ids[1]}','+910000000002',now()),('${ids[2]}','910000000003',now());`);
    async function as(index: number, aal = 'aal1') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[ids[index],JSON.stringify({ aal })]);
      await db.exec('set role authenticated');
      await db.exec('select public.fti_identity_me()');
    }
    async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ data: T }>(sql,params)).rows[0].data; }

 await as(0);await as(1);await as(2);await db.exec('reset role');
 // Reproduce production: Auth has verified digits, but the old opt-in requires +.
 await as(0);
 await assert.rejects(db.query('select public.fti_operations_whatsapp_opt_in(true)'),/verified WhatsApp phone/);
 await db.exec('reset role');
 const phoneMigration=readFileSync('supabase/migrations/202610180002_whatsapp_phone_format.sql','utf8');
 await db.exec(phoneMigration);
 await db.exec(phoneMigration); // Dashboard reapplication is safe.
 assert.equal(await value('select phone as data from identity.profiles where id=$1',[ids[0]]),'+910000000001');
 assert.equal(await value('select whatsapp_updates_opt_in_at as data from identity.profiles where id=$1',[ids[0]]),null);
 await as(0);
 await db.query("select public.fti_save_profile('Verified buyer')");
 assert.equal((await value<{profile:{phone:string}}>('select public.fti_identity_me() as data')).profile.phone,'+910000000001');
 await db.exec('reset role');
 await db.query('update auth.users set phone_confirmed_at=null where id=$1',[ids[0]]);
 await assert.rejects(as(0),/Verified phone sign-in/);
 await db.exec('reset role');
 await db.query("update auth.users set phone_confirmed_at=now(),phone='invalid' where id=$1",[ids[0]]);
 await as(0);
 await assert.rejects(db.query('select public.fti_operations_whatsapp_opt_in(true)'),/verified WhatsApp phone/);
 await db.exec('reset role');
 await db.query('update auth.users set phone=$2 where id=$1',[ids[0],'910000000001']);
 await db.query("insert into identity.user_roles values($1,'super_admin')",[ids[1]]);
 const order=await value<string>("insert into commerce.orders(order_no,buyer_id,delivery_address_snapshot,status,subtotal,grand_total,amount_due) values('TEST-OPERATIONS',$1,'{}','confirmed',100,100,0) returning id as data",[ids[0]]);
 await as(0);
 await assert.rejects(db.query("select public.fti_operations_media_prepare('order_mtc',$1,100,'application/pdf',$2)",[order,'a'.repeat(64)]),/Permission denied/);
 const ticket=await value<string>("select public.fti_operations_ticket_create('Delivery query','Please help',$1) as data",[order]);
 await assert.rejects(db.query("select public.fti_operations_dispatch($1,'Carrier','LR-1','')",[order]),/Permission denied/);
 await assert.rejects(db.query("select public.fti_operations_reply($1,'Close this',true)",[ticket]),/Permission denied/);
 const supportAsset=await value<{id:string}>("select public.fti_operations_media_prepare('support_ticket',$1,100,'application/pdf',$2) as data",[ticket,'a'.repeat(64)]);
 await db.exec('reset role');await db.query("select public.fti_operations_media_complete($1,'verified','ftis')",[supportAsset.id]);
 await as(2);
 await assert.rejects(db.query('select public.fti_operations_media_access($1)',[supportAsset.id]),/Permission denied/);
 await assert.rejects(db.query("select public.fti_operations_media_list('support_ticket',$1)",[ticket]),/Permission denied/);
 assert.deepEqual(await value('select public.fti_operations_tickets() as data'),[]);
 await assert.rejects(db.query('select public.fti_operations_thread($1)',[ticket]),/Permission denied/);
 await assert.rejects(db.query('select public.fti_operations_shipments($1)',[order]),/Permission denied/);
 await assert.rejects(db.query("select public.fti_operations_content_save('Test notice','Testing body')"),/Permission denied/);
 await assert.rejects(db.query("select public.fti_operations_ticket_create('Other order','Help',$1)",[order]),/Order unavailable/);
 await assert.rejects(db.query('select * from platform.support_tickets'));
 await as(1);
 await assert.rejects(db.query('select public.fti_operations_report()'),/MFA/);
 await assert.rejects(db.query('select public.fti_operations_audit()'),/MFA/);
 await as(1,'aal2');
 const announcement=await value<string>("select public.fti_operations_content_save('Office update','Office hours changed for support requests.') as data");
 await db.query('select public.fti_operations_content_publish($1,true)',[announcement]);
 await assert.rejects(db.query('select public.fti_operations_content_publish($1,true)',[announcement]),/cannot change state/);
 const mtc=await value<{id:string}>("select public.fti_operations_media_prepare('order_mtc',$1,100,'application/pdf',$2) as data",[order,'b'.repeat(64)]);
 await db.exec('reset role');await db.query("select public.fti_operations_media_complete($1,'verified','ftis')",[mtc.id]);
 await as(1,'aal2');
 await assert.rejects(db.query("select public.fti_operations_deliver($1,'Received safely')",[order]),/Only a shipped/);
 await db.query("select public.fti_operations_dispatch($1,'Carrier','LR-1','MH01')",[order]);
 await assert.rejects(db.query("select public.fti_operations_dispatch($1,'Carrier','LR-1','MH01')",[order]),/Only a confirmed/);
 await db.query("select public.fti_operations_deliver($1,'Recipient signed reference POD-1')",[order]);
 await assert.rejects(db.query("select public.fti_operations_deliver($1,'Recipient signed reference POD-1')",[order]),/Only a shipped/);
 await db.query("select public.fti_operations_reply($1,'Delivery confirmed; resolved',true)",[ticket]);
 await assert.rejects(db.query("select public.fti_operations_reply($1,'Second reply',false)",[ticket]),/already resolved/);
 const report=await value<{orders_by_status:{delivered:number};open_tickets:number}>('select public.fti_operations_report() as data');
 assert.equal(report.orders_by_status.delivered,1);assert.equal(report.open_tickets,0);
 assert.ok((await value<{action:string}[]>('select public.fti_operations_audit() as data')).some(x=>x.action==='order.delivered'));
 await assert.rejects(db.query("select public.fti_operations_daily(current_date-91,current_date)"),/90 days/);
 await as(0);
 assert.equal((await value<{id:string}[]>('select public.fti_operations_announcements() as data'))[0].id,announcement);
 assert.equal((await value<{id:string}[]>("select public.fti_operations_media_list('support_ticket',$1) as data",[ticket]))[0].id,supportAsset.id);
 assert.equal((await value<{id:string}[]>("select public.fti_operations_media_list('order_mtc',$1) as data",[order]))[0].id,mtc.id);
 const notices=await value<{id:string;read_at:string|null}[]>('select public.fti_operations_notifications() as data');
 assert.equal(notices.length,3);assert.equal(notices[0].read_at,null);
 await db.query('select public.fti_operations_read($1)',[notices[0].id]);
 await db.query('select public.fti_operations_read($1)',[notices[0].id]);
 assert.ok((await value<{read_at:string|null}[]>('select public.fti_operations_notifications() as data'))[0].read_at);
 const shipments=await value<{status:string}[]>('select public.fti_operations_shipments($1) as data',[order]);assert.equal(shipments[0].status,'delivered');
 await as(2);await assert.rejects(db.query('select public.fti_operations_read($1)',[notices[0].id]),/unavailable/);
 await assert.rejects(db.query('select public.fti_operations_process_outbox(5)'),/permission denied/);
 await db.exec('reset role');
 const event=await value<string>("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('commerce.order.created','order',$1,'{}') returning id as data",[order]);
 await db.exec('set role service_role');
 assert.equal((await value<{processed:number}>('select public.fti_operations_process_outbox(5) as data')).processed,1);
 assert.equal((await value<{processed:number}>('select public.fti_operations_process_outbox(5) as data')).processed,0);
 await db.exec('reset role');await as(0);
 assert.deepEqual(await value('select public.fti_operations_whatsapp_preferences() as data'),{enabled:false});
 await db.query('select public.fti_operations_whatsapp_opt_in(true)');
 assert.deepEqual(await value('select public.fti_operations_whatsapp_preferences() as data'),{enabled:true});
 await db.exec('reset role');
 await db.query('update auth.users set phone=null where id=$1',[ids[0]]);
 await as(0);
 await assert.rejects(db.query('select public.fti_operations_whatsapp_opt_in(true)'),/verified WhatsApp phone/);
 // Opt-out remains available even if the stored number is missing or invalid.
 await db.query('select public.fti_operations_whatsapp_opt_in(false)');
 assert.deepEqual(await value('select public.fti_operations_whatsapp_preferences() as data'),{enabled:false});
 await db.exec('reset role');
 await db.query('update auth.users set phone=$2 where id=$1',[ids[0],'910000000001']);
 await as(0);await db.query('select public.fti_operations_whatsapp_opt_in(true)');
 const projected=await value<{id:string}[]>("select public.fti_operations_notifications() as data");
 assert.equal(projected.length,4);
 await db.exec('reset role');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from platform.notifications where event_id=$1",[event])).rows[0].n,1);
 await as(1,'aal2');
 assert.deepEqual(await value('select public.fti_operations_failed_events() as data'),[]);
 await db.exec('reset role');
 const consentEvent=await value<string>("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('commerce.order.created','order',$1,'{}') returning id as data",[order]);
 await db.exec('set role service_role');await db.query('select public.fti_operations_process_outbox(5)');
 const claimed=await value<{id:string;template:string;parameters:string[]}[]>("select public.fti_operations_whatsapp_claim(array['fti_order_status_v1'],5) as data");
 assert.equal(claimed.length,1);assert.equal(claimed[0].template,'fti_order_status_v1');
 await db.query("select public.fti_operations_whatsapp_finish($1,'sent','wamid.test',null)",[claimed[0].id]);
 await db.exec('reset role');
 assert.equal((await db.query<{n:number}>('select count(*)::int n from platform.notifications where event_id=$1',[consentEvent])).rows[0].n,1);
 const broken=await value<string>("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('unknown.event','order',$1,'{}') returning id as data",[order]);
 for(let i=0;i<5;i++) {
  await db.exec('reset role');await db.query("update platform.outbox_events set next_attempt_at=now()-interval '1 minute' where id=$1",[broken]);
  await db.exec('set role service_role');await db.query('select public.fti_operations_process_outbox(5)');
 }
 await as(1,'aal2');
 const failed=await value<{id:string;attempts:number}[]>('select public.fti_operations_failed_events() as data');
 assert.equal(failed[0].id,broken);assert.equal(failed[0].attempts,5);
 await db.query('select public.fti_operations_replay($1)',[broken]);
 assert.deepEqual(await value('select public.fti_operations_failed_events() as data'),[]);


 await db.exec('set role anon');await assert.rejects(db.query('select public.fti_operations_notifications()'));
 }finally{await db.close();}
});
