-- Consent-gated WhatsApp utility notifications. Existing OTP template is untouched.
begin;
alter table identity.profiles add column if not exists whatsapp_updates_opt_in_at timestamptz;
create table platform.whatsapp_jobs (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null unique references platform.notifications(id),
 user_id uuid not null references identity.profiles(id),template_code text not null check(template_code in ('fti_order_status_v1','fti_support_reply_v1')),
 parameters jsonb not null check(jsonb_typeof(parameters)='array'),
 status text not null default 'pending' check(status in ('pending','claimed','sent','failed','manual_review')),
 attempts integer not null default 0 check(attempts>=0),next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz,provider_message_id text,last_error text,created_at timestamptz not null default now(),sent_at timestamptz
);
create index idx_whatsapp_ready on platform.whatsapp_jobs(next_attempt_at,created_at,id) where status='pending';
create index idx_whatsapp_attention on platform.whatsapp_jobs(created_at desc,id) where status in ('failed','manual_review');
alter table platform.whatsapp_jobs enable row level security;
revoke all on platform.whatsapp_jobs from public,anon,authenticated;

create function internal.operations_whatsapp_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare template text; params jsonb; ref text; status_text text;
begin
 if new.channel<>'in_app' or new.template_code not in ('operations','transactional') or
  not exists(select 1 from identity.profiles p where p.id=new.user_id and p.whatsapp_updates_opt_in_at is not null) then return new; end if;
 if new.template_code='operations' and new.payload->>'title'='New support reply' then
  template:='fti_support_reply_v1';params:=jsonb_build_array(left(new.payload->>'entity_id',8));
 elsif new.template_code='operations' and new.payload->>'title' like 'Order %' and
       (new.payload->>'title' like '% dispatched' or new.payload->>'title' like '% delivered') then
  select order_no,status into ref,status_text from commerce.orders where id=(new.payload->>'entity_id')::uuid;
  template:='fti_order_status_v1';params:=jsonb_build_array(ref,status_text);
 elsif new.event_id is not null then
  select o.order_no,
    case e.event_type when 'commerce.order.created' then 'created'
     when 'commerce.payment.verified' then 'confirmed'
     when 'commerce.payment.rejected' then 'payment needs attention'
     when 'commerce.order.expired' then 'reservation expired' end
  into ref,status_text from platform.outbox_events e
   left join commerce.orders o on o.id=case when e.aggregate_type='order' then e.aggregate_id else (e.payload->>'order_id')::uuid end
   where e.id=new.event_id and e.event_type in ('commerce.order.created','commerce.payment.verified','commerce.payment.rejected','commerce.order.expired');
  if ref is not null then template:='fti_order_status_v1';params:=jsonb_build_array(ref,status_text); end if;
 end if;
 if template is not null then
  insert into platform.whatsapp_jobs(notification_id,user_id,template_code,parameters)
  values(new.id,new.user_id,template,params) on conflict(notification_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function internal.operations_whatsapp_enqueue() from public,anon,authenticated;
create trigger operations_whatsapp_on_notice after insert on platform.notifications
 for each row execute function internal.operations_whatsapp_enqueue();

create function public.fti_operations_whatsapp_preferences() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',whatsapp_updates_opt_in_at is not null) from identity.profiles where id=internal.identity_actor()
$$;
create function public.fti_operations_whatsapp_opt_in(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); phone_number text;
begin
 if p_enabled is null then raise exception 'Choose enabled or disabled' using errcode='22023'; end if;
 select phone into phone_number from identity.profiles where id=actor for update;
 if p_enabled and phone_number !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'A verified WhatsApp phone number is required' using errcode='22023'; end if;
 update identity.profiles set whatsapp_updates_opt_in_at=case when p_enabled then coalesce(whatsapp_updates_opt_in_at,now()) else null end where id=actor;
 if not p_enabled then update platform.whatsapp_jobs set status='failed',last_error='User withdrew WhatsApp consent'
  where user_id=actor and status in ('pending','claimed'); end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,case when p_enabled then 'whatsapp.opt_in' else 'whatsapp.opt_out' end,'profile',actor);
end $$;

create function public.fti_operations_whatsapp_claim(p_templates text[],p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update platform.whatsapp_jobs set status='manual_review',last_error='Claim expired; check provider before replay'
 where status='claimed' and claimed_at<now()-interval '15 minutes';
 with picked as (select j.id from platform.whatsapp_jobs j join identity.profiles p on p.id=j.user_id
  where j.status='pending' and j.next_attempt_at<=now() and j.template_code=any(p_templates)
   and p.whatsapp_updates_opt_in_at is not null
  order by j.next_attempt_at,j.created_at,j.id limit greatest(1,least(coalesce(p_limit,10),20)) for update of j skip locked),
 claimed as (update platform.whatsapp_jobs j set status='claimed',claimed_at=now(),attempts=attempts+1 from picked where j.id=picked.id
  returning j.id,j.template_code,j.parameters,j.user_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'template',c.template_code,'parameters',c.parameters,'phone',p.phone)),'[]') into result
 from claimed c join identity.profiles p on p.id=c.user_id;
 return result;
end $$;
create function public.fti_operations_whatsapp_can_send(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from platform.whatsapp_jobs j join identity.profiles p on p.id=j.user_id
  where j.id=p_id and j.status='claimed' and p.whatsapp_updates_opt_in_at is not null)
$$;
create function public.fti_operations_whatsapp_finish(p_id uuid,p_result text,p_provider_id text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare job platform.whatsapp_jobs;
begin
 select * into job from platform.whatsapp_jobs where id=p_id for update;
 if job.id is null or job.status<>'claimed' or p_result not in ('sent','retry','failed','manual_review') then
  raise exception 'Job state unavailable' using errcode='22023'; end if;
 if p_result='sent' and (p_provider_id is null or p_provider_id !~ '^wamid\.') then
  raise exception 'Provider message ID required' using errcode='22023'; end if;
 update platform.whatsapp_jobs set status=case when p_result='retry' and attempts>=5 then 'failed' when p_result='retry' then 'pending' else p_result end,
  next_attempt_at=case when p_result='retry' then now()+make_interval(mins=>least(60,power(2,least(attempts,5))::integer)) else next_attempt_at end,
  provider_message_id=case when p_result='sent' then p_provider_id else null end,
  sent_at=case when p_result='sent' then now() else null end,last_error=case when p_result='sent' then null else left(coalesce(p_error,p_result),200) end
  where id=p_id;
end $$;
create function public.fti_operations_whatsapp_attention(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('operations.manage');
 select coalesce(jsonb_agg(to_jsonb(j)),'[]') into result from
 (select id,template_code,status,attempts,last_error,created_at from platform.whatsapp_jobs where status in ('failed','manual_review')
  order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) j;
 return result;
end $$;
create function public.fti_operations_whatsapp_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('operations.manage');
begin
 update platform.whatsapp_jobs j set status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,last_error=null
 where j.id=p_id and j.status in ('failed','manual_review') and exists
 (select 1 from identity.profiles p where p.id=j.user_id and p.whatsapp_updates_opt_in_at is not null);
 if not found then raise exception 'Job unavailable or consent withdrawn' using errcode='42501'; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'whatsapp.replayed','whatsapp_job',p_id);
end $$;
revoke all on function public.fti_operations_whatsapp_preferences(),public.fti_operations_whatsapp_opt_in(boolean),
 public.fti_operations_whatsapp_claim(text[],integer),public.fti_operations_whatsapp_can_send(uuid),public.fti_operations_whatsapp_finish(uuid,text,text,text),
 public.fti_operations_whatsapp_attention(integer),public.fti_operations_whatsapp_replay(uuid) from public,anon,authenticated;
grant execute on function public.fti_operations_whatsapp_preferences(),public.fti_operations_whatsapp_opt_in(boolean),
 public.fti_operations_whatsapp_attention(integer),public.fti_operations_whatsapp_replay(uuid) to authenticated;
grant execute on function public.fti_operations_whatsapp_claim(text[],integer),public.fti_operations_whatsapp_can_send(uuid),public.fti_operations_whatsapp_finish(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
