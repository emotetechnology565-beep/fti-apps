import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('RFQ ownership, MFA, revision freshness and one-time acceptance', async () => {
  const db = new PGlite();
  const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(readFileSync('supabase/baseline/blueprint.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['202610150001_phase2_identity.sql','202610160001_phase3_catalog.sql','202610160005_phase5_sales.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
    await db.exec(`insert into auth.users values('${ids[0]}','+910000000001',now()),('${ids[1]}','+910000000002',now()),('${ids[2]}','+910000000003',now());`);
    async function as(index: number, aal = 'aal1') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [ids[index], JSON.stringify({ aal })]);
      await db.exec('set role authenticated');
      await db.exec("select public.fti_identity_me()");
    }
    async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ data: T }>(sql, params)).rows[0].data; }
    await db.exec('set role anon');
    await assert.rejects(db.exec('select public.fti_sales_my()'));
    await db.exec('reset role');
    const category = await value<string>("insert into catalog.categories(slug,name) values('test','Test') returning id as data");
    const product = await value<string>("insert into catalog.products(category_id,slug,name,product_kind,status) values($1,'test','Test','steel','published') returning id as data", [category]);
    const variant = await value<string>("insert into catalog.product_variants(product_id,sku,uom,min_order_qty) values($1,'TEST-1','kg',10) returning id as data", [product]);
    const second = await value<string>("insert into catalog.product_variants(product_id,sku,uom,min_order_qty) values($1,'TEST-2','kg',1) returning id as data", [product]);
    await as(0);
    const requestId = '00000000-0000-0000-0000-000000000011';
    const items = [{ variant_id: variant, qty: '10', uom: 'kg', requirements: '' }, { variant_id: second, qty: '2', uom: 'kg', requirements: '' }];
    const submit = (lines = items) => value<{ id: string; replayed: boolean }>('select public.fti_sales_submit($1,null,null,$2,$3) as data', [requestId, 'Required for site', JSON.stringify(lines)]);
    await assert.rejects(submit([{ ...items[0], qty: '5' }]));
    const rfq = await submit();
    assert.equal(rfq.replayed, false);
    assert.equal((await submit()).replayed, true);
    await assert.rejects(submit([{ ...items[0], qty: '11' }, items[1]]), /Request ID was already used with different details/);
    assert.equal((await value<{ items: unknown[] }>('select public.fti_sales_detail($1) as data', [rfq.id])).items.length, 2);
    await as(1);
    assert.equal((await value<unknown[]>('select public.fti_sales_my() as data')).length, 0);
    await assert.rejects(db.query('select public.fti_sales_detail($1)', [rfq.id]));
    await as(2);
    await assert.rejects(db.exec('select public.fti_sales_queue()'));
    await db.exec('reset role');
    await db.query('insert into identity.user_roles values($1,$2)', [ids[2], 'sales_executive']);
    await as(2);
    await assert.rejects(db.exec('select public.fti_sales_queue()'));
    await as(2, 'aal2');
    assert.equal((await value<unknown[]>('select public.fti_sales_queue() as data')).length, 1);
    await db.query('select public.fti_sales_assign($1,$2)', [rfq.id, ids[2]]);
    const expiry = new Date(Date.now() + 3600000).toISOString();
    const quote = (rates: string[]) => value<{ quotation_id: string; revision_no: number }>(
      'select public.fti_sales_quote($1,$2,$3,0,0,0,$4,$5) as data',
      [rfq.id, expiry, JSON.stringify([{ variant_id: variant, rate: rates[0] }, { variant_id: second, rate: rates[1] }]), 'Payment by bank transfer', 'Manual quote'],
    );
    const first = await quote(['50','100']);
    assert.equal(first.revision_no, 1);
    await as(0);
    await assert.rejects(db.query('select public.fti_sales_accept($1,2)', [first.quotation_id]));
    await db.query('select public.fti_sales_revision_request($1,1,$2)', [first.quotation_id, 'Please confirm delivery']);
    await assert.rejects(db.query('select public.fti_sales_accept($1,1)', [first.quotation_id]));
    await as(2, 'aal2');
    const next = await quote(['55','110']);
    assert.equal(next.revision_no, 2);
    await as(0);
    await assert.rejects(db.query('select public.fti_sales_accept($1,1)', [first.quotation_id]));
    await db.query('select public.fti_sales_accept($1,2)', [first.quotation_id]);
    await assert.rejects(db.query('select public.fti_sales_accept($1,2)', [first.quotation_id]));
    const detail = await value<{ status: string; quotations: { revisions: { grand_total: string; status: string }[] }[] }>('select public.fti_sales_detail($1) as data', [rfq.id]);
    assert.equal(detail.status, 'accepted');
    assert.equal(detail.quotations[0].revisions[0].status, 'accepted');
    assert.equal(detail.quotations[0].revisions[0].grand_total, '770.00');
    await db.exec('set role anon');
    await assert.rejects(db.exec('select * from sales.rfqs'));
  } finally { await db.close(); }
});
