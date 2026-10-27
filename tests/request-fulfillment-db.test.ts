import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { RequestFulfillmentState } from '../src/features/operations/model/request-fulfillment';

test('material and fastener fulfillment persist guarded transitions, evidence, MFA and audit history', async () => {
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const staff = '00000000-0000-0000-0000-000000000002';
  const orderStaff = '00000000-0000-0000-0000-000000000003';
  const request = '00000000-0000-0000-0000-000000000099';
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ data: T }>(sql, args)).rows[0].data;
  async function as(actor: string, aal = 'aal2') {
    await db.exec('reset role');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [actor, JSON.stringify({ aal })],
    );
    await db.exec('set role authenticated; select public.fti_identity_me()');
  }
  const update = (
    kind: string,
    revision: number | null,
    status: string | null,
    details: unknown = {},
  ) =>
    value<RequestFulfillmentState>(
      'select public.fti_request_fulfillment_update($1,$2,$3,$4,$5) as data',
      [kind, request, revision, status, JSON.stringify(details)],
    );
  const confirmation = {
    confirmed_total: '12500.50',
    confirmation_note:
      'Availability and full price agreed with buyer; bank transfer before dispatch.',
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(
      readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
    for (const file of [
      '202610150001_phase2_identity.sql',
      '202610160001_phase3_catalog.sql',
      '202610220002_catalogue_filters.sql',
      '202610230001_raw_material_orders.sql',
      '202610260010_fastener_grade_rates.sql',
    ]) {
      await db.exec(
        readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
          /^\uFEFF/,
          '',
        ),
      );
    }
    // Only the drawing source is incidental to this workflow; requests retain their own snapshots.
    await db.exec(
      'create table catalog.drawing_definitions(id uuid primary key)',
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/202610260011_fastener_orders.sql',
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/202610270002_request_fulfillment.sql',
        'utf8',
      ),
    );
    for (const [index, actor] of [buyer, staff, orderStaff].entries()) {
      await db.exec('reset role');
      await db.query('insert into auth.users values($1,$2,now())', [
        actor,
        `91900000000${index + 1}`,
      ]);
      await as(actor);
    }
    await db.exec(`reset role;
      insert into identity.role_permissions values('super_admin','order.manage'),('super_admin','operations.manage'),('order_manager','order.manage') on conflict do nothing;`);
    await db.query(
      "insert into identity.user_roles values($1,'super_admin'),($2,'order_manager')",
      [staff, orderStaff],
    );
    const category = await value<string>(
      "insert into catalog.categories(slug,name) values('steel','Steel') returning id as data",
    );
    const product = await value<string>(
      "insert into catalog.products(category_id,slug,name) values($1,'steel','Steel') returning id as data",
      [category],
    );
    const variant = await value<string>(
      "insert into catalog.product_variants(product_id,sku,uom) values($1,'STEEL','MT') returning id as data",
      [product],
    );
    await db.query(
      'insert into sales.raw_material_requests(id,buyer_id,variant_id,size_mm,quantity,details) values($1,$2,$3,20,2,$4)',
      [request, buyer, variant, JSON.stringify({ reference: 'FTI-RM-TEST' })],
    );
    const drawing = await value<string>(
      'insert into catalog.drawing_definitions values(gen_random_uuid()) returning id as data',
    );
    await db.query(
      "insert into sales.fastener_requests values($1,$2,$3,'{}','{}',$4,now())",
      [request, buyer, drawing, JSON.stringify({ reference: 'FTI-FS-TEST' })],
    );
    await as(buyer);
    await assert.rejects(
      update('material', 0, 'confirmed', confirmation),
      /Permission denied/,
    );
    await assert.rejects(
      db.query('select * from sales.request_fulfillments'),
      /permission denied/,
    );
    await as(staff, 'aal1');
    await assert.rejects(
      update('material', 0, 'confirmed', confirmation),
      /MFA/,
    );
    await as(staff);
    await assert.rejects(
      update('invalid', 0, 'confirmed', confirmation),
      /valid request/,
    );
    await assert.rejects(
      update('material', null, 'confirmed', confirmation),
      /valid request/,
    );
    await assert.rejects(
      update('material', 0, null, confirmation),
      /valid request/,
    );
    await assert.rejects(
      update('material', 0, 'confirmed', []),
      /valid request/,
    );
    for (const kind of ['material', 'fastener']) {
      const listOperation =
        kind === 'material'
          ? 'fti_catalog_raw_orders'
          : 'fti_catalog_fastener_orders';
      const list = () =>
        value<{ fulfillment: RequestFulfillmentState }[]>(
          `select public.${listOperation}() as data`,
        );
      assert.equal(
        (await list())[0].fulfillment.status,
        'pending_confirmation',
      );
      await assert.rejects(
        update(kind, 0, 'shipped', {
          carrier: 'Transport',
          tracking_number: 'LR-1',
        }),
        /preceding/,
      );
      await assert.rejects(
        update(kind, 0, 'confirmed', { ...confirmation, confirmed_total: '0' }),
        /positive/,
      );
      await assert.rejects(
        update(kind, 0, 'confirmed', {
          ...confirmation,
          confirmed_total: '1.001',
        }),
        /positive agreed total/,
      );
      await assert.rejects(
        update(kind, 0, 'confirmed', {
          ...confirmation,
          confirmation_note: ' ',
        }),
        /confirmation note/,
      );
      const confirmed = await update(kind, 0, 'confirmed', confirmation);
      assert.equal(confirmed.status, 'confirmed');
      assert.equal(confirmed.confirmed_total, '12500.50');
      assert.equal(confirmed.revision, 1);
      await assert.rejects(
        update(kind, 0, 'confirmed', confirmation),
        /Request changed/,
      );
      await assert.rejects(
        update(kind, 1, 'delivered', { delivery_note: 'POD-1' }),
        /preceding/,
      );
      await update(kind, 1, 'processing');
      await as(orderStaff);
      await assert.rejects(
        update(kind, 2, 'shipped', {
          carrier: 'Transport',
          tracking_number: 'LR-1',
        }),
        /Permission denied/,
      );
      await as(staff);
      await assert.rejects(update(kind, 2, 'shipped', {}), /transporter/);
      await assert.rejects(
        update(kind, 2, 'shipped', {
          carrier: 'Transport',
          tracking_number: 'LR-1',
          vehicle_number: 'x'.repeat(41),
        }),
        /vehicle number/,
      );
      const shipped = await update(kind, 2, 'shipped', {
        carrier: 'FTI Transport',
        tracking_number: 'LR-12345',
        vehicle_number: 'PB01AB1234',
      });
      assert.equal(shipped.tracking_number, 'LR-12345');
      assert.equal(shipped.confirmation_note, confirmation.confirmation_note);
      await assert.rejects(
        update(kind, 3, 'delivered', { delivery_note: 'no' }),
        /delivery evidence/,
      );
      const delivered = await update(kind, 3, 'delivered', {
        delivery_note: 'Signed POD-12345 received from buyer',
      });
      assert.equal(delivered.status, 'delivered');
      assert.deepEqual(
        delivered.history.map((event) => event.status),
        ['confirmed', 'processing', 'shipped', 'delivered'],
      );
      assert.ok(delivered.history.every((event) => event.actor_id === staff));
      await assert.rejects(update(kind, 4, 'processing'), /preceding/);
      const persisted = (await list())[0].fulfillment;
      assert.equal(persisted.status, 'delivered');
      assert.equal(
        persisted.delivery_note,
        'Signed POD-12345 received from buyer',
      );
      assert.equal(persisted.revision, 4);
    }
    await db.exec('reset role');
    assert.equal(
      await value<number>(
        'select count(*)::integer as data from sales.request_fulfillments',
      ),
      2,
    );
    assert.equal(
      await value<number>(
        "select count(*)::integer as data from platform.audit_logs where action like 'request.%'",
      ),
      8,
    );
    assert.equal(
      await value<number>(
        'select count(*)::integer as data from platform.notifications where user_id=$1',
        [buyer],
      ),
      8,
    );
    // Request fulfillment does not manufacture checkout orders or payment confirmations.
    assert.equal(
      await value<number>(
        'select count(*)::integer as data from commerce.orders',
      ),
      0,
    );
    assert.equal(
      await value<number>(
        'select count(*)::integer as data from commerce.payments',
      ),
      0,
    );
    await db.exec('set role anon');
    await assert.rejects(
      update('material', 0, 'confirmed', confirmation),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
