import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('category PDFs persist without expiry, pin versions, notify staff, and deliver only to the requesting buyer', async () => {
  const db = new PGlite();
  const users = [1, 2, 3, 4].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  async function as(index: number, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [users[index], JSON.stringify({ aal })]);
    await db.exec('set role authenticated; select public.fti_identity_me()');
  }
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160004_catalog_media.sql',
      '202610160005_phase5_sales.sql', '202610160006_phase5_private_media.sql', '202610160007_phase6_commerce.sql',
      '202610160008_phase7_operations.sql', '202610160009_phase7_private_documents.sql', '202610160010_phase7_outbox.sql',
      '202610160011_phase7_whatsapp.sql', '202610170001_phase8_business_stock.sql', '202610180001_request_notifications.sql',
      '202610180002_whatsapp_phone_format.sql', '202610210001_tractor_cart_orders.sql', '202610210002_order_staff_alerts.sql', '202610210003_category_quotation_pdfs.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    }
    for (let n = 0; n < users.length; n++) {
      await db.exec('reset role');
      await db.query('insert into auth.users values($1,$2,now())', [users[n], `91900000000${n}`]);
      await as(n);
    }
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin'),($2,'accounts')", [users[1], users[3]]);
    const root = await value<string>("insert into catalog.categories(slug,name) values('fasteners','Fasteners') returning id as data");
    const category = await value<string>("insert into catalog.categories(slug,name,parent_id) values('hex-bolts','Hex bolts',$1) returning id as data", [root]);
    const other = await value<string>("insert into catalog.categories(slug,name) values('agricultural','Agricultural Parts') returning id as data");
    await as(0);
    const categories = await value<{ id: string }[]>('select public.fti_sales_category_quote_catalog() as data');
    assert.deepEqual(categories.map(c => c.id).sort(), [root, category].sort());
    const requestId = '00000000-0000-0000-0000-000000000099';
    const request = (id = requestId, cat = category) => value<{ id: string; queued: boolean; replayed: boolean }>('select public.fti_sales_category_quote_request($1,$2) as data', [id, cat]);
    await assert.rejects(request(requestId, other), /active fastener/);
    const waiting = await request();
    assert.equal(waiting.queued, false);
    assert.equal((await request()).replayed, true);
    await assert.rejects(request(requestId, root), /different category/);
    await assert.rejects(db.query('select public.fti_sales_category_quote_requests(true)'));
    await assert.rejects(db.query('select public.fti_sales_category_quote_prepare($1,100,$2)', [category, 'a'.repeat(64)]));
    await db.exec('reset role');
    assert.equal(await value<number>("select count(*)::int as data from platform.notifications where payload->>'request_type'='category quotation' and payload->>'request_state'='new'"), 2);
    assert.equal(await value<number>('select count(*)::int as data from platform.whatsapp_jobs'), 0);
    await as(1);
    await assert.rejects(db.query('select public.fti_sales_category_quote_prepare($1,100,$2)', [category, 'a'.repeat(64)]));
    await as(1, 'aal2');
    const prepare = () => value<{ id: string; object_key: string }>('select public.fti_sales_category_quote_prepare($1,100,$2) as data', [category, 'a'.repeat(64)]);
    const asset = await prepare();
    assert.match(asset.object_key, /^category-quote-files\//);
    await assert.rejects(db.query("select public.fti_sales_category_quote_complete($1,'verified','private-zone')", [asset.id]));
    await db.exec('reset role');
    await db.query("update platform.media_assets set created_at=now()-interval '10 days' where id=$1", [asset.id]);
    await db.exec('set role service_role');
    await db.query("select public.fti_sales_category_quote_complete($1,'verified','private-zone')", [asset.id]);
    const jobs = await value<{ id: string; template: string }[]>("select public.fti_operations_whatsapp_claim(array['fti_category_quotation_v1'],10) as data");
    assert.equal(jobs.length, 1, 'explicit request works without global WhatsApp subscription');
    assert.equal(await value<boolean>('select public.fti_operations_whatsapp_can_send($1) as data', [jobs[0].id]), true);
    const delivery = await value<{ object_key: string }>('select public.fti_sales_category_quote_delivery($1) as data', [jobs[0].id]);
    assert.equal(delivery.object_key, asset.object_key);
    await db.query("select public.fti_operations_whatsapp_finish($1,'sent','wamid.test')", [jobs[0].id]);
    await as(0);
    const mine = await value<{ asset_id: string; delivery_status: string }[]>('select public.fti_sales_category_quote_requests(false) as data');
    assert.equal(mine[0].asset_id, asset.id);
    assert.equal(mine[0].delivery_status, 'sent');
    await db.query('select public.fti_sales_category_quote_access($1)', [asset.id]);
    await as(2);
    await assert.rejects(db.query('select public.fti_sales_category_quote_access($1)', [asset.id]));
    assert.deepEqual(await value<unknown[]>('select public.fti_sales_category_quote_requests(false) as data'), []);
    await as(1, 'aal2');
    const replacement = await prepare();
    await db.exec('reset role; set role service_role');
    await db.query("select public.fti_sales_category_quote_complete($1,'verified','private-zone')", [replacement.id]);
    await as(0);
    await request('00000000-0000-0000-0000-000000000098');
    await db.exec('reset role');
    const pinned = (await db.query<{ asset_id: string }>('select asset_id from sales.category_quote_requests order by created_at,id')).rows.map(row => row.asset_id);
    assert.deepEqual(pinned, [asset.id, replacement.id]);
    assert.equal(await value<number>("select count(*)::int as data from platform.notifications where payload->>'request_type'='category quotation' and payload->>'request_state'='new'"), 4, 'two real requests notify both staff exactly once');
    assert.equal(await value<number>('select count(*)::int as data from platform.whatsapp_jobs'), 2);
    assert.equal(await value<number>('select count(*)::int as data from identity.profiles where whatsapp_updates_opt_in_at is not null'), 0, 'one PDF request never opts users into other updates');
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'hex-bolt','Hex bolt','fastener','published') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom,min_order_qty) values($1,'HEX-1','piece',1) returning id as data", [product]);
    await as(0);
    const lines = JSON.stringify([{ variant_id: variant, qty: '2', uom: 'piece', requirements: '' }]);
    const rfq = await value<{ id: string; pdf_requests_queued: number }>('select public.fti_sales_submit_with_pdfs($1,null,null,$2,$3,true) as data', ['00000000-0000-0000-0000-000000000088', 'Need hex bolts', lines]);
    assert.equal(rfq.pdf_requests_queued, 1);
    const retry = await value<{ replayed: boolean; pdf_requests_queued: number }>('select public.fti_sales_submit_with_pdfs($1,null,null,$2,$3,true) as data', ['00000000-0000-0000-0000-000000000088', 'Need hex bolts', lines]);
    assert.equal(retry.replayed, true);
    assert.equal(retry.pdf_requests_queued, 0);
    await db.exec('reset role');
    assert.equal(await value<number>('select count(*)::int as data from sales.category_quote_requests where rfq_id=$1', [rfq.id]), 1);
    assert.equal(await value<number>("select count(*)::int as data from platform.notifications where payload->>'entity_id'=$1 and payload->>'request_state'='new'", [rfq.id]), 2, 'a multi-item RFQ alerts all staff once, not again for each PDF');

  } finally { await db.close(); }
});
