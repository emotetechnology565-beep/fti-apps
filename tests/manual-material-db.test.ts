import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type {
  ManualPreview,
  ManualRequest,
} from '../src/features/catalog/model/manual-material';

test('manual requests match explicit ±2mm sizes, preserve intent and use real pgmq delivery semantics', async () => {
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  const stranger = '00000000-0000-0000-0000-000000000002';
  const buyer = {
    name: 'Manual buyer',
    business: 'Test Works',
    location: 'Pune 411001',
    whatsapp_consent: true,
  };
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ v: T }>(sql, args)).rows[0].v;
  const id = (n: number) =>
    `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  async function as(user: string, aal = 'aal1') {
    await db.exec('reset role');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [user, JSON.stringify({ aal })],
    );
    await db.exec('set role authenticated; select public.fti_identity_me()');
  }
  const preview = (
    size: string,
    grade = 'MS',
    material = 'Sheet',
    product: string | null = null,
  ) =>
    value<ManualPreview>(
      'select public.fti_catalog_manual_preview($1,$2,$3,$4) as v',
      [material, size, grade, product],
    );
  const request = async (
    size: string,
    grade = 'MS',
    material = 'Sheet',
  ): Promise<ManualRequest> => ({
    grade_entry: grade === 'MS' ? 'list' : 'manual',
    material,
    size,
    grade,
    uom: 'MT',
    product_id: null,
    expected_match: await preview(size, grade, material),
  });
  const submit = (
    n: number,
    data: ManualRequest,
    quantity = '1',
    details = buyer,
  ) =>
    value<{ replayed: boolean }>(
      'select public.fti_catalog_manual_request_submit($1,$2,$3,$4) as v',
      [id(n), data, quantity, details],
    );
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
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
      '202610160003_phase4_pricing.sql',
      '202610220001_category_grade_sheets.sql',
      '202610220003_material_categories.sql',
      '202610220004_round_bar_sheet_data.sql',
      '202610220002_catalogue_filters.sql',
      '202610220005_shared_steel_categories.sql',
      '202610220006_grade_sheet_gst.sql',
      '202610220007_round_bright_bar_prices.sql',
      '202610230001_raw_material_orders.sql',
      '202610240001_round_bar_availability.sql',
      '202610240002_material_selection.sql',
      '202610250001_manual_material_requests.sql',
    ]) {
      await db.exec(
        readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
          /^\uFEFF/,
          '',
        ),
      );
    }
    await db.exec(
      readFileSync(
        'supabase/migrations/202610250001_manual_material_requests.sql',
        'utf8',
      ),
    );
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())', [
      actor,
      '919000000001',
      stranger,
      '919000000002',
    ]);
    await as(actor);
    await as(stranger);
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin')", [
      actor,
    ]);
    await db.exec(
      "insert into identity.role_permissions values('super_admin','order.manage') on conflict do nothing",
    );
    const sheet = await value<string>(
      "select id as v from catalog.categories where slug='sheet'",
    );
    const product = await value<string>(
      "insert into catalog.products(category_id,slug,name,status,product_kind) values($1,'manual-sheet','Sheet MS','published','steel') returning id as v",
      [sheet],
    );
    const pricingVariant = await value<string>(
      "insert into catalog.product_variants(product_id,sku,size_label,uom,min_order_qty) values($1,'MANUAL-SHEET','13MM TO 25MM','MT',0.5) returning id as v",
      [product],
    );
    await db.query(
      "insert into catalog.variant_attributes values($1,'grade','\"MS\"'),($1,'size_group','\"13MM TO 25MM\"'),($1,'sheet_flat_base_rate_pmt','\"60000\"'),($1,'sheet_flat_vadha','\"5000\"'),($1,'sheet_flat_total','\"65000\"'),($1,'sheet_flat_gst','\"11700\"'),($1,'sheet_flat_net_prate','\"76700\"')",
      [pricingVariant],
    );
    const gstExclusion = readFileSync('supabase/migrations/202610250003_sheet_flat_exclude_gst.sql', 'utf8');
    await db.exec(gstExclusion);
    await db.exec(gstExclusion);
    for (const size of [13, 17, 25]) {
      const sid = await value<string>(
        'insert into catalog.category_sizes(category_id,label,dimensions) values($1,$2,$3) returning id as v',
        [sheet, `${size} mm`, { thickness_mm: size }],
      );
      await db.query(
        "insert into catalog.availability_options(category_id,product_id,size_id,grade,uom,min_order_qty,variant_id) values($1,$2,$3,'MS','MT',0.5,$4)",
        [sheet, product, sid, pricingVariant],
      );
    }
    const flat = await value<string>(
      "select id as v from catalog.categories where slug='flat'",
    );
    const flatProduct = await value<string>(
      "insert into catalog.products(category_id,slug,name,status,product_kind) values($1,'manual-flat','Flat MS','published','steel') returning id as v",
      [flat],
    );
    for (const [thickness, width] of [
      [10, 50],
      [12, 55],
    ]) {
      const flatSize = await value<string>(
        'insert into catalog.category_sizes(category_id,label,dimensions) values($1,$2,$3) returning id as v',
        [
          flat,
          `${thickness} x ${width} mm`,
          { thickness_mm: thickness, width_mm: width },
        ],
      );
      await db.query(
        "insert into catalog.availability_options(category_id,product_id,size_id,grade,uom,min_order_qty) values($1,$2,$3,'MS','MT',1)",
        [flat, flatProduct, flatSize],
      );
    }
    await db.exec('set role anon');
    assert.equal(
      (await preview('11 x 49', 'MS', 'Flat')).matched_size?.label,
      '10 x 50 mm',
    );
    assert.equal(
      (await preview('13 x 50', 'MS', 'Flat')).status,
      'out_of_range',
      'Do not mix dimensions from different sizes',
    );
    assert.equal(
      (await preview('10', 'MS', 'Flat')).status,
      'dimensions_required',
    );
    assert.equal(
      (await preview('15mm')).matched_size?.label,
      '13 mm',
      'Equal-distance ties choose the smaller size',
    );
    assert.equal((await preview('15.001 mm')).matched_size?.label, '17 mm');
    assert.equal((await preview('13')).size_status, 'exact');
    assert.equal(
      (await preview('11')).matched_size?.label,
      '13 mm',
      'Inclusive lower tolerance boundary',
    );
    assert.equal((await preview('10.999')).status, 'out_of_range');
    assert.equal(
      (await preview('27')).matched_size?.label,
      '25 mm',
      'Inclusive upper tolerance boundary',
    );
    assert.equal((await preview('27.001')).status, 'out_of_range');
    assert.equal(
      (await preview('21')).status,
      'out_of_range',
      'A gap in the middle is not stock',
    );
    assert.equal(
      (await preview('15', 'CUSTOM-GRADE')).status,
      'unlisted_grade',
    );
    assert.equal(
      (await preview('15', 'MS', 'Unknown Alloy')).status,
      'unlisted_material',
    );
    assert.equal(
      (await preview('15', 'MS', 'sheet ms')).option?.product_name,
      'Sheet MS',
    );
    assert.equal((await preview('15 x 20')).status, 'dimensions_required');
    for (const bad of [
      '0',
      '-1',
      '1e3',
      'Infinity',
      '12 inches',
      '1.0001',
      '15x',
      '1x2x3x4x5',
    ])
      await assert.rejects(preview(bad));
    const data = await request('15 mm');
    await assert.rejects(submit(10, data), /permission denied/);
    await as(actor, 'aal2');
    await db.exec(
      "select public.fti_catalog_raw_recipient_save('+919000000003','Sales',true)",
    );
    await assert.rejects(submit(10, data, '0.1'), /minimum/);
    await assert.rejects(
      submit(10, { ...(await request('15', 'UNLISTED')), grade_entry: 'list' }),
      /Choose a grade/,
    );
    await assert.rejects(
      submit(10, data, '1', { ...buyer, whatsapp_consent: false }),
      /agree/,
    );
    await assert.rejects(
      submit(10, {
        ...data,
        expected_match: { ...data.expected_match, matched_size: null },
      }),
      /changed/,
    );
    assert.equal((await submit(10, data)).replayed, false);
    assert.equal((await submit(10, data)).replayed, true);
    await assert.rejects(submit(10, data, '2'), /different details/);
    await as(stranger);
    await assert.rejects(submit(10, data), /unavailable/);
    await assert.rejects(db.exec('select * from sales.raw_material_requests'));
    await as(actor);
    await submit(11, await request('10000', 'NEW-GRADE', 'Unknown Alloy'));
    await submit(12, await request('21'));
    await db.exec('reset role');
    const saved = await value<Record<string, unknown>>(
      'select details as v from sales.raw_material_requests where id=$1',
      [id(10)],
    );
    assert.equal(saved.requested_size, '15 mm');
    assert.equal((saved.pricing_size as { label: string }).label, '13 mm');
    assert.equal(
      saved.size,
      '15 mm',
      'Requested size is never rounded on the order or acknowledgment',
    );
    assert.equal(saved.price_state, 'estimated');
    assert.equal(saved.estimated_unit_price, 65000);
    assert.equal(saved.estimated_total, 65000);
    assert.equal(saved.gst_included, false);
    assert.equal(saved.contact, '9780830333');
    await db.exec(gstExclusion);
    assert.deepEqual(await value<Record<string, unknown>>(
      'select details as v from sales.raw_material_requests where id=$1', [id(10)],
    ), saved, 'Reapplying the tax change preserves existing request snapshots');
    assert.equal(
      await value<number>(
        'select count(*)::int as v from sales.raw_material_jobs',
      ),
      6,
    );

    // Install the upstream SQL implementation in PGlite, rather than mocking pgmq.
    // Only CREATE EXTENSION in our migration is omitted; the real functions execute.
    await db.exec(readFileSync('tests/fixtures/pgmq-1.5.1.sql', 'utf8'));
    const queueSql = readFileSync(
      'supabase/migrations/202610250002_raw_material_supabase_queues.sql',
      'utf8',
    ).replace('create extension if not exists pgmq;', '');
    await db.exec(queueSql);
    await db.exec(queueSql);
    assert.equal(
      await value<number>(
        'select count(*)::int as v from pgmq.q_fti_raw_material_buyer',
      ),
      3,
      'Rollout backfills once',
    );
    assert.equal(
      await value<number>(
        'select count(*)::int as v from pgmq.q_fti_raw_material_staff',
      ),
      3,
    );
    await as(actor);
    await submit(13, await request('17'));
    await assert.rejects(
      db.exec('select * from pgmq.q_fti_raw_material_buyer'),
    );
    await assert.rejects(
      db.exec(
        "select public.fti_raw_material_claim(array['fti_raw_material_received_v1'])",
      ),
    );
    await db.exec('reset role;set role service_role');
    type Job = {
      id: string;
      phone: string;
      template: string;
      parameters: string[];
    };
    const claim = (
      templates = ['fti_raw_material_received_v1', 'fti_raw_material_admin_v1'],
    ) =>
      value<Job[]>('select public.fti_raw_material_claim($1,20) as v', [
        templates,
      ]);
    const buyerJobs = await claim(['fti_raw_material_received_v1']);
    assert.equal(buyerJobs.length, 4);
    assert.equal(
      (await claim(['fti_raw_material_received_v1'])).length,
      0,
      'Visibility lease prevents duplicate claims',
    );
    const staffJobs = await claim(['fti_raw_material_admin_v1']);
    assert.equal(
      staffJobs.length,
      4,
      'Unapproved templates do not consume the other queue',
    );
    assert.ok(
      [...buyerJobs, ...staffJobs].every((job) =>
        job.parameters.every((text) => !!text && text.length <= 100),
      ),
    );
    assert.equal(
      await value<boolean>('select public.fti_raw_material_can_send($1) as v', [
        buyerJobs[0].id,
      ]),
      true,
    );
    await db.query(
      "select public.fti_raw_material_finish($1,'sent','wamid.manual',null)",
      [buyerJobs[0].id],
    );
    await db.exec('reset role');
    assert.equal(
      await value<number>(
        'select count(*)::int as v from pgmq.a_fti_raw_material_buyer',
      ),
      1,
    );
    await db.exec('set role service_role');
    await db.query(
      "select public.fti_raw_material_finish($1,'retry',null,'Rate limited')",
      [buyerJobs[1].id],
    );
    assert.equal(
      (await claim()).length,
      0,
      'Retry stays invisible during backoff',
    );
    await db.exec('reset role');
    await db.query(
      "update sales.raw_material_jobs set next_attempt_at=now()-interval '1 second' where id=$1",
      [buyerJobs[1].id],
    );
    await db.exec(
      "update pgmq.q_fti_raw_material_buyer set vt=now()-interval '1 second'",
    );
    await db.exec('set role service_role');
    assert.equal((await claim()).length, 1);
    await db.query(
      "select public.fti_raw_material_finish($1,'manual_review',null,'Unknown provider outcome')",
      [buyerJobs[1].id],
    );
    await as(actor, 'aal2');
    await db.query('select public.fti_catalog_raw_delivery_replay($1)', [
      buyerJobs[1].id,
    ]);
    await db.exec('reset role;set role service_role');
    assert.equal(
      (await claim()).length,
      1,
      'Explicit staff replay enqueues a new message',
    );
    await db.exec('reset role');
    await db.query(
      "update sales.raw_material_jobs set claimed_at=now()-interval '16 minutes' where id=$1",
      [buyerJobs[2].id],
    );
    await db.exec(
      "update pgmq.q_fti_raw_material_buyer set vt=now()-interval '1 second'",
    );
    await db.exec('set role service_role');
    assert.equal(
      (await claim()).length,
      0,
      'Expired sends require manual review, never an automatic resend',
    );
    await db.exec('reset role');
    assert.equal(
      await value<string>(
        'select status as v from sales.raw_material_jobs where id=$1',
        [buyerJobs[2].id],
      ),
      'manual_review',
    );
    const before = await value<number>(
      'select count(*)::int as v from sales.raw_material_jobs',
    );
    await as(actor);
    await submit(10, data);
    await db.exec('reset role');
    assert.equal(
      await value<number>(
        'select count(*)::int as v from sales.raw_material_jobs',
      ),
      before,
      'Retry does not duplicate jobs',
    );
  } finally {
    await db.close();
  }
});
