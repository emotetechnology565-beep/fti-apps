-- Read-only checks. Run in the FTI Supabase SQL Editor.
select template,status,count(*) as messages,min(created_at) as oldest_job
from sales.raw_material_jobs group by template,status order by template,status;

-- This second check requires pg_cron, used by the existing notification schedule.
select jobid,jobname,schedule,active from cron.job
where jobname='fti-operations-whatsapp' or command like '%operations-whatsapp%';

-- A pending job with attempts=0 has not been picked up by the worker.
-- "sent" means provider acceptance; handset delivery is a separate event.
select id,template,status,attempts,created_at,next_attempt_at,claimed_at,
       last_error,provider_message_id is not null as accepted_by_provider
from sales.raw_material_jobs
order by created_at desc limit 12;

-- Cron success only proves that the HTTP request was scheduled.
select j.jobname,r.status,r.return_message,r.start_time,r.end_time
from cron.job_run_details r join cron.job j on j.jobid=r.jobid
where j.jobname='fti-operations-whatsapp' or j.command like '%operations-whatsapp%'
order by r.start_time desc limit 6;
