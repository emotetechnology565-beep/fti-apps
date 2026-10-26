import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fastenerPrice} from '../src/features/drawings/model/price';
test('Prices separate bolt and nut weights and round only the final amount',()=>{
 assert.equal(fastenerPrice(2,0,105,110),210);
 assert.equal(fastenerPrice(0,2,105,110),220);
 assert.equal(fastenerPrice(2,0.5,135,140),340);
 assert.equal(fastenerPrice(0.00812,0,125,125),1.02);
 assert.equal(fastenerPrice(-1,2,105,110),null);
 assert.equal(fastenerPrice(NaN,2,105,110),null);
});
test('Grade rates seed safely, enforce permissions and reject stale saves',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create schema internal;
 create function internal.identity_staff(text) returns uuid language plpgsql as $$ begin
 if current_setting('test.staff',true) is distinct from 'yes' then raise exception 'Permission denied'; end if;
 return '00000000-0000-0000-0000-000000000001'::uuid; end $$;`);
 const sql=readFileSync('supabase/migrations/202610260010_fastener_grade_rates.sql','utf8');
 await db.exec(sql);
 await db.exec('set role anon');
 assert.equal((await db.query('select * from public.fastener_grade_rates')).rows.length,4);
 await assert.rejects(db.exec("update public.fastener_grade_rates set bolt_rate=1"),/permission denied/);
 await assert.rejects(db.exec("select public.fti_fastener_grade_save('MS',1,1,1)"),/permission denied/);
 await db.exec('reset role; set role authenticated');
 await assert.rejects(db.exec("select public.fti_fastener_grade_save('MS',106,111,1)"),/Permission denied/);
 await db.exec("set test.staff='yes'");
 await db.exec("select public.fti_fastener_grade_save('MS',106,111,1)");
 await assert.rejects(db.exec("select public.fti_fastener_grade_save('MS',107,112,1)"),/Rates changed/);
 await assert.rejects(db.exec("select public.fti_fastener_grade_save('MS',0,111,2)"),/positive rates/);
 await db.exec('reset role');
 await db.exec(sql);
 const row=(await db.query("select bolt_rate,nut_rate,revision from public.fastener_grade_rates where grade='MS'")).rows[0];
 assert.deepEqual(row,{bolt_rate:'106.00',nut_rate:'111.00',revision:2});
 }finally{await db.close();}
});
