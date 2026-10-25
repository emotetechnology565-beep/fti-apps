-- Read-only hosted checks, after applying both migrations.
select extversion from pg_extension where extname='pgmq';
select * from pgmq.metrics('fti_raw_material_buyer');
select * from pgmq.metrics('fti_raw_material_staff');
select template,status,count(*) from sales.raw_material_jobs group by template,status order by template,status;
select count(*) as pending_without_queue from sales.raw_material_jobs where status='pending' and queue_message_id is null;
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fti_catalog_manual_preview','fti_catalog_manual_request_submit','fti_raw_material_claim','fti_raw_material_finish');
