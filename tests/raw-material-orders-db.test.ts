import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('raw-material requests validate variants, deduplicate and queue all enabled recipients privately', async () => {
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const staff = '00000000-0000-0000-0000-000000000002';
  const requestId = '00000000-0000-0000-0000-000000000099';
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ data: T }>(sql, args)).rows[0].data;
  async function as(id: string, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ aal })]);
    await db.exec('set role authenticated; select public.fti_identity_me()');
  }
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610220002_catalogue_filters.sql', '202610230001_raw_material_orders.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    }
    await db.exec(readFileSync('supabase/migrations/202610230001_raw_material_orders.sql', 'utf8'));
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())', [buyer, '919000000001', staff, '919000000002']);
    await as(buyer); await as(staff);
    await db.exec(`reset role; insert into identity.role_permissions values('super_admin','order.manage') on conflict do nothing;`);
    await db.query("insert into identity.user_roles values($1,'super_admin')", [staff]);
    const category = await value<string>("insert into catalog.categories(slug,name) values('sheet','Sheet') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,status,product_kind) values($1,'sheet-ms','Sheet MS','published','steel') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,size_label,uom,min_order_qty) values($1,'SHEET-MS','16MM TO 50MM','MT',1) returning id as data", [product]);
    await db.query("insert into catalog.variant_attributes values($1,'grade','\"MS\"'),($1,'size_group','\"16MM TO 50MM\"')", [variant]);
    const details = { name: 'Test Buyer', business: 'Test Works', location: 'Pune, Maharashtra 411001', whatsapp_consent: true };
    const submit = (id = requestId, qty = '2', size = 20, data = details) => value<{ id: string; replayed: boolean }>('select public.fti_catalog_raw_order_submit($1,$2,$3,$4,$5) as data', [id, variant, size, qty, data]);
    await as(buyer);
    await assert.rejects(db.query("select public.fti_catalog_raw_recipient_save('+919000000003','Sales',true)"));
    await assert.rejects(db.query('select public.fti_catalog_raw_orders()'));
    await assert.rejects(submit(requestId, '0.5'), /minimum/);
    await assert.rejects(submit(requestId, '2', 80), /available size/);
    await assert.rejects(submit(requestId, '2', 20, { ...details, whatsapp_consent: false }), /agree/);
    await as(staff);
    await assert.rejects(db.query("select public.fti_catalog_raw_recipient_save('+919000000003','Sales',true)"), /MFA/);
    await as(staff, 'aal2');
    await db.exec("select public.fti_catalog_raw_recipient_save('+91 9000000003','Sales',true); select public.fti_catalog_raw_recipient_save('+919000000004','Dispatch',true); select public.fti_catalog_raw_recipient_save('+919000000005','Disabled',false)");
    await as(buyer);
    assert.equal((await submit()).replayed, false);
    assert.equal((await submit()).replayed, true);
    await assert.rejects(submit(requestId, '3'), /different details/);
    await assert.rejects(db.exec('select * from sales.raw_material_requests'));
    await db.exec('reset role');
    assert.equal(await value<number>('select count(*)::int as data from sales.raw_material_jobs'), 3);
    await db.exec('set role service_role');
    const jobs = await value<{ id: string; template: string; phone: string; parameters: string[] }[]>("select public.fti_raw_material_claim(array['fti_raw_material_received_v1','fti_raw_material_admin_v1'],10) as data");
    assert.equal(jobs.length, 3);
    assert.deepEqual(jobs.map(j => j.phone).sort(), ['+919000000001', '+919000000003', '+919000000004']);
    for (const job of jobs) {
      assert.equal(job.parameters.length, job.template.includes('admin') ? 9 : 6);
      assert.equal(await value<boolean>('select public.fti_raw_material_can_send($1) as data', [job.id]), true);
    }
    const removed = jobs.find(j => j.phone === '+919000000003')!;
    await as(staff, 'aal2');
    await db.exec("select public.fti_catalog_raw_recipient_remove('+919000000003')");
    await db.exec('reset role; set role service_role');
    assert.equal(await value<boolean>('select public.fti_raw_material_can_send($1) as data', [removed.id]), false);
    await db.query("select public.fti_raw_material_finish($1,'failed',null,'Recipient removed')", [removed.id]);
    const ack = jobs.find(j => j.template.includes('received'))!;
    await db.query("select public.fti_raw_material_finish($1,'sent','wamid.test',null)", [ack.id]);
    await assert.rejects(db.query("select public.fti_raw_material_finish($1,'sent','wamid.test',null)", [ack.id]), /state/);
    await as(staff, 'aal2');
    const orders = await value<{ deliveries: unknown[] }[]>('select public.fti_catalog_raw_orders() as data');
    assert.equal(orders.length, 1); assert.equal(orders[0].deliveries.length, 3);
  } finally { await db.close(); }
});
