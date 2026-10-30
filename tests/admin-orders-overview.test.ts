import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import {
  emptyOrderFilters,
  indiaDate,
  orderDateRange,
  orderFilterError,
  type AdminOrdersResult,
} from '../src/features/admin/model/admin-orders';
import { ordersWorkbook } from '../src/features/admin/model/orders-workbook';

test('date inputs reject invalid dates and presets include the current India calendar day', () => {
  assert.equal(indiaDate(new Date('2026-10-29T20:00:00Z')), '2026-10-30');
  assert.deepEqual(orderDateRange(7, new Date('2026-10-29T20:00:00Z')), {
    from: '2026-10-24',
    to: '2026-10-30',
  });
  for (const from of ['2026-02-30', '30/10/2026', '2026-13-01'])
    assert.match(
      orderFilterError({ ...emptyOrderFilters, from })!,
      /YYYY-MM-DD/,
    );
  assert.match(
    orderFilterError({
      ...emptyOrderFilters,
      from: '2026-10-31',
      to: '2026-10-01',
    })!,
    /on or before/,
  );
  assert.equal(
    orderFilterError({ ...emptyOrderFilters, from: '2024-02-29' }),
    null,
  );
});

test('overview filters all order types before totals/pagination and requires staff MFA', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema internal;create schema commerce;create schema sales;create schema identity;
      create function internal.identity_staff(text) returns uuid language plpgsql as $$ begin
        if current_setting('test.staff',true) is distinct from 'yes' then raise exception 'Permission denied' using errcode='42501'; end if;
        if current_setting('test.mfa',true) is distinct from 'yes' then raise exception 'Staff MFA verification required' using errcode='42501'; end if;
        return '00000000-0000-0000-0000-000000000001'::uuid; end $$;
      create table identity.profiles(id uuid primary key,full_name text,phone text);
      create table identity.businesses(id uuid primary key,legal_name text);
      create table commerce.orders(id uuid primary key,buyer_id uuid,business_id uuid,order_no text,status text,created_at timestamptz,delivery_address_snapshot jsonb,grand_total numeric,amount_due numeric,closure_note text);
      create table commerce.order_items(id uuid primary key,order_id uuid,sku_snapshot text,qty numeric,uom text);
      create table commerce.shipments(id uuid primary key,order_id uuid,carrier text,tracking_number text,created_at timestamptz);
      create table sales.raw_material_requests(id uuid primary key,buyer_id uuid,created_at timestamptz,details jsonb);
      create table sales.fastener_requests(like sales.raw_material_requests including all);
      create table sales.request_fulfillments(raw_request_id uuid unique,fastener_request_id uuid unique,status text,confirmed_total numeric,closure_note text);
      create function internal.request_fulfillment_data(uuid,uuid) returns jsonb language sql as $$
        select coalesce((select to_jsonb(f) from sales.request_fulfillments f where raw_request_id=$1 or fastener_request_id=$2),'{"status":"pending_confirmation","revision":0,"history":[]}'::jsonb) $$;
      insert into identity.profiles values('00000000-0000-0000-0000-000000000001','Ravi Buyer','+919876543210');
      insert into commerce.orders select md5(n::text)::uuid,'00000000-0000-0000-0000-000000000001',null,'O-'||lpad(n::text,6,'0'),'confirmed','2026-10-20T10:00:00Z'::timestamptz-n*interval '1 minute','{"city":"Ludhiana"}',100,0,null from generate_series(1,35) n;
      insert into commerce.order_items select id,id,'BOLT-M12',2,'pieces' from commerce.orders;
      insert into commerce.shipments values(md5('shipment')::uuid,md5('1')::uuid,'Punjab Road Transport','LR-TRACK-001',now());
      insert into sales.raw_material_requests values(md5('raw')::uuid,'00000000-0000-0000-0000-000000000001','2026-10-29T18:30:00Z','{"reference":"RM-000036","name":"Steel Buyer","material":"Bright bar","quantity":"500 kg","business":"A&B Works","grade":"EN8"}');
      insert into sales.fastener_requests values(md5('fastener')::uuid,'00000000-0000-0000-0000-000000000001','2026-10-30T18:29:59Z','{"reference":"FN-000037","material":"Custom bolt","quantity":"40 pieces"}');
      insert into sales.request_fulfillments values(md5('raw')::uuid,null,'processing',500,null),(null,md5('fastener')::uuid,'cancelled',200,'Customer cancelled');
      insert into sales.raw_material_requests values(md5('tomorrow')::uuid,'00000000-0000-0000-0000-000000000001','2026-10-30T18:30:00Z','{"reference":"RM-000038","material":"Bright bar"}');
    `);
    const migration = await readFile(
      'supabase/migrations/202610300007_admin_orders_overview.sql',
      'utf8',
    );
    await db.exec(migration);
    const query = async (
      search = '',
      kind = 'all',
      status = 'all',
      from: string | null = null,
      to: string | null = null,
      offset = 0,
      limit = 24,
    ) =>
      (
        await db.query<{ result: AdminOrdersResult }>(
          `select public.fti_admin_orders($1,$2,$3,$4,$5,$6,$7) as result`,
          [search, kind, status, from, to, offset, limit],
        )
      ).rows[0].result;
    await assert.rejects(query(), /Permission denied/);
    await db.exec(`select set_config('test.staff','yes',false)`);
    await assert.rejects(query(), /MFA/);
    await db.exec(`select set_config('test.mfa','yes',false)`);
    const all = await query();
    assert.equal(all.summary.total, 38);
    assert.equal(all.orders.length, 24);
    assert.equal(all.summary.confirmed_value, '4000');
    assert.equal(all.summary.processing, 1);
    assert.equal(all.summary.cancelled, 1);
    assert.equal(all.summary.awaiting, 1);
    assert.equal(
      (await query('', 'all', 'all', null, null, 24)).orders.length,
      14,
    );
    const exported = await query('', 'all', 'all', null, null, 0, 10000);
    assert.equal(exported.orders.length, 38);
    assert.deepEqual(exported.summary, all.summary);
    const day = await query('', 'all', 'all', '2026-10-30', '2026-10-30');
    assert.equal(day.summary.total, 2);
    assert.deepEqual(
      day.orders.map((o) => o.reference),
      ['FN-000037', 'RM-000036'],
    );
    assert.equal((await query('bright BAR', 'material')).summary.total, 2);
    assert.equal((await query('RM-000036')).orders[0].status, 'processing');
    assert.equal((await query('A&B')).summary.total, 1);
    assert.equal((await query('LR-TRACK-001')).summary.total, 1);
    assert.equal((await query('9876543210', 'commerce')).summary.total, 35);
    assert.equal(
      (await query('BOLT-M12', 'commerce', 'confirmed')).summary.total,
      35,
    );
    assert.equal((await query('does not exist')).summary.total, 0);
    assert.equal((await query('', 'fastener', 'cancelled')).summary.total, 1);
    await assert.rejects(
      query('', 'all', 'all', '2026-10-31', '2026-10-01'),
      /valid order filters/,
    );
    await assert.rejects(
      query('', 'all', 'all', null, null, 0, 10001),
      /valid order filters/,
    );
    await db.exec('set role anon');
    await assert.rejects(query(), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(
      db.query('select * from internal.admin_order_ledger'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test('Excel export is a real two-sheet workbook with literal customer text and numeric totals', async () => {
  const fixture: AdminOrdersResult = {
    orders: [
      {
        id: 'order-id',
        kind: 'material',
        reference: 'RM-000001',
        status: 'processing',
        created_at: '2026-10-29T20:00:00Z',
        buyer_name: '=HYPERLINK("https://example.com")',
        phone: '+919876543210',
        business: 'A&B <Works>',
        location: 'Ludhiana',
        material: 'Bright bar',
        quantity: '500 kg',
        grade: 'EN8',
        size: '40 mm',
        total: '1234.50',
        amount_due: null,
        closure_note: null,
        payment_summary: {
          total: '1234.50',
          paid: '234.50',
          remaining: '1000.00',
          status: 'processing',
          receipts: [],
        },
        fulfillment: { status: 'processing', revision: 2, history: [] },
      },
    ],
    summary: {
      total: 1,
      awaiting: 0,
      active: 1,
      processing: 1,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      rejected: 0,
      confirmed_value: '1234.50',
    },
  };
  const bytes = ordersWorkbook(
    fixture,
    emptyOrderFilters,
    new Date('2026-10-30T00:00:00Z'),
  );
  const archive = unzipSync(bytes);
  const sheet = strFromU8(archive['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /A&amp;B &lt;Works&gt;/);
  assert.match(sheet, /2026-10-30 01:30:00/);
  assert.match(sheet, /<c r="M2" t="n"><v>1234.5<\/v>/);
  assert.match(sheet, /<c r="S2" t="n"><v>234.5<\/v>/);
  assert.match(sheet, /<c r="T2" t="n"><v>1000<\/v>/);
  assert.match(
    sheet,
    /<c r="E2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/,
  );
  assert.ok(!sheet.includes('<f>'));
  assert.match(strFromU8(archive['xl/workbook.xml']), /name="Orders"/);
  assert.match(strFromU8(archive['xl/workbook.xml']), /name="Overview"/);
  assert.match(
    strFromU8(archive['xl/worksheets/sheet2.xml']),
    /Matching orders/,
  );
  await mkdir('artifacts/admin-orders', { recursive: true });
  await writeFile('artifacts/admin-orders/export-fixture.xlsx', bytes);
});
