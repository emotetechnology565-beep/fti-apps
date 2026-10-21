import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('tractor cart orders require admin charges and tracked stock before payment', async () => {
  const db = new PGlite();
  const buyer = '00000000-0000-0000-0000-000000000001';
  const admin = '00000000-0000-0000-0000-000000000002';
  const other = '00000000-0000-0000-0000-000000000003';
  async function value<T>(sql: string, args: unknown[] = []) {
    return (await db.query<{ data: T }>(sql, args)).rows[0].data;
  }
  async function as(actor: string, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [actor, JSON.stringify({ aal })]);
    await db.exec('set role authenticated; select public.fti_identity_me()');
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql', '202610160001_phase3_catalog.sql', '202610160005_phase5_sales.sql', '202610160007_phase6_commerce.sql', '202610210001_tractor_cart_orders.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    }
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now()),($5,$6,now())', [buyer, '+910000000001', admin, '+910000000002', other, '+910000000003']);
    for (const actor of [buyer, admin, other]) await as(actor);
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin')", [admin]);
    const category = await value<string>("insert into catalog.categories(slug,name) values('agricultural','Agricultural Parts') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'steering-kit','Steering kit','tractor_part','published') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom,min_order_qty) values($1,'KIT-1','piece',2) returning id as data", [product]);
    await db.query("insert into catalog.variant_attributes values($1,'base_price','1000'),($1,'discounted_price','800')", [variant]);
    await as(buyer);
    const address = await value<string>("select public.fti_commerce_address_save('Industrial Road','Delhi','Delhi','110001') as data");
    const request = '00000000-0000-0000-0000-000000000011';
    const submit = (lines: unknown, requestId = request) => value<{ id: string; replayed: boolean }>('select public.fti_commerce_cart_order($1,$2,$3) as data', [requestId, address, JSON.stringify(lines)]);
    await assert.rejects(submit([{ variant_id: variant, qty: '1' }]), /minimum order/);
    await assert.rejects(submit([{ variant_id: variant, qty: 'NaN' }]), /positive quantity/);
    await assert.rejects(submit([{ variant_id: variant, qty: '2' }, { variant_id: variant, qty: '2' }]), /duplicate/);
    await as(other);
    await assert.rejects(submit([{ variant_id: variant, qty: '2' }]), /delivery address/);
    await as(buyer);
    const order = await submit([{ variant_id: variant, qty: '2', unit_price: '1' }]);
    assert.equal((await submit([{ variant_id: variant, qty: '2' }])).replayed, true);
    await assert.rejects(submit([{ variant_id: variant, qty: '3' }]), /different details/);
    const detail = await value<{ status: string; subtotal: string; amount_due: string; items: { id: string; unit_price: string }[] }>('select public.fti_commerce_detail($1) as data', [order.id]);
    assert.equal(detail.status, 'pending_confirmation');
    assert.equal(detail.subtotal, '1600.00');
    assert.equal(detail.amount_due, '0.00');
    const items = [{ id: detail.items[0].id, unit_price: '800.00' }];
    const confirm = (charges = ['288.00', '100.00'], reviewItems = items) => db.query('select public.fti_commerce_cart_confirm($1,$2,$3,$4)', [order.id, JSON.stringify(reviewItems), ...charges]);
    await assert.rejects(db.query('select public.fti_commerce_bank_submit($1,$2)', [order.id, 'UTR123456']), /not awaiting/);
    await assert.rejects(confirm());
    await assert.rejects(db.query('select public.fti_commerce_cart_queue()'));
    await as(admin);
    await assert.rejects(confirm());
    await as(admin, 'aal2');
    assert.equal((await value<unknown[]>('select public.fti_commerce_cart_queue() as data')).length, 1);
    await assert.rejects(confirm(), /reservation policy/);
    await db.query('select public.fti_commerce_policy_set(24)');
    await assert.rejects(confirm(), /Tracked stock/);
    await assert.rejects(confirm(['-1', '0']), /non-negative/);
    await assert.rejects(confirm(['0', '0'], [{ id: detail.items[0].id, unit_price: '0' }]), /positive unit price/);
    await assert.rejects(confirm(['0', '0'], []), /every order item/);
    const location = await value<string>("select public.fti_commerce_location_create('WH1','Warehouse','Delhi') as data");
    await db.query('select public.fti_commerce_stock_adjust($1,$2,2,$3,$4)', [variant, location, 'Verified stock receipt', 'GRN-1']);
    await confirm();
    await assert.rejects(confirm(), /no longer awaiting/);
    await as(other);
    await assert.rejects(db.query('select public.fti_commerce_detail($1)', [order.id]));
    await as(buyer);
    const final = await value<{ status: string; grand_total: string; amount_due: string; gst_total: string; freight_total: string }>('select public.fti_commerce_detail($1) as data', [order.id]);
    assert.equal(final.status, 'pending_payment');
    assert.equal(final.grand_total, '1988.00');
    assert.equal(final.amount_due, '1988.00');
    assert.equal(final.gst_total, '288.00');
    assert.equal(final.freight_total, '100.00');
    await db.query('select public.fti_commerce_bank_submit($1,$2)', [order.id, 'UTR123456']);
    await db.exec('reset role');
    assert.equal(await value<string>('select reserved::text as data from commerce.inventory where variant_id=$1', [variant]), '2.000');
    assert.equal(await value<number>("select count(*)::int as data from commerce.orders where id=$1", [order.id]), 1);
    // Imported parts can be requested without an invented price; admin must supply it.
    await db.query('delete from catalog.variant_attributes where variant_id=$1', [variant]);
    await as(buyer);
    const unpriced = await submit([{ variant_id: variant, qty: '2' }], '00000000-0000-0000-0000-000000000012');
    const pending = await value<{ status: string; subtotal: string; items: { id: string }[] }>('select public.fti_commerce_detail($1) as data', [unpriced.id]);
    assert.equal(pending.status, 'pending_confirmation');
    assert.equal(pending.subtotal, '0.00');
    await as(admin, 'aal2');
    await assert.rejects(db.query('select public.fti_commerce_cart_confirm($1,$2,0,0)', [unpriced.id, JSON.stringify([{ id: pending.items[0].id, unit_price: '50' }])]), /Tracked stock/);
    await db.exec('reset role');
    assert.equal(await value<string>('select status as data from commerce.orders where id=$1', [unpriced.id]), 'pending_confirmation');
    assert.equal(await value<string>('select unit_price::text as data from commerce.order_items where order_id=$1', [unpriced.id]), '0.0000');
  } finally { await db.close(); }
});
