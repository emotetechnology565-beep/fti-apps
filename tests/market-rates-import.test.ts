import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('market.txt import preserves all distinct quotes, movements and grades and safely reruns', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema pricing; create schema identity; create schema internal; create schema platform;
      create table identity.profiles(id uuid primary key,account_status text);
      create table identity.user_roles(user_id uuid,role_code text);
      create table identity.role_permissions(role_code text,permission text);
      create table platform.audit_logs(actor_id uuid,action text,resource_type text,resource_id uuid,after_data jsonb);
      create function internal.identity_staff(text) returns uuid language sql as $$ select '${actor}'::uuid $$;
      insert into identity.profiles values('${actor}','active');
      insert into identity.user_roles values('${actor}','super_admin');
      insert into identity.role_permissions values('super_admin','price.manage'),('super_admin','price.publish');`);
    await db.exec(
      await readFile(
        'supabase/migrations/202610300010_market_rates_admin.sql',
        'utf8',
      ),
    );
    const script = await readFile(
      'supabase/imports/market-2026-10-28.sql',
      'utf8',
    );
    await db.exec(script);
    const rows = (
      await db.query<{
        category: string;
        district: string;
        sale_price: string;
        increase_amount: string;
        published_at: Date;
      }>(
        `select l.category,l.district,e.sale_price,e.increase_amount,e.published_at from pricing.market_rate_entries e join pricing.market_rate_locations l on l.id=e.location_id`,
      )
    ).rows;
    assert.equal(rows.length, 36);
    assert.equal(rows.filter((r) => r.category === 'Ingot').length, 16);
    assert.equal(rows.filter((r) => r.category === 'Scrap').length, 9);
    assert.equal(rows.filter((r) => r.category === 'Billet').length, 10);
    assert.equal(rows.filter((r) => r.category === 'Old Scrap').length, 1);
    assert.equal(
      rows.find(
        (r) => r.category === 'Ingot' && r.district === 'Ludhiana (EN8D)',
      )?.sale_price,
      '46900.00',
    );
    assert.equal(
      rows.find((r) => r.category === 'Ingot' && r.district === 'Ludhiana (MS)')
        ?.sale_price,
      '46500.00',
    );
    assert.equal(
      rows.find((r) => r.category === 'Old Scrap')?.sale_price,
      '33600.00',
    );
    assert.ok(rows.every((r) => r.increase_amount === '0.00'));
    assert.ok(
      rows.every(
        (r) =>
          new Date(r.published_at).toISOString() === '2026-10-28T06:30:00.000Z',
      ),
    );
    const audit = (
      await db.query<{
        after_data: { reported_market_movement: number; usd_inr: number };
      }>(
        `select after_data from platform.audit_logs where after_data->>'source_market_label'='Durgapur' and after_data->>'category'='Scrap'`,
      )
    ).rows[0];
    assert.equal(audit.after_data.reported_market_movement, -1000);
    assert.equal(audit.after_data.usd_inr, 95.04);
    // Newer admin prices must remain latest after import and repeated imports.
    await db.exec(`insert into pricing.market_rate_entries(location_id,base_price,increase_amount,published_at,published_by)
      select id,50000,100,'2026-10-30T06:30:00Z','${actor}' from pricing.market_rate_locations where category='Old Scrap';
      update pricing.market_rate_settings set notes='Admin edited notes',revision=2 where id;`);
    await db.exec(script);
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::integer n from pricing.market_rate_entries`,
        )
      ).rows[0].n,
      37,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::integer n from platform.audit_logs`,
        )
      ).rows[0].n,
      36,
    );
    assert.equal(
      (
        await db.query<{ notes: string }>(
          `select notes from pricing.market_rate_settings where id`,
        )
      ).rows[0].notes,
      'Admin edited notes',
    );
    assert.equal(
      (
        await db.query<{ sale_price: string }>(
          `select sale_price from pricing.market_rate_entries e join pricing.market_rate_locations l on l.id=e.location_id where l.category='Old Scrap' order by e.published_at desc limit 1`,
        )
      ).rows[0].sale_price,
      '50100.00',
    );
  } finally {
    await db.close();
  }
});
