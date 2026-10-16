import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readFileSync(
  'supabase/migrations/202610150001_phase2_identity.sql',
  'utf8',
).replace(/^\uFEFF/, '');
const ids = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
];
for (const baseline of [false, true])
  test(`identity security and onboarding (${baseline ? 'existing blueprint' : 'clean database'})`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated,anon;
 `);
      if (baseline)
        await db.exec(
          readFileSync(
            '../FTI_Implementation_Documentation_v2/14_PostgreSQL_Schema_Blueprint.sql',
            'utf8',
          ).replace('create extension if not exists pgcrypto;', ''),
        );
      await db.exec(migration);
      await db.exec(
        `insert into auth.users values ('${ids[0]}','+910000000001',now()),('${ids[1]}','+910000000002',now()),('${ids[2]}','+910000000003',now());`,
      );
      async function asUser(index: number, aal = 'aal1') {
        await db.exec('reset role');
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
          [ids[index], JSON.stringify({ aal })],
        );
        await db.exec('set role authenticated');
      }
      async function denied(sql: string) {
        await assert.rejects(db.exec(sql));
      }
      await db.exec('set role anon');
      await denied('select public.fti_identity_me()');
      await asUser(0);
      const empty = await db.query<{
        data: { businesses: unknown[]; permissions: string[] };
      }>('select public.fti_identity_me() as data');
      assert.deepEqual(empty.rows[0].data.businesses, []);
      assert.deepEqual(empty.rows[0].data.permissions, []);
      await denied(
        "insert into identity.user_roles values (auth.uid(),'super_admin')",
      );
      await denied("update identity.profiles set account_status='active'");
      await denied('select * from identity.businesses');
      await denied('select public.fti_review_queue()');
      await db.query('select public.fti_save_profile($1)', ['Test actor']);
      const address = {
        line1: 'Test address',
        city: 'Test city',
        state: 'Test state',
        pincode: '100001',
      };
      const application = {
        legal_name: 'Isolated test application',
        gstin: '',
        pan: '',
        customer_type: 'dealer',
        billing: address,
        shipping: address,
        consent: true,
      };
      const result = await db.query<{ id: string }>(
        'select public.fti_apply_business($1::jsonb) as id',
        [JSON.stringify(application)],
      );
      const id = result.rows[0].id;
      await assert.rejects(
        db.query('select public.fti_apply_business($1::jsonb)', [
          JSON.stringify(application),
        ]),
      );
      await asUser(1);
      const other = await db.query<{ data: { businesses: unknown[] } }>(
        'select public.fti_identity_me() as data',
      );
      assert.deepEqual(other.rows[0].data.businesses, []);
      await denied(
        `select public.fti_review_business('${id}',1,'verified','Unauthorized')`,
      );
      await db.exec('reset role');
      await db.exec(
        `insert into identity.user_roles values ('${ids[1]}','super_admin')`,
      );
      await asUser(1);
      await denied('select public.fti_review_queue()');
      await asUser(1, 'aal2');
      assert.equal(
        (
          await db.query<{ data: unknown[] }>(
            'select public.fti_review_queue() as data',
          )
        ).rows[0].data.length,
        1,
      );
      await db.query('select public.fti_review_business($1,1,$2,$3)', [
        id,
        'verified',
        'Verified in isolated test',
      ]);
      await denied(
        `select public.fti_review_business('${id}',1,'rejected','Replay')`,
      );
      await asUser(0);
      const mine = await db.query<{
        data: {
          businesses: { verification_status: string }[];
          permissions: string[];
        };
      }>('select public.fti_identity_me() as data');
      assert.equal(
        mine.rows[0].data.businesses[0].verification_status,
        'verified',
      );
      assert.deepEqual(mine.rows[0].data.permissions, []);
      await assert.rejects(
        db.query('select public.fti_apply_business($1::jsonb)', [
          JSON.stringify({ ...application, revision: 2 }),
        ]),
      );
      await db.exec(
        'select public.fti_request_account_deletion();select public.fti_request_account_deletion();',
      );
      await db.exec('reset role');
      assert.equal(
        (
          await db.query<{ n: number }>(
            'select count(*)::int n from identity.deletion_requests',
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            'select count(*)::int n from identity.review_events',
          )
        ).rows[0].n,
        1,
      );
      await db.exec(
        `update identity.profiles set account_status='blocked' where id='${ids[0]}'`,
      );
      await asUser(0);
      await denied('select public.fti_identity_me()');
      await denied("select public.fti_save_profile('Bypass')");
      await db.exec('reset role');
      await db.exec(
        `update auth.users set phone_confirmed_at=null where id='${ids[2]}'`,
      );
      await asUser(2);
      await denied('select public.fti_identity_me()');
    } finally {
      await db.close();
    }
  });
