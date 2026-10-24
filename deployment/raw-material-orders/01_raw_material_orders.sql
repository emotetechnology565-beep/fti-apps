begin;
create table if not exists sales.raw_material_recipients (
 phone text primary key check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 label text not null check(length(label) between 1 and 80),
 enabled boolean not null default true,
 configured_by uuid not null references identity.profiles(id),
 updated_at timestamptz not null default now()
);
create table if not exists sales.raw_material_requests (
 id uuid primary key, buyer_id uuid not null references identity.profiles(id),
 variant_id uuid not null references catalog.product_variants(id),
 size_mm integer not null check(size_mm>0), quantity numeric(18,3) not null check(quantity>0),
 details jsonb not null, created_at timestamptz not null default now()
);
create index if not exists raw_material_buyer on sales.raw_material_requests(buyer_id,created_at desc);
create table if not exists sales.raw_material_jobs (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references sales.raw_material_requests(id),
 phone text not null, template text not null check(template in ('fti_raw_material_received_v1','fti_raw_material_admin_v1')),
 parameters jsonb not null, status text not null default 'pending' check(status in ('pending','claimed','sent','failed','manual_review')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), claimed_at timestamptz,
 provider_message_id text, last_error text, created_at timestamptz not null default now(),
 unique(request_id,phone,template)
);
create index if not exists raw_material_jobs_ready on sales.raw_material_jobs(next_attempt_at,created_at) where status='pending';
alter table sales.raw_material_recipients enable row level security;
alter table sales.raw_material_requests enable row level security;
alter table sales.raw_material_jobs enable row level security;
revoke all on sales.raw_material_recipients,sales.raw_material_requests,sales.raw_material_jobs from public,anon,authenticated;

create or replace function public.fti_catalog_raw_recipients() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r)-'configured_by' order by r.label,r.phone) from sales.raw_material_recipients r),'[]');
end $$;
create or replace function public.fti_catalog_raw_recipient_save(p_phone text,p_label text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage'); recipient_phone text;
begin
 recipient_phone := regexp_replace(trim(p_phone),'[\s()-]','','g');
 if recipient_phone is null or recipient_phone !~ '^\+[1-9][0-9]{7,14}$' or length(trim(coalesce(p_label,''))) not between 1 and 80 or p_enabled is null then
  raise exception 'Enter a label and international phone number including +country code' using errcode='22023'; end if;
 insert into sales.raw_material_recipients(phone,label,enabled,configured_by) values(recipient_phone,trim(p_label),p_enabled,actor)
 on conflict(phone) do update set label=excluded.label,enabled=excluded.enabled,configured_by=actor,updated_at=now();
 insert into platform.audit_logs(actor_id,action,resource_type,after_data) values(actor,'raw_material.recipient.save','raw_material_recipient',jsonb_build_object('phone',recipient_phone,'enabled',p_enabled));
end $$;
create or replace function public.fti_catalog_raw_recipient_remove(p_phone text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage');
begin
 delete from sales.raw_material_recipients where phone=p_phone;
 insert into platform.audit_logs(actor_id,action,resource_type,after_data) values(actor,'raw_material.recipient.remove','raw_material_recipient',jsonb_build_object('phone',p_phone));
end $$;

create or replace function public.fti_catalog_raw_order_submit(p_id uuid,p_variant uuid,p_size integer,p_quantity text,p_buyer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); v record; phone text; nm text; company text; location text;
 old sales.raw_material_requests; details jsonb; ref text; recipient record; attrs jsonb;
begin
 if p_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from sales.raw_material_requests where id=p_id;
 if found then
  if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
  if old.variant_id is distinct from p_variant or old.size_mm is distinct from p_size or old.quantity::text is distinct from
   (case when coalesce(p_quantity,'') ~ '^\d{1,12}(\.\d{1,3})?$' then p_quantity::numeric(18,3)::text else null end)
   or old.details->>'name' is distinct from trim(p_buyer->>'name') or old.details->>'business' is distinct from trim(p_buyer->>'business')
   or old.details->>'location' is distinct from trim(p_buyer->>'location') then
   raise exception 'This request ID was already used for different details' using errcode='22023'; end if;
  return jsonb_build_object('id',old.id,'reference',old.details->>'reference','replayed',true);
 end if;
 select '+' || regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
 if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering' using errcode='22023'; end if;
 nm:=trim(coalesce(p_buyer->>'name','')); company:=trim(coalesce(p_buyer->>'business','')); location:=trim(coalesce(p_buyer->>'location',''));
 if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
 or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
  raise exception 'Enter buyer name, business and delivery location, and agree to WhatsApp order updates' using errcode='22023'; end if;
 if coalesce(p_quantity,'') !~ '^\d{1,12}(\.\d{1,3})?$' then raise exception 'Enter a valid quantity with up to 3 decimal places' using errcode='22023'; end if;
 select pv.*,p.name as product_name,c.name as category_name into v from catalog.product_variants pv
 join catalog.products p on p.id=pv.product_id join catalog.categories c on c.id=p.category_id
 where pv.id=p_variant and pv.is_active and p.status='published' and p.product_kind='steel' and c.is_active for share of pv,p,c;
 if not found then raise exception 'This raw material is no longer available' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(attribute_key,value_json),'{}') into attrs from catalog.variant_attributes where variant_id=p_variant;
 if p_size is null or p_size<=0 or not internal.catalog_size_matches(v.diameter_mm,coalesce(attrs->>'size_group',v.size_label),p_size)
 or nullif(trim(attrs->>'grade'),'') is null then raise exception 'Choose an available size and grade' using errcode='22023'; end if;
 if p_quantity::numeric<=0 or p_quantity::numeric<v.min_order_qty then raise exception 'Quantity is below the minimum order' using errcode='22023'; end if;
 if (select count(*) from sales.raw_material_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then
  raise exception 'Too many requests. Please try again later' using errcode='22023'; end if;
 ref:='FTI-RM-'||upper(replace(p_id::text,'-',''));
 details:=jsonb_build_object('reference',ref,'material',left(v.product_name,100),'category',v.category_name,'size',p_size||' mm',
  'grade',left(attrs->>'grade',100),'quantity',p_quantity::numeric::text||' '||v.uom,'name',nm,'business',company,'phone',phone,'location',location);
 insert into sales.raw_material_requests(id,buyer_id,variant_id,size_mm,quantity,details) values(p_id,actor,p_variant,p_size,p_quantity::numeric,details);
 insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_raw_material_received_v1',
  jsonb_build_array(nm,ref,details->>'material',details->>'size',details->>'grade',details->>'quantity'));
 for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
  insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_raw_material_admin_v1',
   jsonb_build_array(ref,details->>'material',details->>'size',details->>'grade',details->>'quantity',nm,company,phone,location));
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'raw_material.submitted','raw_material_request',p_id);
 return jsonb_build_object('id',p_id,'reference',ref,'replayed',false);
end $$;

create or replace function public.fti_catalog_raw_orders(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select q.*, (select jsonb_agg(jsonb_build_object('id',j.id,'phone',j.phone,'template',j.template,'status',j.status,'error',j.last_error))
   from sales.raw_material_jobs j where j.request_id=q.id) as deliveries
  from sales.raw_material_requests q order by created_at desc,id limit 25 offset greatest(0,p_offset)) r),'[]');
end $$;

create or replace function public.fti_raw_material_can_send(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from sales.raw_material_jobs j join sales.raw_material_requests q on q.id=j.request_id
 join identity.profiles buyer on buyer.id=q.buyer_id and buyer.account_status='active'
 where j.id=p_id and j.status='claimed' and (
  (j.template='fti_raw_material_received_v1' and exists(select 1 from auth.users u where u.id=q.buyer_id and u.phone_confirmed_at is not null
   and '+'||regexp_replace(u.phone,'^\+','')=j.phone)) or
  (j.template='fti_raw_material_admin_v1' and exists(select 1 from sales.raw_material_recipients r
   join identity.profiles p on p.id=r.configured_by and p.account_status='active'
   where r.phone=j.phone and r.enabled and exists(select 1 from identity.user_roles ur join identity.role_permissions rp on rp.role_code=ur.role_code
    where ur.user_id=r.configured_by and rp.permission='order.manage')))))
$$;
create or replace function public.fti_raw_material_claim(p_templates text[],p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update sales.raw_material_jobs set status='manual_review',last_error='Claim expired; verify delivery before replay' where status='claimed' and claimed_at<now()-interval '15 minutes';
 with picked as (select id from sales.raw_material_jobs where status='pending' and next_attempt_at<=now() and template=any(p_templates)
  order by next_attempt_at,created_at,id limit greatest(1,least(p_limit,20)) for update skip locked),
 claimed as (update sales.raw_material_jobs j set status='claimed',claimed_at=now(),attempts=attempts+1 from picked where j.id=picked.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'template',template,'phone',phone,'parameters',parameters)),'[]') into result from claimed;
 return result;
end $$;
create or replace function public.fti_raw_material_finish(p_id uuid,p_result text,p_provider_id text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_result is null or p_result not in ('sent','retry','failed','manual_review') or (p_result='sent' and coalesce(p_provider_id,'') !~ '^wamid\.') then
  raise exception 'Invalid delivery result' using errcode='22023'; end if;
 update sales.raw_material_jobs set status=case when p_result='retry' and attempts<5 then 'pending' when p_result='retry' then 'failed' else p_result end,
 next_attempt_at=now()+make_interval(mins=>least(60,power(2,least(attempts,5))::integer)),
 provider_message_id=p_provider_id,last_error=left(p_error,200) where id=p_id and status='claimed';
 if not found then raise exception 'Job state unavailable' using errcode='22023'; end if;
end $$;
create or replace function public.fti_catalog_raw_delivery_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage');
begin
 update sales.raw_material_jobs set status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,last_error=null
 where id=p_id and status in ('failed','manual_review');
 if not found then raise exception 'Delivery is not available for replay' using errcode='22023'; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'raw_material.delivery.replay','raw_material_job',p_id);
end $$;
revoke all on function public.fti_catalog_raw_recipients(),public.fti_catalog_raw_recipient_save(text,text,boolean),public.fti_catalog_raw_recipient_remove(text),
 public.fti_catalog_raw_order_submit(uuid,uuid,integer,text,jsonb),public.fti_catalog_raw_orders(integer),public.fti_catalog_raw_delivery_replay(uuid),
 public.fti_raw_material_can_send(uuid),public.fti_raw_material_claim(text[],integer),public.fti_raw_material_finish(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fti_catalog_raw_recipients(),public.fti_catalog_raw_recipient_save(text,text,boolean),public.fti_catalog_raw_recipient_remove(text),
 public.fti_catalog_raw_order_submit(uuid,uuid,integer,text,jsonb),public.fti_catalog_raw_orders(integer),public.fti_catalog_raw_delivery_replay(uuid) to authenticated;
grant execute on function public.fti_raw_material_can_send(uuid),public.fti_raw_material_claim(text[],integer),public.fti_raw_material_finish(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
