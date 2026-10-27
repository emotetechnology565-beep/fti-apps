begin;
create table if not exists sales.fastener_requests (
 id uuid primary key, buyer_id uuid not null references identity.profiles(id),
 definition_id uuid not null references catalog.drawing_definitions(id),
 selection jsonb not null, definition jsonb not null, details jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists fastener_requests_buyer on sales.fastener_requests(buyer_id,created_at desc);
create table if not exists sales.fastener_jobs (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references sales.fastener_requests(id),
 phone text not null, template text not null check(template in ('fti_fastener_received_v1','fti_fastener_admin_v1')),
 parameters jsonb not null, status text not null default 'pending' check(status in ('pending','claimed','sent','failed','manual_review')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), claimed_at timestamptz,
 provider_message_id text, last_error text, created_at timestamptz not null default now(), unique(request_id,phone,template)
);
create index if not exists fastener_jobs_ready on sales.fastener_jobs(next_attempt_at,created_at) where status='pending';
alter table sales.fastener_requests enable row level security;
alter table sales.fastener_jobs enable row level security;
revoke all on sales.fastener_requests,sales.fastener_jobs from public,anon,authenticated;
create or replace function public.fti_fastener_can_send(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from sales.fastener_jobs j join sales.fastener_requests q on q.id=j.request_id
 join identity.profiles buyer on buyer.id=q.buyer_id and buyer.account_status='active'
 where j.id=p_id and j.status='claimed' and (
  (j.template='fti_fastener_received_v1' and exists(select 1 from auth.users u where u.id=q.buyer_id and u.phone_confirmed_at is not null
   and '+'||regexp_replace(u.phone,'^\+','')=j.phone)) or
  (j.template='fti_fastener_admin_v1' and exists(select 1 from sales.raw_material_recipients r
   join identity.profiles p on p.id=r.configured_by and p.account_status='active'
   where r.phone=j.phone and r.enabled and exists(select 1 from identity.user_roles ur join identity.role_permissions rp on rp.role_code=ur.role_code
    where ur.user_id=r.configured_by and rp.permission='order.manage')))))
$$;
create or replace function public.fti_fastener_claim(p_templates text[],p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update sales.fastener_jobs set status='manual_review',last_error='Claim expired; verify delivery before replay' where status='claimed' and claimed_at<now()-interval '15 minutes';
 with picked as (select id from sales.fastener_jobs where status='pending' and next_attempt_at<=now() and template=any(p_templates)
  order by next_attempt_at,created_at,id limit greatest(1,least(p_limit,20)) for update skip locked),
 claimed as (update sales.fastener_jobs j set status='claimed',claimed_at=now(),attempts=attempts+1 from picked where j.id=picked.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'template',template,'phone',phone,'parameters',parameters)),'[]') into result from claimed;
 return result;
end $$;
create or replace function public.fti_fastener_finish(p_id uuid,p_result text,p_provider_id text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_result is null or p_result not in ('sent','retry','failed','manual_review') or (p_result='sent' and coalesce(p_provider_id,'') !~ '^wamid\.') then
  raise exception 'Invalid delivery result' using errcode='22023'; end if;
 update sales.fastener_jobs set status=case when p_result='retry' and attempts<5 then 'pending' when p_result='retry' then 'failed' else p_result end,
 next_attempt_at=now()+make_interval(mins=>least(60,power(2,least(attempts,5))::integer)),
 provider_message_id=p_provider_id,last_error=left(p_error,200) where id=p_id and status='claimed';
 if not found then raise exception 'Job state unavailable' using errcode='22023'; end if;
end $$;
create or replace function public.fti_catalog_fastener_delivery_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage');
begin
 update sales.fastener_jobs set status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,last_error=null
 where id=p_id and status in ('failed','manual_review');
 if not found then raise exception 'Delivery is not available for replay' using errcode='22023'; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'fastener.delivery.replay','fastener_job',p_id);
end $$;

revoke all on function public.fti_fastener_can_send(uuid),public.fti_fastener_claim(text[],integer),public.fti_fastener_finish(uuid,text,text,text),public.fti_catalog_fastener_delivery_replay(uuid) from public,anon,authenticated;
grant execute on function public.fti_fastener_can_send(uuid),public.fti_fastener_claim(text[],integer),public.fti_fastener_finish(uuid,text,text,text) to service_role;
grant execute on function public.fti_catalog_fastener_delivery_replay(uuid) to authenticated;
create or replace function public.fti_catalog_fastener_order_submit(
 p_id uuid,p_definition uuid,p_revision integer,p_input jsonb,p_grade text,p_quantity integer,p_with_nut boolean,p_buyer jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); old sales.fastener_requests; def jsonb; sel jsonb; rates public.fastener_grade_rates;
 phone text; nm text; company text; location text; ref text; details jsonb; recipient record; k text; v jsonb; len numeric;
begin
 if p_id is null then raise exception 'Request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 nm:=trim(coalesce(p_buyer->>'name','')); company:=trim(coalesce(p_buyer->>'business','')); location:=trim(coalesce(p_buyer->>'location',''));
 if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
 or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then raise exception 'Enter buyer details and agree to WhatsApp updates'; end if;
 sel:=jsonb_build_object('definition_id',p_definition,'revision',p_revision,'input',p_input,'grade',p_grade,'quantity',p_quantity,'with_nut',p_with_nut);
 select * into old from sales.fastener_requests where id=p_id;
 if found then
  if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
  if old.selection is distinct from sel or old.details->>'name' is distinct from nm or old.details->>'business' is distinct from company or old.details->>'location' is distinct from location then raise exception 'Request ID already used for different details'; end if;
  return jsonb_build_object('reference',old.details->>'reference','replayed',true);
 end if;
 select '+'||regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
 if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering'; end if;
 select published_data into def from catalog.drawing_definitions where id=p_definition and published_revision=p_revision for share;
 if def is null then raise exception 'Dimensions changed or were withdrawn. Reload before ordering.'; end if;
 if p_quantity is null or p_quantity not between 1 and 1000000 or p_with_nut is null then raise exception 'Enter a valid quantity'; end if;
 if p_with_nut and def->>'shape' not in ('hex-bolt','hex-screw') then raise exception 'Combined supply is unavailable for this selection'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or not p_input ? 'length' then raise exception 'Drawing dimensions required'; end if;
 for k,v in select * from jsonb_each(p_input) loop
  if k not in ('length','width','pitch','radius','returnHeight','angle') or jsonb_typeof(v)<>'number' then raise exception 'Invalid drawing dimension'; end if;
  if (v#>>'{}')::numeric<=0 or (v#>>'{}')::numeric>10000 then raise exception 'Drawing dimension is outside permitted limits'; end if;
 end loop;
 len:=(p_input->>'length')::numeric;
 if jsonb_array_length(def->'dimensions'->'lengths')>0 and not (def->'dimensions'->'lengths') @> jsonb_build_array(len) then raise exception 'Choose a published length'; end if;
 if jsonb_array_length(def->'dimensions'->'widths')>0 and not (def->'dimensions'->'widths') @> jsonb_build_array((p_input->>'width')::numeric) then raise exception 'Choose a published width'; end if;
 if p_input ? 'pitch' and (p_input->>'pitch')::numeric>100 then raise exception 'Pitch must not exceed 100 mm'; end if;
 if def->'dimensions' ? 'pitch' and p_input ? 'pitch' and (p_input->>'pitch')::numeric is distinct from (def->'dimensions'->>'pitch')::numeric then raise exception 'Pitch must match the published definition'; end if;
 if def->>'shape'='j-i' and coalesce((p_input->>'angle')::numeric,25) not between 1 and 75 then raise exception 'Return angle must be between 1 and 75 degrees'; end if;
 if def->>'shape' in ('j-ii','u-round') and (not p_input ? 'radius' or len<=(p_input->>'radius')::numeric+(def->'dimensions'->>'diameter')::numeric) then raise exception 'Radius must leave a straight leg'; end if;
 if def->>'shape'='j-ii' and (not p_input ? 'returnHeight' or (p_input->>'returnHeight')::numeric<(p_input->>'radius')::numeric+(def->'dimensions'->>'diameter')::numeric or (p_input->>'returnHeight')::numeric>=len) then raise exception 'Invalid return height'; end if;
 if def->>'shape' in ('hex-nut','lock-nut') and len is distinct from (def->'dimensions'->>'head_height')::numeric then raise exception 'Nut thickness must match the selected definition'; end if;
 select * into rates from public.fastener_grade_rates where grade=p_grade for share;
 if not found then raise exception 'Choose an available grade'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
 if (select count(*) from sales.fastener_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many requests. Try again later'; end if;
 ref:='FTI-FN-'||upper(replace(p_id::text,'-',''));
 details:=jsonb_build_object('reference',ref,'material',def->>'shape','standard',(def->>'standard')||':'||(def->>'edition'),
  'size',def->>'size','length_mm',len,'grade',p_grade,'quantity',p_quantity||' pieces','supply',case when p_with_nut then 'With nut' else 'Single fastener' end,
  'name',nm,'business',company,'phone',phone,'location',location,'bolt_rate',rates.bolt_rate,'nut_rate',rates.nut_rate,'rate_revision',rates.revision,'whatsapp_consent',true);
 insert into sales.fastener_requests(id,buyer_id,definition_id,selection,definition,details) values(p_id,actor,p_definition,sel,def-'source'-'notes',details);
 insert into sales.fastener_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_fastener_received_v1',
  jsonb_build_array(ref,def->>'shape',details->>'standard',(def->>'size')||' / L '||len||' mm',p_grade,p_quantity||' pieces',details->>'supply',nm,company,phone,location));
 for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
  insert into sales.fastener_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_fastener_admin_v1',
   jsonb_build_array(ref,def->>'shape',details->>'standard',(def->>'size')||' / L '||len||' mm',p_grade,p_quantity||' pieces',details->>'supply',nm,company,phone,location));
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'fastener.submitted','fastener_request',p_id);
 return jsonb_build_object('reference',ref,'replayed',false);
end $$;
create or replace function public.fti_catalog_fastener_orders(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select q.*, (select jsonb_agg(jsonb_build_object('id',j.id,'phone',j.phone,'template',j.template,'status',j.status,'error',j.last_error)) from sales.fastener_jobs j where j.request_id=q.id) as deliveries
  from sales.fastener_requests q order by created_at desc,id limit 25 offset greatest(0,p_offset)) r),'[]');
end $$;
create or replace function public.fti_fastener_drawing_delivery(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('definition',q.definition,'input',q.selection->'input','reference',q.details->>'reference')
 from sales.fastener_jobs j join sales.fastener_requests q on q.id=j.request_id
 where j.id=p_id and public.fti_fastener_can_send(j.id)
$$;
revoke all on function public.fti_catalog_fastener_order_submit(uuid,uuid,integer,jsonb,text,integer,boolean,jsonb),public.fti_catalog_fastener_orders(integer),public.fti_fastener_drawing_delivery(uuid) from public,anon,authenticated;
grant execute on function public.fti_catalog_fastener_order_submit(uuid,uuid,integer,jsonb,text,integer,boolean,jsonb),public.fti_catalog_fastener_orders(integer) to authenticated;
grant execute on function public.fti_fastener_drawing_delivery(uuid) to service_role;
notify pgrst,'reload schema';
commit;

