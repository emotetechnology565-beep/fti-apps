import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('new orders alert every active staff member once and queue opted-in WhatsApp notices', async () => {
  const db = new PGlite();
  const users = [1, 2, 3, 4, 5].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  async function as(index: number) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [users[index], JSON.stringify({ aal: 'aal1' })]);
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
      '202610180002_whatsapp_phone_format.sql', '202610210001_tractor_cart_orders.sql', '202610210002_order_staff_alerts.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    }
    for (let n = 0; n < users.length; n++) {
      await db.exec('reset role');
      await db.query('insert into auth.users values($1,$2,now())', [users[n], `91900000000${n}`]);
      await as(n);
    }
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin'),($1,'sales_executive'),($2,'accounts'),($3,'sales_executive'),($4,'super_admin')", [users[1], users[2], users[3], users[4]]);
    await db.query("update identity.profiles set account_status='blocked' where id=$1", [users[4]]);
    for (const n of [1, 2]) { await as(n); await db.exec('select public.fti_operations_whatsapp_opt_in(true)'); }
    await db.exec('reset role');
    const category = await value<string>("insert into catalog.categories(slug,name) values('agricultural','Agricultural Parts') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'tractor','Tractor part','tractor_part','published') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom) values($1,'TRACTOR-1','piece') returning id as data", [product]);
    await as(0);
    const address = await value<string>("select public.fti_commerce_address_save('Industrial Road','Delhi','Delhi','110001') as data");
    const submit = () => value<{ id: string }>('select public.fti_commerce_cart_order($1,$2,$3) as data', ['00000000-0000-0000-0000-000000000099', address, JSON.stringify([{ variant_id: variant, qty: '1' }])]);
    const order = await submit();
    await submit();
    await db.exec('reset role');
    const recipients = (await db.query<{ user_id: string }>("select user_id from platform.notifications where payload->>'request_type'='order' order by user_id")).rows.map(row => row.user_id);
    assert.deepEqual(recipients, [users[1], users[2], users[3]], 'all active staff, including accounts/sales, with no duplicate roles or buyer notices');
    assert.equal(await value<number>('select count(*)::int as data from platform.whatsapp_jobs'), 2, 'only opted-in staff get WhatsApp jobs');
    await db.query("insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('commerce.order.created','order',$1,'{}')", [order.id]);
    assert.equal(await value<number>("select count(*)::int as data from platform.notifications where payload->>'request_type'='order'"), 3, 'confirmation outbox does not repeat staff alerts');
    await db.exec('begin');
    await db.query("insert into commerce.orders(order_no,buyer_id,delivery_address_snapshot,subtotal,grand_total,amount_due) values('ROLLBACK',$1,'{}',10,10,10)", [users[0]]);
    assert.equal(await value<number>("select count(*)::int as data from platform.notifications where payload->>'request_type'='order'"), 6);
    await db.exec('rollback');
    assert.equal(await value<number>("select count(*)::int as data from platform.notifications where payload->>'request_type'='order'"), 3, 'failed orders leave no staff alerts');
    const job = await value<string>('select id as data from platform.whatsapp_jobs where user_id=$1', [users[2]]);
    await db.query("delete from identity.user_roles where user_id=$1", [users[2]]);
    assert.equal(await value<boolean>('select public.fti_operations_whatsapp_can_send($1) as data', [job]), false, 'staff access is rechecked before sending');
  } finally { await db.close(); }
});
