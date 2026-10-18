-- Run in the FTI Supabase SQL Editor after 03_outbox.sql. Enable Supabase Cron first.
-- This schedules transactional in-app notification projection once per minute.
select cron.schedule('fti-operations-outbox','* * * * *','select public.fti_operations_process_outbox(50)');
-- Verify: select jobid,jobname,schedule from cron.job where jobname='fti-operations-outbox';
-- Stop: select cron.unschedule('fti-operations-outbox');
