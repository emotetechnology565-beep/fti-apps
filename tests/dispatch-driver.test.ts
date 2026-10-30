import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  driverPhone,
  validDriverDetails,
} from '../src/features/operations/model/driver-details';

test('driver details accept international phone formats and reject unsafe dial strings', () => {
  assert.equal(driverPhone('+91 (98765) 43210'), '+919876543210');
  assert.equal(validDriverDetails('', ''), true);
  assert.equal(validDriverDetails('Driver Singh', '+91 98765-43210'), true);
  for (const phone of [
    '123',
    '1234567890123456',
    '+919876543210;123',
    'tel:1234567',
    '1234567#',
    'abcdefg',
  ]) {
    assert.equal(validDriverDetails('Driver Singh', phone), false);
  }
  assert.equal(validDriverDetails('A', '9876543210'), false);
});

test('driver migration persists details, preserves dispatch guards and returns buyer-scoped history', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const order = '10000000-0000-0000-0000-000000000001';
  const request = '20000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema internal; create schema commerce; create schema sales; create schema platform;
      create function internal.identity_actor() returns uuid language sql as $$ select current_setting('test.actor')::uuid $$;
      create function internal.identity_staff(text) returns uuid language plpgsql as $$
      begin if current_setting('test.staff') <> 'yes' then raise exception 'Staff permission required' using errcode='42501'; end if;
      return internal.identity_actor(); end $$;
      create function internal.operations_notify(uuid,text,uuid) returns void language sql as $$ select $$;
      create table commerce.orders(id uuid primary key,buyer_id uuid,order_no text,status text,amount_due numeric,
        grand_total numeric,delivery_address_snapshot jsonb,created_at timestamptz default now(),updated_at timestamptz);
      create table commerce.shipments(id uuid primary key default gen_random_uuid(),order_id uuid,carrier text,
        tracking_number text,vehicle_number text,status text,dispatched_at timestamptz);
      create function public.fti_operations_dispatch(uuid,text,text,text) returns uuid language sql as $$ select $1 $$;
      create table sales.raw_material_requests(id uuid primary key,buyer_id uuid,details jsonb,created_at timestamptz default now());
      create table sales.fastener_requests(like sales.raw_material_requests including all);
      create table platform.audit_logs(actor_id uuid,action text,resource_type text,resource_id uuid,before_data jsonb,after_data jsonb);
      create table platform.notifications(user_id uuid,channel text,template_code text,payload jsonb,status text,delivered_at timestamptz);
    `);
    const prior = await readFile(
      'supabase/migrations/202610270002_request_fulfillment.sql',
      'utf8',
    );
    await db.exec(
      prior.slice(
        prior.indexOf('create table'),
        prior.indexOf(
          'create or replace function public.fti_catalog_raw_orders',
        ),
      ),
    );
    await db.exec(
      await readFile(
        'supabase/migrations/202610300001_dispatch_driver_details.sql',
        'utf8',
      ),
    );
    await db.query(
      `select set_config('test.actor',$1,false),set_config('test.staff','yes',false)`,
      [buyer],
    );
    await db.query(
      `insert into commerce.orders(id,buyer_id,order_no,status,amount_due) values($1,$2,'TEST-1','confirmed',100)`,
      [order, buyer],
    );
    const dispatch = (name = 'Driver Singh', phone = '+91 98765 43210') =>
      db.query(
        `select public.fti_operations_dispatch($1,'Transport Co','LR-123','PB01AB1234',$2,$3)`,
        [order, name, phone],
      );
    await assert.rejects(dispatch(), /fully paid/);
    await db.exec(`update commerce.orders set amount_due=0`);
    await assert.rejects(dispatch('A'), /Driver name/);
    await assert.rejects(
      dispatch('Driver Singh', '1234567;123'),
      /Driver phone/,
    );
    await db.exec(`select set_config('test.staff','no',false)`);
    await assert.rejects(dispatch(), /Staff permission/);
    await db.exec(`select set_config('test.staff','yes',false)`);
    await dispatch();
    const shipment = await db.query<{
      driver_name: string;
      driver_phone: string;
    }>(`select driver_name,driver_phone from commerce.shipments`);
    assert.deepEqual(shipment.rows[0], {
      driver_name: 'Driver Singh',
      driver_phone: '+919876543210',
    });
    await assert.rejects(dispatch(), /fully paid/);

    await db.query(
      `insert into sales.raw_material_requests values($1,$2,'{"reference":"RM-1"}',now())`,
      [request, buyer],
    );
    const update = (revision: number, status: string, details: object) =>
      db.query<{ result: Record<string, unknown> }>(
        `select public.fti_request_fulfillment_update('material',$1,$2,$3,$4) as result`,
        [request, revision, status, JSON.stringify(details)],
      );
    await update(0, 'confirmed', {
      confirmed_total: '1000',
      confirmation_note: 'Agreed with buyer',
    });
    await update(1, 'processing', {});
    const details = {
      carrier: 'Transport Co',
      tracking_number: 'LR-456',
      driver_name: 'Driver Kumar',
      driver_phone: '+91 (98765) 43210',
    };
    await assert.rejects(update(1, 'shipped', details), /Request changed/);
    await assert.rejects(
      update(2, 'shipped', { ...details, driver_phone: 'invalid' }),
      /Driver phone/,
    );
    const result = await update(2, 'shipped', details);
    assert.equal(result.rows[0].result.driver_phone, '+919876543210');
    await update(3, 'delivered', { delivery_note: 'Signed POD-123' });
    const history = await db.query<{
      result: { orders: { fulfillment: Record<string, unknown> }[] };
    }>(`select public.fti_customer_orders() as result`);
    assert.ok(
      history.rows[0].result.orders.some(
        (row) => row.fulfillment.driver_name === 'Driver Kumar',
      ),
    );
    await db.exec(
      `select set_config('test.actor','00000000-0000-0000-0000-000000000002',false)`,
    );
    const other = await db.query<{ result: { orders: unknown[] } }>(
      `select public.fti_customer_orders() as result`,
    );
    assert.deepEqual(other.rows[0].result.orders, []);
    await db.exec('set role anon');
    await assert.rejects(
      db.query(
        `select public.fti_operations_dispatch($1,'Transport Co','LR-123','')`,
        [order],
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
