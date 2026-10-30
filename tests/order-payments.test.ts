import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  newPaymentDraft,
  paymentDraftError,
  remainingAfterPayment,
  type PaymentSummary,
} from '../src/features/orders/model/order-payments';

test('optional payment inputs add receipts and calculate the remaining balance in paise', () => {
  assert.equal(paymentDraftError(newPaymentDraft()), null);
  const draft = {
    ...newPaymentDraft(),
    payment_amount: '2000.25',
    payment_reference: 'RECEIPT-001',
  };
  assert.equal(paymentDraftError(draft, '7000.50'), null);
  assert.equal(remainingAfterPayment('7000.50', '2000.25'), '5000.25');
  assert.equal(
    remainingAfterPayment('99999999999999.99', '0.01'),
    '99999999999999.98',
  );
  assert.match(paymentDraftError(draft, '100')!, /exceeds/);
  for (const amount of ['0', '-1', '1.001', '1e3', 'NaN'])
    assert.ok(paymentDraftError({ ...draft, payment_amount: amount }));
  assert.ok(paymentDraftError({ ...draft, payment_reference: 'abc' }));
});

test('receipts are atomic, permission checked, idempotent and reflected in all order balances and WhatsApp confirmations', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const staff = '00000000-0000-0000-0000-000000000002';
  const permissions = 'order.manage,payment.review,operations.manage';
  const loadFunction = async (file: string, name: string) => {
    const sql = await readFile(`supabase/migrations/${file}`, 'utf8');
    const match = new RegExp(
      `create (?:or replace )?function ${name.replaceAll('.', '\\.')}\\(`,
    ).exec(sql);
    assert.ok(match, name);
    await db.exec(sql.slice(match.index, sql.indexOf('$$;', match.index) + 3));
  };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema internal;create schema identity;create schema commerce;create schema sales;create schema platform;
      create function internal.identity_actor() returns uuid language sql as $$ select current_setting('test.actor')::uuid $$;
      create function internal.identity_permission(text) returns boolean language sql as $$ select $1=any(string_to_array(current_setting('test.permissions'),',')) $$;
      create function internal.identity_staff(text) returns uuid language plpgsql as $$ begin
        if not internal.identity_permission($1) then raise exception 'Permission denied: %',$1 using errcode='42501'; end if;
        if current_setting('test.mfa')<>'yes' then raise exception 'Staff MFA required' using errcode='42501'; end if;
        return internal.identity_actor(); end $$;
      create table identity.profiles(id uuid primary key,full_name text default '',phone text,account_status text,whatsapp_updates_opt_in_at timestamptz);
      create table identity.businesses(id uuid primary key,legal_name text);
      create table commerce.orders(id uuid primary key,buyer_id uuid,business_id uuid,order_no text,status text,quotation_revision_id uuid,
        delivery_address_snapshot jsonb,subtotal numeric,gst_total numeric,freight_total numeric,grand_total numeric,amount_due numeric,
        closure_note text,created_at timestamptz default now(),updated_at timestamptz);
      create table commerce.order_items(id uuid primary key,order_id uuid,variant_id uuid,sku_snapshot text,qty numeric,uom text,unit_price numeric,line_total numeric);
      create table commerce.order_policy(id boolean primary key,reservation_hours integer);
      insert into commerce.order_policy values(true,24);
      create table commerce.stock_locations(id uuid primary key,is_active boolean);
      create table commerce.inventory(variant_id uuid,stock_location_id uuid,on_hand numeric,reserved numeric,updated_at timestamptz);
      create table commerce.stock_reservations(id uuid primary key default gen_random_uuid(),order_item_id uuid,variant_id uuid,stock_location_id uuid,qty numeric,status text default 'active',expires_at timestamptz);
      create table commerce.inventory_movements(variant_id uuid,stock_location_id uuid,qty_delta numeric,reason text,external_ref text,performed_by uuid);
      create table commerce.payments(id uuid primary key default gen_random_uuid(),order_id uuid,gateway text,gateway_payment_id text,amount numeric,status text,created_at timestamptz default now(),updated_at timestamptz);
      create table commerce.shipments(id uuid primary key default gen_random_uuid(),order_id uuid,carrier text,tracking_number text,vehicle_number text,status text,dispatched_at timestamptz,created_at timestamptz default now(),delivered_at timestamptz,delivery_note text);
      create function public.fti_operations_dispatch(uuid,text,text,text) returns uuid language sql as $$ select $1 $$;
      create table sales.raw_material_requests(id uuid primary key,buyer_id uuid,details jsonb,created_at timestamptz default now());
      create table sales.fastener_requests(like sales.raw_material_requests including all);
      create table platform.audit_logs(actor_id uuid,action text,resource_type text,resource_id uuid,before_data jsonb,after_data jsonb);
      create table platform.outbox_events(id uuid primary key default gen_random_uuid(),event_type text,aggregate_type text,aggregate_id uuid,payload jsonb);
      create table platform.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,channel text,template_code text,payload jsonb,status text,delivered_at timestamptz,event_id uuid);
      create table platform.whatsapp_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid unique,user_id uuid,
        template_code text constraint whatsapp_jobs_template_code_check check(template_code in ('fti_order_status_v1')),parameters jsonb,status text default 'pending');
      create function internal.operations_notify(uuid,text,uuid) returns void language sql as $$
        insert into platform.notifications(user_id,channel,template_code,payload) values($1,'in_app','operations',jsonb_build_object('title',$2,'entity_id',$3)) $$;
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
    for (const name of [
      'fti_commerce_bank_submit',
      'fti_commerce_payment_decide',
      'fti_commerce_expire',
    ])
      await loadFunction('202610160007_phase6_commerce.sql', `public.${name}`);
    await loadFunction(
      '202610210001_tractor_cart_orders.sql',
      'public.fti_commerce_cart_confirm',
    );
    await loadFunction(
      '202610160008_phase7_operations.sql',
      'public.fti_operations_deliver',
    );
    await db.exec(
      await readFile(
        'supabase/migrations/202610300001_dispatch_driver_details.sql',
        'utf8',
      ),
    );
    await db.exec(
      'alter table sales.request_fulfillments add column closure_note text',
    );
    await loadFunction(
      '202610180001_request_notifications.sql',
      'internal.operations_whatsapp_enqueue',
    );
    await db.exec(
      `create trigger operations_whatsapp_on_notice after insert on platform.notifications for each row execute function internal.operations_whatsapp_enqueue()`,
    );
    for (const file of [
      '202610300002_request_fulfillment_whatsapp.sql',
      '202610300003_dispatch_whatsapp_details.sql',
      '202610300007_admin_orders_overview.sql',
      '202610300008_order_confirmation_whatsapp_total.sql',
      '202610300009_order_payment_tracking.sql',
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    await db.query(
      `insert into identity.profiles(id,phone,account_status,whatsapp_updates_opt_in_at) values($1,'+919876543210','active',now()),($2,'+919876543211','active',now())`,
      [buyer, staff],
    );
    const actor = async (id = staff, perms = permissions, mfa = 'yes') => {
      await db.query(
        `select set_config('test.actor',$1,false),set_config('test.permissions',$2,false),set_config('test.mfa',$3,false)`,
        [id, perms, mfa],
      );
    };
    await actor();
    const summary = async (kind: string, id: string) =>
      (
        await db.query<{ value: PaymentSummary }>(
          `select public.fti_order_payments($1,$2) as value`,
          [kind, id],
        )
      ).rows[0].value;
    const record = async (kind: string, id: string, details: object) =>
      db.query(`select public.fti_order_receipt_record($1,$2,$3)`, [
        kind,
        id,
        details,
      ]);
    const receipt = (amount: string, reference = randomUUID()) => ({
      payment_id: randomUUID(),
      payment_amount: amount,
      payment_reference: reference,
    });
    const jobs = async () =>
      (
        await db.query<{
          parameters: string[];
          template_code: string;
          user_id: string;
        }>(
          `select parameters,template_code,user_id from platform.whatsapp_jobs`,
        )
      ).rows;
    const update = async (
      kind: string,
      id: string,
      revision: number,
      status: string,
      payment: object = {},
    ) =>
      db.query(`select public.fti_request_fulfillment_update($1,$2,$3,$4,$5)`, [
        kind,
        id,
        revision,
        status,
        {
          confirmed_total: '1000',
          confirmation_note: 'Order terms agreed',
          carrier: 'Punjab Transport',
          tracking_number: 'LR-123',
          delivery_note: 'Recipient signed POD',
          ...payment,
        },
      ]);
    for (const kind of ['material', 'fastener']) {
      const id = randomUUID();
      const table =
        kind === 'material' ? 'raw_material_requests' : 'fastener_requests';
      await db.query(
        `insert into sales.${table}(id,buyer_id,details) values($1,$2,$3)`,
        [
          id,
          buyer,
          { reference: kind === 'material' ? 'RM-000001' : 'FN-000002' },
        ],
      );
      await assert.rejects(
        update(kind, id, 0, 'confirmed', receipt('1001')),
        /exceeds/,
      );
      await assert.rejects(
        record(kind, id, receipt('100')),
        /Confirm the order/,
      );
      await assert.rejects(
        update(kind, id, 0, 'confirmed', receipt('-1')),
        /positive payment/,
      );
      assert.equal((await summary(kind, id)).total, null);
      await update(kind, id, 0, 'confirmed', receipt('300'));
      assert.equal((await summary(kind, id)).paid, '300.00');
      assert.equal((await summary(kind, id)).remaining, '700.00');
      const payment = receipt('200');
      await update(kind, id, 1, 'processing', payment);
      await record(kind, id, payment); // Retried receipt is not counted twice.
      await assert.rejects(
        record(kind, id, { ...payment, payment_id: randomUUID() }),
        /reference already recorded/,
      );
      assert.equal((await summary(kind, id)).paid, '500.00');
      await assert.rejects(
        record(kind, id, { ...payment, payment_amount: '201' }),
        /already used/,
      );
      await update(kind, id, 2, 'shipped'); // Optional: no receipt at this step.
      assert.equal((await summary(kind, id)).remaining, '500.00');
      await update(kind, id, 3, 'delivered', receipt('500'));
      const final = await summary(kind, id);
      assert.equal(final.remaining, '0');
      assert.equal(final.receipts.length, 3);
      await assert.rejects(record(kind, id, receipt('1')), /exceeds/);
      assert.ok(
        (await jobs()).some(
          (job) =>
            job.parameters[0] ===
              (kind === 'material' ? 'RM-000001' : 'FN-000002') &&
            job.parameters[1] === 'confirmed; total INR 1,000.00',
        ),
      );
      assert.equal(
        (await jobs()).filter(
          (job) =>
            job.parameters[0] ===
            (kind === 'material' ? 'RM-000001' : 'FN-000002'),
        ).length,
        4,
      );
      await actor(buyer, '');
      assert.equal((await summary(kind, id)).paid, '1000.00');
      await assert.rejects(record(kind, id, receipt('1')), /Permission denied/);
      await actor(staff, 'order.manage');
      await assert.rejects(record(kind, id, receipt('1')), /payment.review/);
      await actor(staff, permissions, 'no');
      await assert.rejects(summary(kind, id), /MFA/);
      await actor();
    }
    const makeCart = async () => {
      const id = randomUUID(),
        item = randomUUID(),
        variant = randomUUID(),
        location = randomUUID();
      await db.query(
        `insert into commerce.orders(id,buyer_id,order_no,status,grand_total,amount_due) values($1,$2,$3,'pending_confirmation',0,0)`,
        [id, buyer, 'O-' + id.slice(0, 8)],
      );
      await db.query(
        `insert into commerce.order_items values($1,$2,$3,'BOLT-M12',1,'pieces',0,0)`,
        [item, id, variant],
      );
      await db.query(`insert into commerce.stock_locations values($1,true)`, [
        location,
      ]);
      await db.query(
        `insert into commerce.inventory values($1,$2,10,0,now())`,
        [variant, location],
      );
      return { id, item, variant };
    };
    const project = async (eventKind: string, orderId: string) => {
      const event = (
        await db.query<{ id: string; aggregate_id: string }>(
          `select id,aggregate_id from platform.outbox_events where event_type=$1 and (aggregate_id::text=$2 or payload->>'order_id'=$2) order by id limit 1`,
          [eventKind, orderId],
        )
      ).rows[0];
      await db.query(
        `insert into platform.notifications(user_id,channel,template_code,payload,event_id) values($1,'in_app','transactional',$2,$3)`,
        [buyer, { entity_id: event.aggregate_id }, event.id],
      );
    };
    const cart = await makeCart();
    await db.query(
      `select public.fti_order_step_with_payment('confirm',$1,$2)`,
      [
        cart.id,
        {
          items: [{ id: cart.item, unit_price: '900' }],
          gst: '50',
          delivery: '50',
          ...receipt('300'),
        },
      ],
    );
    assert.equal((await summary('commerce', cart.id)).remaining, '700.00');
    await project('commerce.order.created', cart.id);
    assert.ok(
      (await jobs()).some(
        (job) =>
          job.parameters[1] ===
          'confirmed; total INR 1,000.00; awaiting payment',
      ),
    );
    await record('commerce', cart.id, receipt('200'));
    await actor(buyer, '');
    await db.query(
      `select public.fti_commerce_bank_submit($1,'UTR-REMAINING-500')`,
      [cart.id],
    );
    await actor();
    await assert.rejects(
      record('commerce', cart.id, receipt('100')),
      /pending payment review/,
    );
    const payment = (
      await db.query<{ id: string; amount: string }>(
        `select id,amount::text from commerce.payments where order_id=$1`,
        [cart.id],
      )
    ).rows[0];
    assert.equal(Number(payment.amount), 500);
    await db.query(
      `select public.fti_commerce_payment_decide($1,true,'Verified receipt in bank statement')`,
      [payment.id],
    );
    assert.equal(Number((await summary('commerce', cart.id)).paid), 1000);
    assert.equal((await summary('commerce', cart.id)).remaining, '0');
    await project('commerce.payment.verified', cart.id);
    assert.ok(
      (await jobs()).some(
        (job) =>
          job.parameters[1] ===
          'confirmed; total INR 1,000.00; payment verified',
      ),
    );
    const stock = (
      await db.query<{ on_hand: number; reserved: number }>(
        `select on_hand::int,reserved::int from commerce.inventory where variant_id=$1`,
        [cart.variant],
      )
    ).rows[0];
    assert.deepEqual(stock, { on_hand: 9, reserved: 0 });
    const manual = await makeCart();
    await db.query(
      `select public.fti_order_step_with_payment('confirm',$1,$2)`,
      [
        manual.id,
        {
          items: [{ id: manual.item, unit_price: '1000' }],
          gst: '0',
          delivery: '0',
          ...receipt('300'),
        },
      ],
    );
    const finalReceipt = receipt('700');
    await assert.rejects(
      db.query(`select public.fti_order_step_with_payment('dispatch',$1,$2)`, [
        manual.id,
        { carrier: '', tracking: 'LR-123', ...finalReceipt },
      ]),
      /carrier/,
    );
    assert.equal((await summary('commerce', manual.id)).remaining, '700.00');
    await db.query(
      `select public.fti_order_step_with_payment('dispatch',$1,$2)`,
      [
        manual.id,
        { carrier: 'Punjab Transport', tracking: 'LR-123', ...finalReceipt },
      ],
    );
    assert.equal((await summary('commerce', manual.id)).status, 'shipped');
    assert.equal((await summary('commerce', manual.id)).remaining, '0');
    assert.equal((await summary('commerce', manual.id)).receipts.length, 2);
    const partial = await makeCart();
    await db.query(
      `select public.fti_order_step_with_payment('confirm',$1,$2)`,
      [
        partial.id,
        {
          items: [{ id: partial.item, unit_price: '1000' }],
          gst: '0',
          delivery: '0',
          ...receipt('100'),
        },
      ],
    );
    await db.query(
      `update commerce.stock_reservations set expires_at=now()-interval '1 hour' where order_item_id=$1`,
      [partial.item],
    );
    await db.query(`select public.fti_commerce_expire()`);
    assert.equal(
      (await summary('commerce', partial.id)).status,
      'pending_payment',
    );
    await assert.rejects(
      record('commerce', partial.id, receipt('100')),
      /expired/,
    );
    // All customer/admin list rows include balances without additional requests.
    await actor(buyer, '');
    const history = await db.query<{
      result: { orders: { payment_summary: PaymentSummary }[] };
    }>(`select public.fti_customer_orders() as result`);
    assert.equal(history.rows[0].result.orders.length, 5);
    assert.ok(
      history.rows[0].result.orders.every((order) => order.payment_summary),
    );
    await actor();
    const overview = await db.query<{
      result: { orders: { payment_summary: PaymentSummary }[] };
    }>(`select public.fti_admin_orders() as result`);
    assert.ok(
      overview.rows[0].result.orders.every((order) => order.payment_summary),
    );
    assert.ok(
      (await jobs()).every(
        (job) =>
          job.user_id === buyer &&
          job.parameters.every((text) => text.length <= 100),
      ),
    );
    // Rerunning the deployment must preserve receipts and avoid duplicate hooks.
    const beforeRerun = await db.query(
      'select * from commerce.order_receipts order by id',
    );
    const beforeFunctions = await db.query(
      `select proname,pg_get_functiondef(oid) as definition from pg_proc where proname in ('fti_request_fulfillment_update','fti_commerce_expire','fti_admin_orders','fti_customer_orders') order by proname`,
    );
    const rerunMigration = await readFile(
      'supabase/migrations/202610300009_order_payment_tracking.sql',
      'utf8',
    );
    await db.exec(rerunMigration);
    await db.exec(rerunMigration);
    assert.deepEqual(
      (await db.query('select * from commerce.order_receipts order by id'))
        .rows,
      beforeRerun.rows,
    );
    assert.deepEqual(
      (
        await db.query(
          `select proname,pg_get_functiondef(oid) as definition from pg_proc where proname in ('fti_request_fulfillment_update','fti_commerce_expire','fti_admin_orders','fti_customer_orders') order by proname`,
        )
      ).rows,
      beforeFunctions.rows,
    );
    assert.equal((await summary('commerce', manual.id)).remaining, '0');
    await db.exec('set role anon');
    await assert.rejects(summary('commerce', cart.id), /permission denied/);
  } finally {
    await db.close();
  }
});
