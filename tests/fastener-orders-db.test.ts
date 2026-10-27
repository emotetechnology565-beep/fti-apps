import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Fastener requests preserve snapshots, queue both recipients and enforce access and replay rules', async () => {
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const definition = '00000000-0000-0000-0000-000000000002';
  const id = '00000000-0000-0000-0000-000000000003';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema internal;create schema identity;create schema auth;create schema sales;create schema catalog;create schema platform;
 create table identity.profiles(id uuid primary key,account_status text default 'active');
 create table auth.users(id uuid,phone text,phone_confirmed_at timestamptz);
 create table identity.user_roles(user_id uuid,role_code text);
 create table identity.role_permissions(role_code text,permission text);
 create table platform.audit_logs(actor_id uuid,action text,resource_type text,resource_id uuid);
 create table sales.raw_material_recipients(phone text,enabled boolean,configured_by uuid);
 create table catalog.drawing_definitions(id uuid primary key,published_revision integer,published_data jsonb);
 create function internal.identity_actor() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
 create function internal.identity_staff(text) returns uuid language plpgsql as $$begin
 if current_setting('test.staff',true) is distinct from 'yes' then raise exception 'Permission denied';end if;
 return internal.identity_actor();end$$;
 insert into identity.profiles(id)values('${buyer}');
 insert into auth.users values('${buyer}','919000000001',now());
 insert into identity.user_roles values('${buyer}','admin');
 insert into identity.role_permissions values('admin','order.manage');
 insert into sales.raw_material_recipients values('+919000000002',true,'${buyer}');
 set test.actor='${buyer}';`);
    await db.exec(
      readFileSync(
        'supabase/migrations/202610260010_fastener_grade_rates.sql',
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/202610260011_fastener_orders.sql',
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/202610270001_fastener_optional_dimensions.sql',
        'utf8',
      ),
    );
    const def = {
      id: definition,
      revision: 1,
      published_revision: 1,
      standard: 'IS 1363',
      edition: '1967',
      shape: 'hex-bolt',
      size: 'M10',
      source: 'private source',
      notes: 'private note',
      dimensions: {
        diameter: 10,
        pitch: 1.5,
        widths: [],
        lengths: [],
        head_width: 17,
        head_height: 7.45,
        thread_add_short: 6,
        thread_add_medium: 12,
        thread_add_long: 25,
      },
    };
    await db.query('insert into catalog.drawing_definitions values($1,1,$2)', [
      definition,
      JSON.stringify(def),
    ]);
    const submit = (
      request = id,
      revision = 1,
      qty = 100,
      input = { length: 60, width: 0 },
    ) =>
      db.query<{ result: { reference: string; replayed: boolean } }>(
        'select public.fti_catalog_fastener_order_submit($1,$2,$3,$4,$5,$6,$7,$8) as result',
        [
          request,
          definition,
          revision,
          JSON.stringify(input),
          'MS',
          qty,
          false,
          JSON.stringify({
            name: 'Test buyer',
            business: 'Individual',
            location: 'Pune 411001',
            whatsapp_consent: true,
          }),
        ],
      );
    await db.exec('set role authenticated');
    // The deployed form sent width=0 despite having no width selector.
    // Required values and negative widths must still be rejected.
    await assert.rejects(
      submit(id, 1, 100, { length: 0, width: 0 }),
      /dimension length/,
    );
    await assert.rejects(
      submit(id, 1, 100, { length: 60, width: -1 }),
      /dimension width/,
    );
    assert.equal((await submit()).rows[0].result.replayed, false);
    assert.equal((await submit()).rows[0].result.replayed, true);
    await assert.rejects(submit(id, 1, 200), /different details/);
    await assert.rejects(
      submit('00000000-0000-0000-0000-000000000004', 2),
      /changed or were withdrawn/,
    );
    await assert.rejects(
      db.query('select * from sales.fastener_requests'),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select public.fti_catalog_fastener_orders()'),
      /Permission denied/,
    );
    await db.exec("set test.staff='yes'");
    const orders = (
      await db.query<{
        data: {
          definition: Record<string, unknown>;
          details: { bolt_rate: number };
          deliveries: unknown[];
        }[];
      }>('select public.fti_catalog_fastener_orders() as data')
    ).rows[0].data;
    assert.equal(orders[0].deliveries.length, 2);
    assert.equal(orders[0].definition.source, undefined);
    assert.equal(orders[0].details.bolt_rate, 105);
    await db.exec('reset role');
    await db.exec(
      'update catalog.drawing_definitions set published_data=null,published_revision=null',
    );
    await db.exec('set role service_role');
    const jobs = (
      await db.query<{ data: { id: string }[] }>(
        "select public.fti_fastener_claim(array['fti_fastener_received_v1','fti_fastener_admin_v1'],10) as data",
      )
    ).rows[0].data;
    assert.equal(jobs.length, 2);
    const saved = (
      await db.query<{ data: { definition: { size: string } } }>(
        'select public.fti_fastener_drawing_delivery($1) as data',
        [jobs[0].id],
      )
    ).rows[0].data;
    assert.equal(saved.definition.size, 'M10');
    await db.query(
      "select public.fti_fastener_finish($1,'manual_review',null,'unknown provider outcome')",
      [jobs[0].id],
    );
    assert.equal(
      (
        await db.query<{ data: unknown[] }>(
          "select public.fti_fastener_claim(array['fti_fastener_received_v1','fti_fastener_admin_v1'],10) as data",
        )
      ).rows[0].data.length,
      0,
    );
    await db.exec('reset role;set role authenticated');
    await db.query('select public.fti_catalog_fastener_delivery_replay($1)', [
      jobs[0].id,
    ]);
    await db.exec('reset role;set role anon');
    await assert.rejects(submit(), /permission denied/);
  } finally {
    await db.close();
  }
});
