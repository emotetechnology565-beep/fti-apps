-- Supabase Queues delivers job IDs; private job rows retain recipient and delivery history.
begin;
create extension if not exists pgmq;
select pgmq.create('fti_raw_material_buyer');
select pgmq.create('fti_raw_material_staff');
revoke all on table pgmq.q_fti_raw_material_buyer,pgmq.a_fti_raw_material_buyer,
  pgmq.q_fti_raw_material_staff,pgmq.a_fti_raw_material_staff from public,anon,authenticated;
alter table pgmq.q_fti_raw_material_buyer enable row level security;
alter table pgmq.a_fti_raw_material_buyer enable row level security;
alter table pgmq.q_fti_raw_material_staff enable row level security;
alter table pgmq.a_fti_raw_material_staff enable row level security;
alter table sales.raw_material_jobs add column if not exists queue_message_id bigint;

create or replace function internal.raw_material_queue_name(p_template text) returns text
language sql immutable set search_path='' as $$
  select case p_template when 'fti_raw_material_received_v1' then 'fti_raw_material_buyer'
    when 'fti_raw_material_admin_v1' then 'fti_raw_material_staff' end
$$;
create or replace function internal.raw_material_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Insert, rollout backfill, or staff-authorized replay. A retry reuses its message.
  if new.status='pending' and (new.queue_message_id is null or (tg_op='UPDATE' and old.status in ('failed','manual_review'))) then
    if new.queue_message_id is not null then
      perform pgmq.archive(internal.raw_material_queue_name(new.template),new.queue_message_id);
    end if;
    select * into new.queue_message_id from pgmq.send(internal.raw_material_queue_name(new.template),jsonb_build_object('job_id',new.id),
      greatest(0,ceil(extract(epoch from new.next_attempt_at-now()))::integer));
  end if;
  return new;
end $$;
drop trigger if exists raw_material_enqueue on sales.raw_material_jobs;
create trigger raw_material_enqueue before insert or update on sales.raw_material_jobs for each row execute function internal.raw_material_enqueue();
update sales.raw_material_jobs set queue_message_id=null where status='pending' and queue_message_id is null;

create or replace function public.fti_raw_material_claim(p_templates text[],p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare template_name text; queue_name text; msg record; job sales.raw_material_jobs;
  result jsonb:='[]'; remaining integer:=greatest(1,least(coalesce(p_limit,10),20));
begin
  -- A worker may have sent before losing its connection. Do not automatically resend.
  update sales.raw_material_jobs set status='manual_review',last_error='Claim expired; verify delivery before replay'
    where status='claimed' and claimed_at<now()-interval '15 minutes';
  for template_name in select distinct t from unnest(p_templates) t
    where t in ('fti_raw_material_received_v1','fti_raw_material_admin_v1') order by t loop
    queue_name:=internal.raw_material_queue_name(template_name);
    for msg in select * from pgmq.read(queue_name,900,remaining) loop
      select * into job from sales.raw_material_jobs where id=(msg.message->>'job_id')::uuid for update;
      if not found or job.queue_message_id is distinct from msg.msg_id or job.template<>template_name or job.status in ('sent','failed','manual_review') then
        perform pgmq.archive(queue_name,msg.msg_id);
        continue;
      end if;
      if job.status<>'pending' then continue; end if;
      if job.next_attempt_at>now() then
        perform pgmq.set_vt(queue_name,msg.msg_id,greatest(1,ceil(extract(epoch from job.next_attempt_at-now()))::integer));
        continue;
      end if;
      update sales.raw_material_jobs set status='claimed',claimed_at=now(),attempts=attempts+1 where id=job.id;
      result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'template',job.template,'phone',job.phone,'parameters',job.parameters));
      remaining:=remaining-1;
    end loop;
    exit when remaining<=0;
  end loop;
  return result;
end $$;

create or replace function public.fti_raw_material_finish(p_id uuid,p_result text,p_provider_id text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare job sales.raw_material_jobs;
begin
  if p_result is null or p_result not in ('sent','retry','failed','manual_review') or (p_result='sent' and coalesce(p_provider_id,'') !~ '^wamid\.') then
    raise exception 'Invalid delivery result' using errcode='22023';
  end if;
  update sales.raw_material_jobs set status=case when p_result='retry' and attempts<5 then 'pending' when p_result='retry' then 'failed' else p_result end,
    next_attempt_at=now()+make_interval(mins=>least(60,power(2,least(attempts,5))::integer)),provider_message_id=p_provider_id,last_error=left(p_error,200)
    where id=p_id and status='claimed' returning * into job;
  if not found then raise exception 'Job state unavailable' using errcode='22023'; end if;
  if job.queue_message_id is not null then
    if job.status='pending' then
      perform pgmq.set_vt(internal.raw_material_queue_name(job.template),job.queue_message_id,
        greatest(1,ceil(extract(epoch from job.next_attempt_at-now()))::integer));
    else
      perform pgmq.archive(internal.raw_material_queue_name(job.template),job.queue_message_id);
    end if;
  end if;
end $$;
revoke all on function internal.raw_material_queue_name(text),internal.raw_material_enqueue() from public,anon,authenticated;
-- Replacements retain the existing service-role-only grants and worker RPC contract.
revoke all on function public.fti_raw_material_claim(text[],integer),public.fti_raw_material_finish(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fti_raw_material_claim(text[],integer),public.fti_raw_material_finish(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
