import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { saleMovement } from '../src/features/market-rates/customer-model';
import {
  alertContacts,
  rateAlertLink,
} from '../src/features/market-rates/alert-links';

test('alert actions use configured numbers and keep market context in WhatsApp requests', () => {
  const contacts = alertContacts(
    '+91-9780830333\n+91-9589971567\n+919780830333\ninvalid\n123',
  );
  assert.equal(contacts.length, 2);
  assert.equal(alertContacts('9780830333')[0].digits, '919780830333');
  assert.equal(alertContacts('javascript:alert(1)').length, 0);
  const quote = {
    category: 'Old Scrap' as const,
    district: 'Mandi Gobindgarh',
    state: 'Punjab',
  };
  const url = rateAlertLink('whatsapp', contacts[1], quote);
  assert.ok(url.startsWith('https://wa.me/919589971567?text='));
  assert.match(
    decodeURIComponent(url),
    /Old Scrap market rate alerts for Mandi Gobindgarh, Punjab/,
  );
  assert.equal(rateAlertLink('sms', contacts[0], quote), 'sms:+919780830333');
});

test('sale price movement has separate increase/decrease/unchanged/unknown labels', () => {
  assert.deepEqual(saleMovement('200'), {
    symbol: '▲',
    label: '₹200',
    tone: 'up',
  });
  assert.deepEqual(saleMovement('-100'), {
    symbol: '▼',
    label: '₹100',
    tone: 'down',
  });
  assert.equal(saleMovement('0').label, 'No change');
  assert.equal(saleMovement(null).label, 'First quote');
  assert.equal(saleMovement('NaN').tone, 'neutral');
});

test('customer APIs expose sale prices and public movements only, enforce subscriptions and filter history in IST', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon;create role authenticated;
      create schema pricing;create schema identity;create schema internal;create schema platform;
      create table identity.profiles(id uuid primary key);
      insert into identity.profiles values('${actor}');
      create function internal.identity_staff(text) returns uuid language sql as $$ select '${actor}'::uuid $$;
      create function public.fti_subscription_access() returns boolean language sql as $$ select current_setting('test.subscribed')='yes' $$;
      create table platform.audit_logs(resource_id uuid,action text,after_data jsonb);
      select set_config('test.subscribed','yes',false);`);
    await db.exec(
      await readFile(
        'supabase/migrations/202610300010_market_rates_admin.sql',
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        'supabase/migrations/202610300012_customer_market_rates.sql',
        'utf8',
      ),
    );
    const value = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(`select ${sql} v`, args)).rows[0].v;
    const location = await value<string>(
      `public.fti_pricing_market_rates_location('Ingot','Punjab','Ludhiana')`,
    );
    const other = await value<string>(
      `public.fti_pricing_market_rates_location('Ingot','Uttar Pradesh','Muzaffarnagar')`,
    );
    const scrap = await value<string>(
      `public.fti_pricing_market_rates_location('Scrap','Punjab','Ludhiana')`,
    );
    await value(
      `public.fti_pricing_market_rates_location('Ingot','Gujarat','Bhavnagar')`,
    );
    const first = '10000000-0000-0000-0000-000000000001';
    await db.query(
      `insert into pricing.market_rate_entries(id,location_id,base_price,increase_amount,published_at,published_by) values
      ($1,$2,100,0,'2020-10-27T18:29:59Z',$3),
      (gen_random_uuid(),$2,100,50,'2020-10-27T18:30:00Z',$3),
      (gen_random_uuid(),$2,130,10,'2020-10-28T06:30:00Z',$3),
      (gen_random_uuid(),$2,140,0,'2020-10-29T06:30:00Z',$3),
      (gen_random_uuid(),$2,900,99,now()+interval '1 day',$3),
      (gen_random_uuid(),$4,200,0,'2020-10-28T06:30:00Z',$3),
      (gen_random_uuid(),$5,80,0,'2020-10-28T06:30:00Z',$3)`,
      [first, location, actor, other, scrap],
    );
    await db.query(
      `insert into platform.audit_logs(resource_id,action,after_data) values($1,'market_rates.import','{"reported_market_movement":-5,"usd_inr":95.04,"private_note":"not public"}')`,
      [first],
    );
    type Board = {
      items: {
        sale_price: string;
        price_change: string | null;
        location_id: string;
      }[];
      total: number;
    };
    const board = await value<Board>(
      `public.fti_pricing_market_customer_board('Ingot')`,
    );
    assert.equal(board.total, 2);
    assert.equal(
      board.items.find((row) => row.location_id === location)!.sale_price,
      '140.00',
    );
    assert.equal(
      board.items.find((row) => row.location_id === location)!.price_change,
      '0.00',
    );
    assert.equal(
      board.items.find((row) => row.location_id === other)!.price_change,
      null,
    );
    const options = await value<{ locations: unknown[] }>(
      `public.fti_pricing_market_customer_options()`,
    );
    assert.equal(options.locations.length, 4);
    const hidden =
      /base_price|increase_amount|profit|rolling|published_by|private_note|usd_inr|revision/;
    const hasPrivateKeys = (input: unknown): boolean =>
      Array.isArray(input)
        ? input.some(hasPrivateKeys)
        : input !== null && typeof input === 'object'
          ? Object.entries(input).some(
              ([key, value]) => hidden.test(key) || hasPrivateKeys(value),
            )
          : false;
    assert.ok(!hasPrivateKeys(board));
    assert.ok(!hasPrivateKeys(options));
    const filtered = await value<Board>(
      `public.fti_pricing_market_customer_board('Ingot',array['Punjab'],array[$1::uuid],'ludhiana')`,
      [location],
    );
    assert.equal(filtered.total, 1);
    assert.equal(
      (await value<Board>(`public.fti_pricing_market_customer_board('Billet')`))
        .total,
      0,
    );
    assert.equal(
      (
        await value<Board>(
          `public.fti_pricing_market_customer_board('Ingot','{}','{}','%')`,
        )
      ).total,
      0,
    );
    assert.equal(
      (
        await value<Board>(
          `public.fti_pricing_market_customer_board('Ingot','{}','{}','',24)`,
        )
      ).items.length,
      0,
    );
    const history = await value<
      { sale_price: string; price_change: string | null }[]
    >(
      `public.fti_pricing_market_customer_history($1,'2020-10-28','2020-10-28')`,
      [location],
    );
    assert.deepEqual(
      history.map((row) => row.sale_price),
      ['140.00', '150.00'],
    );
    assert.deepEqual(
      history.map((row) => Number(row.price_change)),
      [-10, 50],
    );
    assert.ok(!hasPrivateKeys(history));
    const all = await value<{ price_change: string }[]>(
      `public.fti_pricing_market_customer_history($1)`,
      [location],
    );
    assert.equal(all.length, 4);
    assert.equal(Number(all[3].price_change), -5);
    await assert.rejects(
      value(
        `public.fti_pricing_market_customer_history($1,'2020-10-30','2020-10-28')`,
        [location],
      ),
      /date range/,
    );
    assert.equal(
      await value(
        `has_function_privilege('anon','public.fti_pricing_market_customer_options()','EXECUTE')`,
      ),
      false,
    );
    assert.equal(
      await value(
        `has_table_privilege('authenticated','pricing.market_rate_entries','SELECT')`,
      ),
      false,
    );
    await db.exec(`select set_config('test.subscribed','no',false)`);
    for (const expression of [
      `public.fti_pricing_market_customer_options()`,
      `public.fti_pricing_market_customer_board('Ingot')`,
      `public.fti_pricing_market_customer_history('${location}')`,
    ])
      await assert.rejects(value(expression), /subscription is required/);
  } finally {
    await db.close();
  }
});
