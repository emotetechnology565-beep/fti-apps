-- Read-only checks. Run in the FTI Supabase SQL Editor.
select template,status,count(*) as messages,min(created_at) as oldest_job
from sales.raw_material_jobs group by template,status order by template,status;

-- This second check requires pg_cron, used by the existing notification schedule.
select jobid,jobname,schedule,active from cron.job
where jobname='fti-operations-whatsapp' or command like '%operations-whatsapp%';
