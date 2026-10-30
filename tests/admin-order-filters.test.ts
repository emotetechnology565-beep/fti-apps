import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin filters run before pagination and keep staff authorization', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema internal; create schema sales; create schema commerce;
      create function internal.identity_staff(text) returns uuid language plpgsql as $$ begin
        if current_setting('test.staff',true) is distinct from 'yes' then raise exception 'Staff required' using errcode='42501'; end if;
        return '00000000-0000-0000-0000-000000000001'::uuid; end $$;
      create table sales.raw_material_requests(id uuid primary key,created_at timestamptz);
      create table sales.fastener_requests(like sales.raw_material_requests including all);
      create table sales.request_fulfillments(raw_request_id uuid unique,fastener_request_id uuid unique,status text);
      create table sales.raw_material_jobs(id uuid,request_id uuid,phone text,template text,status text,last_error text);
      create table sales.fastener_jobs(like sales.raw_material_jobs);
      create function internal.request_fulfillment_data(uuid,uuid) returns jsonb language sql as $$
        select jsonb_build_object('status',coalesce((select status from sales.request_fulfillments where raw_request_id=$1 or fastener_request_id=$2),'pending_confirmation')) $$;
      create table commerce.orders(id uuid primary key,order_no text,status text,created_at timestamptz);
      insert into sales.raw_material_requests select md5(n::text)::uuid,now()-n*interval '1 minute' from generate_series(1,35) n;
      insert into sales.fastener_requests select * from sales.raw_material_requests;
      insert into sales.request_fulfillments select id,id,case when row_number() over(order by created_at desc)<=30 then 'confirmed' else 'shipped' end from sales.raw_material_requests;
      insert into commerce.orders select r.id,r.id::text,f.status,r.created_at from sales.raw_material_requests r join sales.request_fulfillments f on f.raw_request_id=r.id;
    `);
    const sql = await readFile(
      'supabase/migrations/202610300004_admin_order_filters.sql',
      'utf8',
    );
    await db.exec(sql);
    await db.exec(sql);
    await assert.rejects(
      db.query(`select public.fti_catalog_raw_orders('all')`),
      /Staff required/,
    );
    await db.exec(`select set_config('test.staff','yes',false)`);
    for (const name of [
      'fti_catalog_raw_orders',
      'fti_catalog_fastener_orders',
      'fti_operations_orders',
    ]) {
      const result = await db.query<{ result: unknown[] }>(
        `select public.${name}('shipped',0) as result`,
      );
      assert.equal(result.rows[0].result.length, 5);
      const next = await db.query<{ result: unknown[] }>(
        `select public.${name}('confirmed',25) as result`,
      );
      assert.equal(next.rows[0].result.length, 5);
      const empty = await db.query<{ result: unknown[] }>(
        `select public.${name}('delivered',0) as result`,
      );
      assert.deepEqual(empty.rows[0].result, []);
    }
    await db.exec(
      `insert into sales.raw_material_requests values('90000000-0000-0000-0000-000000000001',now())`,
    );
    const pending = await db.query<{ result: unknown[] }>(
      `select public.fti_catalog_raw_orders('pending_confirmation',0) as result`,
    );
    assert.equal(pending.rows[0].result.length, 1);
    await db.exec('set role anon');
    await assert.rejects(
      db.query(`select public.fti_catalog_raw_orders('all')`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
