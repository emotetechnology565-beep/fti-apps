import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  priceTotal,
  validDate,
  historyRangeError,
  historyPreset,
  historyCsv,
} from '../src/features/market-rates/model';

test('market prices calculate in paise and reject invalid inputs and impossible dates', () => {
  assert.equal(priceTotal('46300', '200'), '46500.00');
  assert.equal(priceTotal('46300', '-200'), '46100.00');
  assert.equal(priceTotal('0.10', '0.20'), '0.30');
  for (const [base, increase] of [
    ['0', '1'],
    ['200', '-200'],
    ['NaN', '0'],
    ['1e3', '0'],
    ['1.001', '0'],
    ['100', '2.001'],
    ['1,000', '0'],
  ])
    assert.equal(priceTotal(base, increase), null);
  assert.ok(validDate('2026-10-30'));
  assert.ok(!validDate('2026-02-30'));
  assert.ok(!validDate('30-10-2026'));
});

test('market rate storage enforces staff permissions, history, stale-write protection, and IST dates', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema pricing; create schema identity; create schema internal;
      create table identity.profiles(id uuid primary key);
      insert into identity.profiles values('${actor}');
      create function internal.identity_staff(text) returns uuid language plpgsql as $$ begin
        if not $1=any(string_to_array(current_setting('test.permissions'),',')) or current_setting('test.mfa')<>'yes' then
        raise exception 'Permission denied' using errcode='42501'; end if;
        return '${actor}'::uuid; end $$;
      select set_config('test.permissions','price.manage,price.publish',false),set_config('test.mfa','yes',false);
    `);
    await db.exec(
      await readFile(
        'supabase/migrations/202610300010_market_rates_admin.sql',
        'utf8',
      ),
    );
    const call = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ value: T }>(`select ${sql} as value`, args)).rows[0]
        .value;
    const location = await call<string>(
      `public.fti_pricing_market_rates_location('Ingot','Punjab','Ludhiana')`,
    );
    for (const category of ['Scrap', 'Billet', 'Old Scrap'])
      await call(
        `public.fti_pricing_market_rates_location($1,'Punjab','Ludhiana')`,
        [category],
      );
    await assert.rejects(
      call(
        `public.fti_pricing_market_rates_location('Ingot',' punjab ',' ludhiana ')`,
      ),
      /unique/,
    );
    await assert.rejects(
      call(
        `public.fti_pricing_market_rates_location('Other','Punjab','Ludhiana')`,
      ),
      /Choose a category/,
    );
    const first = await call<string>(
      `public.fti_pricing_market_rates_publish($1,null,'46300','200')`,
      [location],
    );
    const second = await call<string>(
      `public.fti_pricing_market_rates_publish($1,$2,'46300','-300')`,
      [location, first],
    );
    await assert.rejects(
      call(`public.fti_pricing_market_rates_publish($1,$2,'46300','0')`, [
        location,
        first,
      ]),
      /Prices changed/,
    );
    await assert.rejects(
      call(`public.fti_pricing_market_rates_publish($1,$2,'46300','-50000')`, [
        location,
        second,
      ]),
      /must be positive/,
    );
    await assert.rejects(
      call(`public.fti_pricing_market_rates_publish($1,$2,'1e3','0')`, [
        location,
        second,
      ]),
      /decimal places/,
    );
    const history = await call<{ id: string; sale_price: string }[]>(
      `public.fti_pricing_market_rates_history($1,null,null,0)`,
      [location],
    );
    assert.equal(history.length, 2);
    assert.equal(history[0].id, second);
    assert.equal(history[0].sale_price, '46000.00');
    await assert.rejects(
      db.query(
        `update pricing.market_rate_entries set base_price=1 where id=$1`,
        [first],
      ),
      /cannot be changed/,
    );
    await assert.rejects(
      db.query(`delete from pricing.market_rate_entries where id=$1`, [first]),
      /cannot be changed/,
    );
    await db.query(
      `insert into pricing.market_rate_entries(location_id,base_price,increase_amount,published_at,published_by) values($1,100,0,'2026-10-27T18:29:59Z',$2),($1,200,0,'2026-10-27T18:30:00Z',$2),($1,300,0,'2026-10-28T18:29:59Z',$2),($1,400,0,'2026-10-28T18:30:00Z',$2)`,
      [location, actor],
    );
    const dated = await call<{ base_price: string }[]>(
      `public.fti_pricing_market_rates_history($1,'2026-10-28','2026-10-28',0)`,
      [location],
    );
    assert.deepEqual(
      dated.map((r) => r.base_price),
      ['300.00', '200.00'],
    );
    await db.query(
      `insert into pricing.market_rate_entries(location_id,base_price,increase_amount,published_at,published_by)
      select $1,100+n,0,'2026-10-25T06:30:00Z'::timestamptz+n*interval '1 minute',$2 from generate_series(1,35) n`,
      [location, actor],
    );
    const page = await call<unknown[]>(
      `public.fti_pricing_market_rates_history($1,'2026-10-25','2026-10-25',0)`,
      [location],
    );
    const exportRows = await call<unknown[]>(
      `public.fti_pricing_market_rates_history($1,'2026-10-25','2026-10-25',0,10001)`,
      [location],
    );
    assert.equal(page.length, 20);
    assert.equal(exportRows.length, 35);
    await assert.rejects(
      call(
        `public.fti_pricing_market_rates_history($1,'2026-10-30','2026-10-25')`,
        [location],
      ),
      /Invalid history/,
    );
    const admin = await call<{
      locations: unknown[];
      settings: { revision: number; notes: string; whatsapp: string };
    }>(`public.fti_pricing_market_rates_admin()`);
    assert.equal(admin.locations.length, 4);
    assert.match(admin.settings.whatsapp, /9589971567/);
    assert.match(admin.settings.notes, /Rumours/);
    assert.equal(
      await call(
        `public.fti_pricing_market_rates_settings(1,'Updated notes','Support 24/7','+91-9780830333',E'+91-9780830333\n+91-9589971567')`,
      ),
      2,
    );
    await assert.rejects(
      call(`public.fti_pricing_market_rates_settings(1,'stale','','','')`),
      /Reload/,
    );
    await assert.rejects(
      call(
        `public.fti_pricing_market_rates_settings(2,'notes','','bad-number','')`,
      ),
      /phone numbers/,
    );
    // Simulate upgrading the initial history API, then rerun the full SQL safely.
    await db.exec(
      `create function public.fti_pricing_market_rates_history(uuid,date,integer) returns jsonb language sql as $$ select '[]'::jsonb $$`,
    );
    await db.exec(
      await readFile(
        'supabase/migrations/202610300010_market_rates_admin.sql',
        'utf8',
      ),
    );
    const afterRerun = await call<{
      locations: unknown[];
      settings: { revision: number; notes: string };
    }>(`public.fti_pricing_market_rates_admin()`);
    assert.equal(afterRerun.locations.length, 4);
    assert.equal(afterRerun.settings.revision, 2);
    assert.equal(afterRerun.settings.notes, 'Updated notes');
    assert.equal(
      (
        await call<unknown[]>(
          `public.fti_pricing_market_rates_history($1,'2026-10-25','2026-10-25',0,10001)`,
          [location],
        )
      ).length,
      35,
    );
    assert.equal(
      await call(
        `to_regprocedure('public.fti_pricing_market_rates_history(uuid,date,integer)')::text`,
      ),
      null,
    );
    await db.exec(`select set_config('test.permissions','price.manage',false)`);
    await assert.rejects(
      call(`public.fti_pricing_market_rates_publish($1,$2,'100','0')`, [
        location,
        second,
      ]),
      /Permission denied/,
    );
    await call(`public.fti_pricing_market_rates_admin()`);
    await db.exec(`select set_config('test.mfa','no',false)`);
    await assert.rejects(
      call(`public.fti_pricing_market_rates_admin()`),
      /Permission denied/,
    );
    await db.exec(
      `select set_config('test.mfa','yes',false),set_config('test.permissions','',false)`,
    );
    await assert.rejects(
      call(`public.fti_pricing_market_rates_history($1,null,null,0)`, [
        location,
      ]),
      /Permission denied/,
    );
    const grants = await db.query<{ allowed: boolean }>(
      `select has_table_privilege('authenticated','pricing.market_rate_entries','INSERT') as allowed`,
    );
    assert.equal(grants.rows[0].allowed, false);
  } finally {
    await db.close();
  }
});

test('history exports preserve prices, IST timestamps and literal text with inclusive day/week ranges', () => {
  assert.equal(
    historyRangeError('2026-10-30', '2026-10-24'),
    'The start date must be on or before the end date.',
  );
  assert.ok(historyRangeError('2026-02-30', '2026-03-01'));
  assert.equal(historyRangeError('2026-10-30', '2026-10-30'), null);
  assert.deepEqual(historyPreset(1, new Date('2026-10-29T20:00:00Z')), {
    from: '2026-10-30',
    to: '2026-10-30',
  });
  assert.deepEqual(historyPreset(7, new Date('2026-10-29T20:00:00Z')), {
    from: '2026-10-24',
    to: '2026-10-30',
  });
  const csv = historyCsv(
    {
      id: 'loc',
      category: 'Ingot',
      state: 'Punjab',
      district: '=HYPERLINK("x")',
    },
    [
      {
        id: 'entry',
        location_id: 'loc',
        base_price: '46300.25',
        increase_amount: '-200.10',
        sale_price: '46100.15',
        published_at: '2026-10-27T18:30:00Z',
        published_by: 'staff',
      },
    ],
  );
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"2026-10-28 00:00:00"'));
  assert.ok(csv.includes('"46300.25","-200.1","46100.15"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"entry","staff"'));
});
