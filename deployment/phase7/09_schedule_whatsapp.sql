-- Configure the named secrets in Supabase Vault first; do not paste values into this file.
-- Requires pg_cron and pg_net enabled in the FTI project.
select cron.schedule('fti-operations-whatsapp','*/5 * * * *',
 $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='fti_project_url') || '/functions/v1/operations-whatsapp',
  headers := jsonb_build_object('Content-Type','application/json','X-Worker-Secret',
   (select decrypted_secret from vault.decrypted_secrets where name='fti_operations_worker_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
 );
 $job$);
-- Stop: select cron.unschedule('fti-operations-whatsapp');
