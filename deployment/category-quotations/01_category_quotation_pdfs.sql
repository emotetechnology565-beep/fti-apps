-- Admin-managed fastener quotation PDFs. No expiry; replacement affects new requests.
begin;
create table sales.category_quote_documents (
 category_id uuid primary key references catalog.categories(id),
 asset_id uuid not null unique references platform.media_assets(id),
 updated_at timestamptz not null default now()
);
create table sales.category_quote_requests (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references identity.profiles(id),
 category_id uuid not null references catalog.categories(id),
 asset_id uuid references platform.media_assets(id),
 rfq_id uuid references sales.rfqs(id),
 client_request_id uuid not null, notification_id uuid unique references platform.notifications(id),
 whatsapp_requested_at timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(buyer_id,client_request_id)
);
create index category_quote_waiting on sales.category_quote_requests(category_id,created_at,id) where asset_id is null;
create index category_quote_buyer on sales.category_quote_requests(buyer_id,created_at desc);
alter table sales.category_quote_documents enable row level security;
alter table sales.category_quote_requests enable row level security;
revoke all on sales.category_quote_documents,sales.category_quote_requests from public,anon,authenticated;
alter table platform.whatsapp_jobs drop constraint whatsapp_jobs_template_code_check;
alter table platform.whatsapp_jobs add constraint whatsapp_jobs_template_code_check check(template_code in (
 'fti_order_status_v1','fti_support_reply_v1','fti_request_received_v1','fti_admin_request_v1',
 'fti_request_approved_v1','fti_request_rejected_v1','fti_request_update_v1','fti_category_quotation_v1'));

create function internal.fastener_quote_category(p_category uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive ancestors as (
   select id,parent_id,slug from catalog.categories where id=p_category and is_active
   union select c.id,c.parent_id,c.slug from catalog.categories c join ancestors a on c.id=a.parent_id where c.is_active
 ) select exists(select 1 from ancestors where slug='fasteners') or exists(
   select 1 from catalog.categories c join catalog.products p on p.category_id=c.id
   where c.id=p_category and c.is_active and p.product_kind='fastener');
$$;

create function public.fti_sales_category_quote_catalog() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'asset_id',d.asset_id,'updated_at',d.updated_at)
   order by c.sort_order,c.name) from catalog.categories c left join sales.category_quote_documents d on d.category_id=c.id
   where c.is_active and internal.fastener_quote_category(c.id)),'[]'::jsonb);
end $$;

create function public.fti_sales_category_quote_prepare(p_category uuid,p_size_bytes bigint,p_sha256_hex text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('sales.manage'); asset uuid := gen_random_uuid(); object_path text;
begin
 if not internal.fastener_quote_category(p_category) or p_size_bytes is null or p_size_bytes not between 6 and 3145728
   or p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='Choose a fastener category and a PDF up to 3 MB.'; end if;
 -- Serialise uploads to avoid accumulating pending metadata from repeated clicks.
 perform 1 from catalog.categories where id=p_category for update;
 if (select count(*) from platform.media_assets where entity_type='category_quote' and entity_id=p_category
   and upload_status='pending' and created_at>now()-interval '10 minutes')>=5 then
   raise exception using errcode='22023',message='Several uploads are already pending. Try again shortly.'; end if;
 object_path:='category-quote-files/'||p_category::text||'/'||asset::text||'.pdf';
 insert into platform.media_assets(id,owner_user_id,entity_type,entity_id,object_key,mime_type,size_bytes,visibility,upload_status,sha256_hex)
 values(asset,actor,'category_quote',p_category,object_path,'application/pdf',p_size_bytes,'private','pending',p_sha256_hex);
 return jsonb_build_object('id',asset,'object_key',object_path);
end $$;

create function internal.queue_category_quote(p_request uuid,p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r sales.category_quote_requests; a platform.media_assets; notice uuid; category_name text;
begin
 select * into r from sales.category_quote_requests where id=p_request for update;
 if not found or r.notification_id is not null then return; end if;
 select * into a from platform.media_assets where id=p_asset and entity_type='category_quote'
   and entity_id=r.category_id and upload_status='verified' and visibility='private';
 if not found then raise exception using errcode='22023',message='Quotation PDF is unavailable.'; end if;
 select name into category_name from catalog.categories where id=r.category_id;
 insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at)
 values(r.buyer_id,'in_app','category_quotation',jsonb_build_object('title','Your '||category_name||' quotation PDF is ready',
   'request_type','category quotation','entity_id',r.id,'asset_id',a.id),'delivered',now()) returning id into notice;
 insert into platform.whatsapp_jobs(notification_id,user_id,template_code,parameters)
 values(notice,r.buyer_id,'fti_category_quotation_v1',jsonb_build_array(left(category_name,100),
   to_char(a.created_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI')||' IST','FTI-Q-'||upper(left(replace(r.id::text,'-',''),12))));
 update sales.category_quote_requests set asset_id=a.id,notification_id=notice where id=r.id;
end $$;

create function public.fti_sales_category_quote_complete(p_id uuid,p_status text,p_storage_zone text) returns void
language plpgsql security definer set search_path='' as $$
declare a platform.media_assets; waiting record;
begin
 select * into a from platform.media_assets where id=p_id and entity_type='category_quote' for update;
 if not found or a.upload_status<>'pending' or p_status is null or p_status not in ('verified','rejected')
   or (p_status='verified' and coalesce(p_storage_zone,'') !~ '^[a-z0-9-]{2,100}$') then
   raise exception using errcode='22023',message='Quotation upload cannot be completed.'; end if;
 perform 1 from catalog.categories where id=a.entity_id for update;
 update platform.media_assets set upload_status=p_status,storage_zone=case when p_status='verified' then p_storage_zone end where id=a.id;
 if p_status='verified' then
   insert into sales.category_quote_documents(category_id,asset_id) values(a.entity_id,a.id)
   on conflict(category_id) do update set asset_id=excluded.asset_id,updated_at=now();
   for waiting in select id from sales.category_quote_requests where category_id=a.entity_id and asset_id is null order by created_at,id for update loop
     perform internal.queue_category_quote(waiting.id,a.id);
   end loop;
 end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(a.owner_user_id,'sales.category_quote.'||p_status,'media_asset',a.id,jsonb_build_object('category_id',a.entity_id));
end $$;

create function public.fti_sales_category_quote_request(p_request_id uuid,p_category uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); r sales.category_quote_requests; doc uuid;
begin
 if p_request_id is null or p_category is null then raise exception using errcode='22023',message='Choose a category.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select * into r from sales.category_quote_requests where buyer_id=actor and client_request_id=p_request_id;
 if found then
   if r.category_id<>p_category then raise exception using errcode='23505',message='Request ID belongs to a different category.'; end if;
   return jsonb_build_object('id',r.id,'queued',r.asset_id is not null,'replayed',true); end if;
 if not internal.fastener_quote_category(p_category) then raise exception using errcode='22023',message='Choose an active fastener category.'; end if;
 -- The same category lock serialises requests with PDF replacement/completion.
 perform 1 from catalog.categories where id=p_category for update;
 if (select count(*) from sales.category_quote_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then
   raise exception using errcode='22023',message='Please wait before requesting more quotation PDFs.'; end if;
 insert into sales.category_quote_requests(buyer_id,category_id,client_request_id)
 values(actor,p_category,p_request_id) returning * into r;
 select asset_id into doc from sales.category_quote_documents where category_id=p_category;
 if doc is not null then perform internal.queue_category_quote(r.id,doc); end if;
 perform internal.request_staff('staff.access',null,'category quotation',r.id);
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'sales.category_quote.request','category_quote_request',r.id,jsonb_build_object('category_id',p_category,'whatsapp_requested',true));
 return jsonb_build_object('id',r.id,'queued',doc is not null,'replayed',false);
end $$;

create function public.fti_sales_category_quote_requests(p_staff boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor();
begin
 if p_staff then perform internal.identity_staff('sales.manage'); end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
   select r.id,c.name as category,r.asset_id,r.created_at,
     case when p_staff then p.phone else null end as buyer_phone,
     coalesce(j.status,'awaiting_pdf') as delivery_status
   from sales.category_quote_requests r join catalog.categories c on c.id=r.category_id
   join identity.profiles p on p.id=r.buyer_id left join platform.whatsapp_jobs j on j.notification_id=r.notification_id
   where p_staff or r.buyer_id=actor order by r.created_at desc,r.id desc limit 100
 ) q),'[]'::jsonb);
end $$;

create function public.fti_sales_category_quote_access(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); a platform.media_assets;
begin
 select * into a from platform.media_assets where id=p_id and entity_type='category_quote' and visibility='private' and upload_status='verified';
 if not found then raise exception using errcode='P0002',message='Quotation PDF not found.'; end if;
 if not exists(select 1 from sales.category_quote_requests where buyer_id=actor and asset_id=a.id) then
   perform internal.identity_staff('sales.manage'); end if;
 return jsonb_build_object('object_key',a.object_key,'size_bytes',a.size_bytes,'mime_type',a.mime_type,'storage_zone',a.storage_zone,'sha256_hex',a.sha256_hex);
end $$;

-- Keep the existing multi-item RFQ workflow; send one PDF per fastener category.
-- The updated app explicitly offers these requested transactional WhatsApp PDFs.
create function public.fti_sales_submit_with_pdfs(p_request_id uuid,p_business uuid,p_address uuid,p_notes text,p_items jsonb,p_send_category_pdfs boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); result jsonb; category uuid; request uuid; doc uuid; added integer := 0;
begin
 result:=public.fti_sales_submit(p_request_id,p_business,p_address,p_notes,p_items);
 if p_send_category_pdfs is true then
   for category in select distinct p.category_id from sales.rfq_items i
     join catalog.product_variants v on v.id=i.variant_id join catalog.products p on p.id=v.product_id
     where i.rfq_id=(result->>'id')::uuid and p.product_kind='fastener' order by p.category_id loop
     perform 1 from catalog.categories where id=category for update;
     if not internal.fastener_quote_category(category) then continue; end if;
     request:=null;
     insert into sales.category_quote_requests(buyer_id,category_id,rfq_id,client_request_id)
     values(actor,category,(result->>'id')::uuid,md5((result->>'id')||category::text)::uuid)
     on conflict(buyer_id,client_request_id) do nothing returning id into request;
     if request is not null then
       added:=added+1;
       select asset_id into doc from sales.category_quote_documents where category_id=category;
       if doc is not null then perform internal.queue_category_quote(request,doc); end if;
     end if;
   end loop;
 end if;
 return result||jsonb_build_object('pdf_requests_queued',added);
end $$;

-- A normal RFQ also informs every active staff member once. Per-category PDF
-- jobs do not create additional staff alerts for that same multi-item RFQ.
create or replace function internal.request_outbox_staff() returns trigger
language plpgsql security definer set search_path='' as $$
declare applicant uuid; permission text; kind text;
begin
 case new.event_type
  when 'sales.rfq.submitted' then
   select buyer_id into applicant from sales.rfqs where id=new.aggregate_id;
   permission:='staff.access';kind:='quotation';
  when 'sales.quote.revision_requested' then
   select r.buyer_id into applicant from sales.quotations q join sales.rfqs r on r.id=q.rfq_id where q.id=new.aggregate_id;
   permission:='sales.manage';kind:='quotation revision';
  when 'sales.quote.accepted' then
   select r.buyer_id into applicant from sales.quotations q join sales.rfqs r on r.id=q.rfq_id where q.id=new.aggregate_id;
   permission:='sales.manage';kind:='quotation acceptance';
  when 'commerce.order.created' then
   -- Older deployments may not yet have the immediate all-staff order trigger.
   if to_regprocedure('internal.order_all_staff_notice()') is not null then return new; end if;
   select buyer_id into applicant from commerce.orders where id=new.aggregate_id;
   permission:='staff.access';kind:='order';
  when 'commerce.payment.review_requested' then
   select o.buyer_id into applicant from commerce.payments p join commerce.orders o on o.id=p.order_id where p.id=new.aggregate_id;
   permission:='payment.review';kind:='payment review';
  else return new;
 end case;
 if applicant is not null then perform internal.request_staff(permission,case when permission='staff.access' then null else applicant end,kind,new.aggregate_id); end if;
 return new;
end $$;

-- One explicit PDF request grants permission for that transactional message only.
-- It does not subscribe the buyer to other WhatsApp updates.
create or replace function public.fti_operations_whatsapp_can_send(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from platform.whatsapp_jobs j join identity.profiles p on p.id=j.user_id
  join platform.notifications n on n.id=j.notification_id
  where j.id=p_id and j.status='claimed' and p.account_status='active' and p.phone ~ '^\+[1-9][0-9]{7,14}$'
  and (case when j.template_code='fti_category_quotation_v1' then exists(
    select 1 from sales.category_quote_requests r where r.notification_id=n.id and r.buyer_id=p.id and r.asset_id is not null)
    else p.whatsapp_updates_opt_in_at is not null end)
  and (j.template_code<>'fti_admin_request_v1' or (
    exists(select 1 from identity.user_roles r join identity.role_permissions rp on rp.role_code=r.role_code where r.user_id=p.id and rp.permission=n.payload->>'request_permission')
    and exists(select 1 from identity.user_roles r join identity.role_permissions rp on rp.role_code=r.role_code where r.user_id=p.id and rp.permission='staff.access'))));
$$;

create or replace function public.fti_operations_whatsapp_claim(p_templates text[],p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update platform.whatsapp_jobs set status='manual_review',last_error='Claim expired; check provider before replay'
 where status='claimed' and claimed_at<now()-interval '15 minutes';
 with picked as (select j.id from platform.whatsapp_jobs j join identity.profiles p on p.id=j.user_id
   where j.status='pending' and j.next_attempt_at<=now() and j.template_code=any(p_templates) and p.account_status='active'
   and (p.whatsapp_updates_opt_in_at is not null or (j.template_code='fti_category_quotation_v1' and exists(
     select 1 from sales.category_quote_requests r where r.notification_id=j.notification_id and r.buyer_id=p.id and r.asset_id is not null)))
   order by j.next_attempt_at,j.created_at,j.id limit greatest(1,least(coalesce(p_limit,10),20)) for update of j skip locked),
 claimed as (update platform.whatsapp_jobs j set status='claimed',claimed_at=now(),attempts=attempts+1 from picked where j.id=picked.id
   returning j.id,j.template_code,j.parameters,j.user_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'template',c.template_code,'parameters',c.parameters,'phone',p.phone)),'[]') into result
 from claimed c join identity.profiles p on p.id=c.user_id;
 return result;
end $$;

create function public.fti_sales_category_quote_delivery(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.fti_operations_whatsapp_can_send(p_job) then raise exception using errcode='42501',message='PDF delivery is not allowed.'; end if;
 select jsonb_build_object('object_key',a.object_key,'size_bytes',a.size_bytes,'storage_zone',a.storage_zone,'sha256_hex',a.sha256_hex)
 into result from platform.whatsapp_jobs j join sales.category_quote_requests r on r.notification_id=j.notification_id
 join platform.media_assets a on a.id=r.asset_id and a.entity_type='category_quote' and a.upload_status='verified'
 where j.id=p_job and j.template_code='fti_category_quotation_v1';
 if result is null then raise exception using errcode='P0002',message='Requested PDF is unavailable.'; end if;
 return result;
end $$;

create or replace function public.fti_operations_whatsapp_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('operations.manage');
begin
 update platform.whatsapp_jobs j set status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,last_error=null
 where j.id=p_id and j.status in ('failed','manual_review') and exists(
   select 1 from identity.profiles p where p.id=j.user_id and p.account_status='active' and (
     p.whatsapp_updates_opt_in_at is not null or (j.template_code='fti_category_quotation_v1' and exists(
       select 1 from sales.category_quote_requests r where r.notification_id=j.notification_id and r.buyer_id=p.id and r.asset_id is not null))));
 if not found then raise exception using errcode='42501',message='Job unavailable or consent withdrawn'; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'whatsapp.replayed','whatsapp_job',p_id);
end $$;

revoke all on function internal.fastener_quote_category(uuid),internal.queue_category_quote(uuid,uuid),
 public.fti_sales_category_quote_catalog(),public.fti_sales_category_quote_prepare(uuid,bigint,text),
 public.fti_sales_category_quote_complete(uuid,text,text),public.fti_sales_category_quote_request(uuid,uuid),
 public.fti_sales_category_quote_requests(boolean),public.fti_sales_category_quote_access(uuid),public.fti_sales_category_quote_delivery(uuid)
 from public,anon,authenticated;
grant execute on function public.fti_sales_category_quote_catalog(),public.fti_sales_category_quote_prepare(uuid,bigint,text),
 public.fti_sales_category_quote_request(uuid,uuid),public.fti_sales_category_quote_requests(boolean),public.fti_sales_category_quote_access(uuid) to authenticated;
grant execute on function public.fti_sales_category_quote_complete(uuid,text,text),public.fti_sales_category_quote_delivery(uuid) to service_role;
revoke all on function public.fti_sales_submit_with_pdfs(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.fti_sales_submit_with_pdfs(uuid,uuid,uuid,text,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
