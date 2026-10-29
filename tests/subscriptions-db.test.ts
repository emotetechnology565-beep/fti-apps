import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('annual subscriptions enforce payment isolation, price revisions, renewal and expiry', async () => {
  const db = new PGlite();
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ data: T }>(sql, args)).rows[0].data;
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
    ]) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }

    await db.exec(readFileSync('deployment/tmt-rates/publish.sql', 'utf8'));
    await db.exec(
      readFileSync(
        'supabase/migrations/202610250001_manual_material_requests.sql',
        'utf8',
      ),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/202610260010_fastener_grade_rates.sql',
        'utf8',
      ),
    );
    const migration = readFileSync(
      'supabase/migrations/202610290002_public_price_restrictions.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);

    await db.exec(
      readFileSync(
        'supabase/migrations/202610290003_rate_subscriptions.sql',
        'utf8',
      ),
    );
    const user = '00000000-0000-0000-0000-000000000001';
    const other = '00000000-0000-0000-0000-000000000002';
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())', [
      user,
      '919000000001',
      other,
      '919000000002',
    ]);
    for (const id of [user, other]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec('select public.fti_identity_me()');
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec('set role authenticated');
    assert.equal(
      await value('select public.fti_subscription_access() data'),
      false,
    );
    assert.equal(
      (
        await value<{ amount_paise: number }>(
          'select public.fti_subscription_status() data',
        )
      ).amount_paise,
      120000,
    );
    await assert.rejects(db.exec('select * from commerce.rate_subscriptions'));
    await assert.rejects(
      db.query('select public.fti_subscription_prepare($1,1)', [user]),
    );
    await assert.rejects(
      db.exec(
        "select public.fti_subscription_settle('order_x','pay_x',120000,'INR')",
      ),
    );
    await assert.rejects(
      db.exec('select public.fti_subscription_plan_save(150000,1)'),
    );
    await db.exec('reset role');
    await db.query("insert into identity.user_roles values($1,'super_admin')", [
      user,
    ]);
    await db.exec('set role authenticated');
    await assert.rejects(
      db.exec('select public.fti_subscription_plan_save(150000,1)'),
    );
    await db.exec(
      `select set_config('request.jwt.claims','{"aal":"aal2"}',false)`,
    );
    await db.exec('select public.fti_subscription_plan_save(150000,1)');
    await assert.rejects(
      db.exec('select public.fti_subscription_plan_save(200000,1)'),
    );
    await db.exec('reset role; set role service_role');
    await assert.rejects(
      db.query('select public.fti_subscription_prepare($1,1)', [user]),
    );
    const first = await value<{ id: string; amount_paise: number }>(
      'select public.fti_subscription_prepare($1,2) data',
      [user],
    );
    assert.equal(first.amount_paise, 150000);
    await db.query('select public.fti_subscription_order_attach($1,$2)', [
      first.id,
      'order_first',
    ]);
    await assert.rejects(
      db.exec(
        "select public.fti_subscription_settle('order_first','pay_first',120000,'INR')",
      ),
    );
    await assert.rejects(
      db.exec(
        "select public.fti_subscription_settle('order_first','pay_first',150000,'USD')",
      ),
    );
    const paid = await value<{ expires_at: string; replayed: boolean }>(
      "select public.fti_subscription_settle('order_first','pay_first',150000,'INR') data",
    );
    assert.equal(paid.replayed, false);
    const replay = await value<{ expires_at: string; replayed: boolean }>(
      "select public.fti_subscription_settle('order_first','pay_first',150000,'INR') data",
    );
    assert.equal(replay.expires_at, paid.expires_at);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      db.exec(
        "select public.fti_subscription_settle('order_first','pay_other',150000,'INR')",
      ),
    );
    await db.exec('reset role; set role authenticated');
    assert.equal(
      await value('select public.fti_subscription_access() data'),
      true,
    );
    const catalog = await value(
      "select public.fti_catalog_filtered_list(p_category=>'tmt') data",
    );
    assert.ok(JSON.stringify(catalog).includes('grade_list_price'));
    await db.exec('select public.fti_subscription_plan_save(180000,2)');
    assert.equal(
      (
        await value<{ expires_at: string }>(
          'select public.fti_subscription_status() data',
        )
      ).expires_at,
      paid.expires_at,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    assert.equal(
      await value('select public.fti_subscription_access() data'),
      false,
    );
    assert.ok(
      !JSON.stringify(
        await value(
          "select public.fti_catalog_filtered_list(p_category=>'tmt') data",
        ),
      ).includes('grade_list_price'),
    );
    assert.deepEqual(
      (
        await value<{ purchases: unknown[] }>(
          'select public.fti_subscription_status() data',
        )
      ).purchases,
      [],
    );
    await db.exec('reset role; set role service_role');
    const renewal = await value<{ id: string }>(
      'select public.fti_subscription_prepare($1,3) data',
      [user],
    );
    await db.query('select public.fti_subscription_order_attach($1,$2)', [
      renewal.id,
      'order_renew',
    ]);
    const renewed = await value<{ expires_at: string }>(
      "select public.fti_subscription_settle('order_renew','pay_renew',180000,'INR') data",
    );
    assert.ok(
      Date.parse(renewed.expires_at) - Date.parse(paid.expires_at) >=
        365 * 86400000,
    );
    await db.exec('reset role');
    await db.query(
      "update commerce.rate_subscriptions set expires_at=now()-interval '1 day' where user_id=$1",
      [user],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec('set role authenticated');
    assert.equal(
      await value('select public.fti_subscription_access() data'),
      false,
    );
    await db.exec('reset role; set role service_role');
    const expired = await value<{ id: string }>(
      'select public.fti_subscription_prepare($1,3) data',
      [user],
    );
    await db.query('select public.fti_subscription_order_attach($1,$2)', [
      expired.id,
      'order_expired',
    ]);
    const restarted = await value<{ expires_at: string }>(
      "select public.fti_subscription_settle('order_expired','pay_expired',180000,'INR') data",
    );
    const days = (Date.parse(restarted.expires_at) - Date.now()) / 86400000;
    assert.ok(days > 364 && days <= 367);
    await db.exec('reset role');
    await db.query(
      "update identity.profiles set account_status='blocked' where id=$1",
      [user],
    );
    await db.exec('set role authenticated');
    assert.equal(
      await value('select public.fti_subscription_access() data'),
      false,
    );
  } finally {
    await db.close();
  }
});
