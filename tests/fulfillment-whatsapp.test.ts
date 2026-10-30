import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('fulfillment updates queue one WhatsApp job per status for the opted-in buyer', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema identity; create schema internal; create schema sales; create schema platform;
      create schema commerce;
      create table commerce.orders(id uuid primary key,buyer_id uuid,order_no text,status text);
      create table commerce.shipments(id uuid primary key,order_id uuid,carrier text,tracking_number text,vehicle_number text,driver_name text,driver_phone text,dispatched_at timestamptz);
      create table identity.profiles(id uuid primary key,phone text,account_status text,whatsapp_updates_opt_in_at timestamptz);
      create function internal.identity_staff(text) returns uuid language plpgsql as $$
        begin if current_setting('test.staff') <> 'yes' then raise exception 'Staff permission required' using errcode='42501'; end if;
        return current_setting('test.actor')::uuid; end $$;
      create table sales.raw_material_requests(id uuid primary key,buyer_id uuid,details jsonb);
      create table sales.fastener_requests(like sales.raw_material_requests including all);
      create table platform.audit_logs(actor_id uuid,action text,resource_type text,resource_id uuid,before_data jsonb,after_data jsonb);
      create table platform.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,channel text,template_code text,payload jsonb,status text,delivered_at timestamptz);
      create table platform.whatsapp_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid unique references platform.notifications(id),user_id uuid,template_code text constraint whatsapp_jobs_template_code_check check(template_code in ('fti_order_status_v1')),parameters jsonb,status text default 'pending');
      create function internal.existing_notice_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger operations_whatsapp_on_notice after insert on platform.notifications for each row execute function internal.existing_notice_trigger();
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
    const migration = await readFile(
      'supabase/migrations/202610300002_request_fulfillment_whatsapp.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    const dispatchMigration = await readFile(
      'supabase/migrations/202610300003_dispatch_whatsapp_details.sql',
      'utf8',
    );
    await db.exec(dispatchMigration);
    await db.exec(dispatchMigration);
    await db.query(
      `insert into identity.profiles values($1,'+919876543210','active',now()),($2,'+919876543211','active',now())`,
      [buyer, other],
    );
    await db.query(
      `select set_config('test.actor',$1,false),set_config('test.staff','yes',false)`,
      [other],
    );
    const jobs = () =>
      db.query<{
        user_id: string;
        parameters: string[];
        template_code: string;
      }>(
        `select user_id,parameters,template_code from platform.whatsapp_jobs order by parameters->>0,parameters->>1`,
      );
    const update = (
      kind: string,
      id: string,
      revision: number,
      status: string,
    ) =>
      db.query(`select public.fti_request_fulfillment_update($1,$2,$3,$4,$5)`, [
        kind,
        id,
        revision,
        status,
        JSON.stringify({
          confirmed_total: '1000',
          confirmation_note: 'Order terms agreed',
          carrier: 'Punjab Transport',
          tracking_number: 'LR-123',
          delivery_note: 'Signed POD-123',
        }),
      ]);
    for (const [kind, table, id, ref] of [
      [
        'material',
        'raw_material_requests',
        '10000000-0000-0000-0000-000000000001',
        'FTI-RM-001',
      ],
      [
        'fastener',
        'fastener_requests',
        '20000000-0000-0000-0000-000000000001',
        'FTI-FN-001',
      ],
    ]) {
      await db.query(`insert into sales.${table} values($1,$2,$3)`, [
        id,
        buyer,
        JSON.stringify({ reference: ref }),
      ]);
      await db.exec('begin');
      await update(kind, id, 0, 'confirmed');
      await db.exec('rollback');
      assert.equal(
        (await jobs()).rows.some((job) => job.parameters[0] === ref),
        false,
      );
      for (const [revision, status] of [
        'confirmed',
        'processing',
        'shipped',
        'delivered',
      ].entries()) {
        const before = (await jobs()).rows.length;
        await update(kind, id, revision, status);
        const rows = (await jobs()).rows;
        assert.equal(rows.length, before + 1);
        assert.ok(
          rows.some(
            (job) =>
              job.user_id === buyer &&
              job.template_code ===
                (status === 'shipped'
                  ? 'fti_order_dispatch_v1'
                  : 'fti_order_status_v1') &&
              job.parameters[0] === ref &&
              job.parameters[1] ===
                (status === 'shipped' ? 'Punjab Transport' : status),
          ),
        );
        await assert.rejects(
          update(kind, id, revision, status),
          /Request changed/,
        );
        assert.equal((await jobs()).rows.length, before + 1);
      }
    }
    assert.equal((await jobs()).rows.length, 8);
    for (const job of (await jobs()).rows.filter(
      (job) => job.template_code === 'fti_order_dispatch_v1',
    )) {
      assert.deepEqual(job.parameters.slice(1), [
        'Punjab Transport',
        'LR-123',
        'Not provided',
        'Not provided',
        'Not provided',
      ]);
    }
    const commerceOrder = '40000000-0000-0000-0000-000000000001';
    await db.query(
      `insert into commerce.orders values($1,$2,'FTI-C-001','shipped')`,
      [commerceOrder, buyer],
    );
    await db.query(
      `insert into commerce.shipments values($1,$2,'Punjab Road Transport','LR-456','PB10AB1234','Gurpreet Singh','+919876543210',now())`,
      ['50000000-0000-0000-0000-000000000001', commerceOrder],
    );
    await db.exec('begin');
    await db.query(
      `insert into platform.notifications(user_id,channel,template_code,payload) values($1,'in_app','operations',$2)`,
      [
        buyer,
        JSON.stringify({
          title: 'Order FTI-C-001 dispatched',
          entity_id: commerceOrder,
        }),
      ],
    );
    const commerceJob = (await jobs()).rows.find(
      (job) => job.parameters[0] === 'FTI-C-001',
    );
    assert.equal(commerceJob?.template_code, 'fti_order_dispatch_v1');
    assert.deepEqual(commerceJob?.parameters, [
      'FTI-C-001',
      'Punjab Road Transport',
      'LR-456',
      'PB10AB1234',
      'Gurpreet Singh',
      '+919876543210',
    ]);
    await db.exec('rollback');
    // A mismatched recipient and a malformed request ID cannot produce a job.
    await db.query(
      `insert into platform.notifications(user_id,channel,template_code,payload) values($1,'in_app','operations',$2)`,
      [
        other,
        JSON.stringify({
          request_type: 'material',
          request_state: 'delivered',
          entity_id: '10000000-0000-0000-0000-000000000001',
        }),
      ],
    );
    await db.query(
      `insert into platform.notifications(user_id,channel,template_code,payload) values($1,'in_app','operations',$2)`,
      [
        buyer,
        JSON.stringify({
          request_type: 'material',
          request_state: 'confirmed',
          entity_id: 'not-a-uuid',
        }),
      ],
    );
    assert.equal((await jobs()).rows.length, 8);
    // Opt-out, inactive account, and an invalid phone retain in-app updates only.
    for (const [suffix, profile] of [
      ['3', 'whatsapp_updates_opt_in_at=null'],
      ['4', "whatsapp_updates_opt_in_at=now(),account_status='suspended'"],
      ['5', "account_status='active',phone='invalid'"],
    ]) {
      const id = `30000000-0000-0000-0000-00000000000${suffix}`;
      await db.exec(
        `update identity.profiles set ${profile} where id='${buyer}'`,
      );
      await db.query(
        `insert into sales.raw_material_requests values($1,$2,'{"reference":"NO-SEND"}')`,
        [id, buyer],
      );
      await update('material', id, 0, 'confirmed');
      assert.equal((await jobs()).rows.length, 8);
    }
    const triggers = await db.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgname='operations_whatsapp_on_notice'`,
    );
    assert.equal(triggers.rows.length, 1);
  } finally {
    await db.close();
  }
});
