import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canCancelOrder,
  canRejectOrder,
} from '../src/features/orders/model/order-actions';

test('customers cancel before processing; staff can reject until dispatch', () => {
  for (const status of [
    'pending_confirmation',
    'pending_payment',
    'confirmed',
  ]) {
    assert.equal(canCancelOrder(status), true);
    assert.equal(canRejectOrder(status), true);
  }
  assert.equal(canCancelOrder('processing'), false);
  assert.equal(canRejectOrder('processing'), true);
  for (const status of [
    'shipped',
    'partially_shipped',
    'delivered',
    'cancelled',
    'rejected',
    'refunded',
    'unknown',
  ]) {
    assert.equal(canCancelOrder(status), false);
    assert.equal(canRejectOrder(status), false);
  }
});

test('database enforces ownership, staff permissions, cutoff, history and inventory release', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema internal; create schema commerce; create schema sales; create schema platform;
      create function internal.identity_actor() returns uuid language sql as $$ select current_setting('test.actor')::uuid $$;
      create function internal.identity_permission(text) returns boolean language sql as $$ select current_setting('test.staff')='yes' $$;
      create function internal.identity_staff(text) returns uuid language plpgsql as $$ begin
        if not internal.identity_permission($1) then raise exception 'Permission denied' using errcode='42501'; end if;
        return internal.identity_actor(); end $$;
      create table commerce.orders(id uuid primary key,buyer_id uuid,order_no text,status text constraint orders_status_check check(status is not null),
        grand_total numeric,amount_due numeric,delivery_address_snapshot jsonb,created_at timestamptz default now(),updated_at timestamptz);
      create table commerce.order_items(id uuid primary key,order_id uuid);
      create table commerce.stock_reservations(id uuid primary key,order_item_id uuid,variant_id uuid,stock_location_id uuid,qty numeric,status text);
      create table commerce.inventory(variant_id uuid,stock_location_id uuid,on_hand numeric,reserved numeric,updated_at timestamptz);
      create table commerce.inventory_movements(variant_id uuid,stock_location_id uuid,qty_delta numeric,reason text,external_ref text,performed_by uuid);
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
        prior.indexOf('create function public.fti_request_fulfillment_update'),
      ),
    );
    await db.exec(
      'alter table sales.request_fulfillments add column driver_name text, add column driver_phone text',
    );
    await db.exec(
      await readFile(
        'supabase/migrations/202610300005_order_cancellation_rejection.sql',
        'utf8',
      ),
    );
    const actor = async (id = buyer, staff = false) => {
      await db.query(
        `select set_config('test.actor',$1,false),set_config('test.staff',$2,false)`,
        [id, staff ? 'yes' : 'no'],
      );
    };
    const close = (
      kind: string,
      id: string,
      status: string,
      action = 'cancel',
      note = '',
    ) =>
      db.query(`select public.fti_order_close($1,$2,$3,$4,$5)`, [
        kind,
        id,
        action,
        status,
        note,
      ]);
    for (const kind of ['commerce', 'material', 'fastener']) {
      const table =
        kind === 'commerce'
          ? 'commerce.orders'
          : kind === 'material'
            ? 'sales.raw_material_requests'
            : 'sales.fastener_requests';
      const id = (
        await db.query<{ id: string }>('select gen_random_uuid() as id')
      ).rows[0].id;
      if (kind === 'commerce') {
        await db.query(
          `insert into commerce.orders(id,buyer_id,status) values($1,$2,'pending_confirmation')`,
          [id, buyer],
        );
      } else {
        await db.query(`insert into ${table}(id,buyer_id) values($1,$2)`, [
          id,
          buyer,
        ]);
      }
      await actor(other);
      await assert.rejects(
        close(kind, id, 'pending_confirmation'),
        /access denied/,
      );
      await actor();
      await assert.rejects(
        close(kind, id, 'pending_confirmation', 'reject', 'Unavailable'),
        /Permission denied/,
      );
      await actor(buyer, true);
      await assert.rejects(
        close(kind, id, 'pending_confirmation'),
        /Staff can reject/,
      );
      await assert.rejects(
        close(kind, id, 'pending_confirmation', 'reject', 'No'),
        /rejection reason/,
      );
      await actor();
      await close(kind, id, 'pending_confirmation');
      await assert.rejects(
        close(kind, id, 'pending_confirmation'),
        /Order changed/,
      );
      const history = await db.query<{
        data: { orders: { id: string; status: string }[] };
      }>('select public.fti_customer_orders() as data');
      assert.equal(
        history.rows[0].data.orders.find((o) => o.id === id)?.status,
        'cancelled',
      );
      const active = await db.query<{ data: { orders: { id: string }[] } }>(
        `select public.fti_customer_orders(0,'','active') as data`,
      );
      assert.equal(
        active.rows[0].data.orders.some((o) => o.id === id),
        false,
      );
      const setStatus = async (status: string) => {
        if (kind === 'commerce')
          await db.query(`update commerce.orders set status=$2 where id=$1`, [
            id,
            status,
          ]);
        else
          await db.query(
            `update sales.request_fulfillments set status=$2,confirmed_total=100,confirmation_note='Agreed',carrier='Carrier',tracking_number='LR-123',delivery_note='Received' where ${kind === 'material' ? 'raw' : 'fastener'}_request_id=$1`,
            [id, status],
          );
      };
      await setStatus('confirmed');
      await close(kind, id, 'confirmed');
      for (const status of ['shipped', 'delivered']) {
        await setStatus(status);
        await assert.rejects(close(kind, id, status), /Contact FTI admin/);
        await actor(other, true);
        await assert.rejects(
          close(kind, id, status, 'reject', 'Buyer requested cancellation'),
          /at this stage/,
        );
        await actor();
      }
      await setStatus('processing');
      await assert.rejects(close(kind, id, 'processing'), /Contact FTI admin/);
      await actor(other, true);
      await close(
        kind,
        id,
        'processing',
        'reject',
        'Buyer requested cancellation',
      );
      await assert.rejects(
        close(kind, id, 'rejected', 'reject', 'Repeated rejection'),
        /at this stage/,
      );
      await actor();
    }
    for (const allocation of ['active', 'consumed']) {
      const id = (
        await db.query<{ id: string }>('select gen_random_uuid() as id')
      ).rows[0].id;
      await db.query(
        `insert into commerce.orders(id,buyer_id,status,order_no) values($1,$2,'confirmed','ALLOC')`,
        [id, buyer],
      );
      await db.query(`insert into commerce.order_items values($1,$1)`, [id]);
      await db.query(
        `insert into commerce.stock_reservations values($1,$1,$1,$1,3,$2)`,
        [id, allocation],
      );
      await db.query(
        `insert into commerce.inventory values($1,$1,7,$2,now())`,
        [id, allocation === 'active' ? 3 : 0],
      );
      await close('commerce', id, 'confirmed');
      const inventory = await db.query<{ on_hand: number; reserved: number }>(
        `select on_hand::int,reserved::int from commerce.inventory where variant_id=$1`,
        [id],
      );
      assert.deepEqual(inventory.rows[0], {
        on_hand: allocation === 'active' ? 7 : 10,
        reserved: 0,
      });
    }
    await db.exec('set role anon');
    await assert.rejects(
      close('commerce', buyer, 'confirmed'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
