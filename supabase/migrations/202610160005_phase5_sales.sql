-- Phase 5: RFQs and manually priced quotation revisions. No business data seeded.
begin;

insert into identity.role_permissions(role_code,permission) values
 ('super_admin','sales.manage'),('sales_executive','sales.manage') on conflict do nothing;

alter table sales.rfqs add column if not exists client_request_id uuid;
alter table sales.rfqs add column if not exists request_hash text;
create unique index if not exists uq_rfq_buyer_request on sales.rfqs(buyer_id,client_request_id) where client_request_id is not null;
create unique index if not exists uq_rfq_variant on sales.rfq_items(rfq_id,variant_id);
create unique index if not exists uq_quotation_rfq on sales.quotations(rfq_id);
create index if not exists idx_media_rfq_owner on platform.media_assets(entity_id,created_at,id)
 where entity_type='rfq' and visibility='private' and upload_status='verified';
create table if not exists sales.revision_requests (
 id uuid primary key default gen_random_uuid(), quotation_id uuid not null references sales.quotations(id),
 revision_no integer not null, requested_by uuid not null references identity.profiles(id),
 reason text not null, created_at timestamptz not null default now(),
 unique(quotation_id,revision_no)
);
alter table sales.revision_requests enable row level security;
revoke all on sales.revision_requests from public,anon,authenticated;

create or replace function public.fti_sales_submit(p_request_id uuid,p_business uuid,p_address uuid,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); result uuid; item jsonb; variant catalog.product_variants; item_qty numeric(18,3); item_id uuid;
 request_fingerprint text := md5(jsonb_build_object('business',p_business,'address',p_address,'notes',nullif(btrim(p_notes),''),'items',p_items)::text);
begin
 if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20
   or length(coalesce(p_notes,''))>2000 then
   raise exception using errcode='22023',message='Supply 1 to 20 items and up to 2000 characters of notes.';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select id into result from sales.rfqs where buyer_id=actor and client_request_id=p_request_id and request_hash=request_fingerprint;
 if found then return jsonb_build_object('id',result,'replayed',true); end if;
 if exists(select 1 from sales.rfqs where buyer_id=actor and client_request_id=p_request_id) then
   raise exception using errcode='23505',message='Request ID was already used with different details.';
 end if;
 if p_business is not null and not exists(
   select 1 from identity.business_members m join identity.businesses b on b.id=m.business_id
   where m.business_id=p_business and m.user_id=actor and m.status='active' and b.verification_status='verified') then
   raise exception using errcode='42501',message='Choose a verified business you belong to.';
 end if;
 if p_address is not null and not exists(
   select 1 from identity.addresses a where a.id=p_address and
   (a.user_id=actor or (p_business is not null and a.business_id=p_business))) then
   raise exception using errcode='42501',message='Delivery address is unavailable.';
 end if;
 if (select count(distinct value->>'variant_id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then
   raise exception using errcode='22023',message='Add each variant only once.';
 end if;
 result:=gen_random_uuid();
 insert into sales.rfqs(id,rfq_no,buyer_id,business_id,delivery_address_id,notes,status,client_request_id,request_hash)
 values(result,'FTI-RFQ-'||upper(substr(replace(result::text,'-',''),1,12)),actor,p_business,p_address,nullif(btrim(p_notes),''),'submitted',p_request_id,request_fingerprint);
 for item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'variant_id','') !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(item->>'qty','') !~ '^\d{1,15}(\.\d{1,3})?$' or length(coalesce(item->>'requirements',''))>500 then
     raise exception using errcode='22023',message='Invalid item, quantity or requirements.';
   end if;
   item_id:=(item->>'variant_id')::uuid; item_qty:=(item->>'qty')::numeric(18,3);
   select v.* into variant from catalog.product_variants v join catalog.products p on p.id=v.product_id
     join catalog.categories c on c.id=p.category_id
     where v.id=item_id and v.is_active and p.status='published' and c.is_active;
   if not found or item_qty<=0 or item_qty<variant.min_order_qty or item->>'uom' is distinct from variant.uom then
     raise exception using errcode='22023',message='Choose an active variant and a valid quantity in its catalogue unit.';
   end if;
   insert into sales.rfq_items(rfq_id,variant_id,qty,uom,requirements)
     values(result,item_id,item_qty,variant.uom,nullif(btrim(item->>'requirements'),''));
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,'sales.rfq.submit','rfq',result);
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('sales.rfq.submitted','rfq',result,jsonb_build_object('rfq_id',result));
 return jsonb_build_object('id',result,'replayed',false);
end $$;

create or replace function public.fti_sales_my(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor();
begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select r.id,r.rfq_no,r.status,r.created_at,r.updated_at,r.assigned_to,
     (select count(*) from sales.rfq_items i where i.rfq_id=r.id) as item_count
   from sales.rfqs r where r.buyer_id=actor order by r.created_at desc,r.id desc
   limit 24 offset greatest(0,least(coalesce(p_offset,0),10000))
 ) x),'[]'::jsonb);
end $$;

create or replace function public.fti_sales_queue(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('sales.manage'); is_admin boolean := internal.identity_permission('business.review');
begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select r.id,r.rfq_no,r.status,r.created_at,r.updated_at,r.assigned_to,
     (select count(*) from sales.rfq_items i where i.rfq_id=r.id) as item_count
   from sales.rfqs r where is_admin or r.assigned_to is null or r.assigned_to=actor
   order by r.created_at desc,r.id desc limit 24 offset greatest(0,least(coalesce(p_offset,0),10000))
 ) x),'[]'::jsonb);
end $$;

create or replace function public.fti_sales_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); r sales.rfqs; staff boolean;
begin
 select * into r from sales.rfqs where id=p_id;
 if not found then raise exception using errcode='P0002',message='Request not found.'; end if;
 if r.buyer_id<>actor then
   perform internal.identity_staff('sales.manage');
   staff:=internal.identity_permission('business.review') or r.assigned_to is null or r.assigned_to=actor;
   if not staff then raise exception using errcode='42501',message='Request access denied.'; end if;
 end if;
 return (to_jsonb(r) - 'request_hash' - 'client_request_id') || jsonb_build_object(
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'variant_id',i.variant_id,'sku',v.sku,
     'product_name',p.name,'qty',i.qty::text,'uom',i.uom,'requirements',i.requirements) order by i.id)
     from sales.rfq_items i join catalog.product_variants v on v.id=i.variant_id
     join catalog.products p on p.id=v.product_id where i.rfq_id=p_id),'[]'::jsonb),
   'quotations',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'quote_no',q.quote_no,
     'status',q.status,'current_revision',q.current_revision,'revisions',coalesce((
       select jsonb_agg(jsonb_build_object('id',rev.id,'revision_no',rev.revision_no,'status',rev.status,
         'valid_until',rev.valid_until,'subtotal',rev.subtotal::text,'discount_total',rev.discount_total::text,
         'gst_total',rev.gst_total::text,'freight_total',rev.freight_total::text,'grand_total',rev.grand_total::text,
         'payment_terms',rev.payment_terms,'notes',rev.notes,'accepted_at',rev.accepted_at,'created_at',rev.created_at,
         'items',coalesce((select jsonb_agg(jsonb_build_object('variant_id',qi.variant_id,'sku',cv.sku,
           'qty',qi.qty::text,'uom',qi.uom,'rate',qi.rate::text,'line_total',qi.line_total::text) order by qi.id)
           from sales.quotation_items qi join catalog.product_variants cv on cv.id=qi.variant_id
           where qi.revision_id=rev.id),'[]'::jsonb)) order by rev.revision_no desc)
       from sales.quotation_revisions rev where rev.quotation_id=q.id),'[]'::jsonb)) order by q.created_at desc)
     from sales.quotations q where q.rfq_id=p_id),'[]'::jsonb),
   'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'mime_type',a.mime_type,
     'size_bytes',a.size_bytes,'created_at',a.created_at) order by a.created_at)
     from platform.media_assets a where a.entity_type='rfq' and a.entity_id=p_id and a.visibility='private'
       and a.upload_status='verified'),'[]'::jsonb)
 );
end $$;

create or replace function public.fti_sales_assign(p_id uuid,p_assignee uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('sales.manage'); r sales.rfqs;
begin
 if p_assignee<>actor and not internal.identity_permission('business.review') then
   raise exception using errcode='42501',message='Only an administrator can assign another staff member.'; end if;
 if not exists(select 1 from identity.user_roles ur join identity.profiles p on p.id=ur.user_id
   where ur.user_id=p_assignee and ur.role_code in ('sales_executive','super_admin') and p.account_status='active') then
   raise exception using errcode='22023',message='Choose an active sales staff member.'; end if;
 select * into r from sales.rfqs where id=p_id for update;
 if not found or r.status not in ('submitted','reviewing','quoted') then
   raise exception using errcode='22023',message='Request cannot be assigned.'; end if;
 if r.assigned_to is not null and r.assigned_to<>actor and not internal.identity_permission('business.review') then
   raise exception using errcode='42501',message='Request is assigned to another staff member.'; end if;
 update sales.rfqs set assigned_to=p_assignee,status=case when status='submitted' then 'reviewing' else status end,
   updated_at=now() where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'sales.rfq.assign','rfq',p_id,jsonb_build_object('assigned_to',p_assignee));
end $$;

create or replace function public.fti_sales_quote(p_rfq uuid,p_valid_until timestamptz,p_lines jsonb,
 p_discount numeric,p_gst numeric,p_freight numeric,p_terms text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('sales.manage'); r sales.rfqs; q sales.quotations;
 rev_id uuid; line jsonb; rfq_item sales.rfq_items; rate numeric(20,4); subtotal numeric(20,2):=0;
 grand numeric(20,2); next_revision integer;
begin
 select * into r from sales.rfqs where id=p_rfq for update;
 if not found or r.status not in ('submitted','reviewing','quoted') or r.assigned_to is distinct from actor and not internal.identity_permission('business.review') then
   raise exception using errcode='42501',message='Request is unavailable for quotation.'; end if;
 if r.assigned_to is null then update sales.rfqs set assigned_to=actor where id=p_rfq; end if;
 if p_valid_until is null or not isfinite(p_valid_until) or p_valid_until<=now() or p_valid_until>now()+interval '90 days'
   or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)<> (select count(*) from sales.rfq_items where rfq_id=p_rfq)
   or length(coalesce(p_terms,'')) not between 3 and 1000 or length(coalesce(p_notes,''))>2000
   or p_discount is null or p_gst is null or p_freight is null or p_discount<0 or p_gst<0 or p_freight<0
   or p_discount>100000000000 or p_gst>100000000000 or p_freight>100000000000 then
   raise exception using errcode='22023',message='Supply valid lines, expiry, terms and approved nonnegative amounts.'; end if;
 select * into q from sales.quotations where rfq_id=p_rfq for update;
 if not found then
   insert into sales.quotations(quote_no,rfq_id,created_by,status)
     values('FTI-Q-'||upper(substr(replace(p_rfq::text,'-',''),1,12)),p_rfq,actor,'draft') returning * into q;
 end if;
 if q.status in ('accepted','converted') then raise exception using errcode='22023',message='Accepted quotation cannot be revised.'; end if;
 if (select count(distinct value->>'variant_id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then
   raise exception using errcode='22023',message='Each requested variant must appear once.'; end if;
 for line in select value from jsonb_array_elements(p_lines) loop
   if jsonb_typeof(line) is distinct from 'object' or coalesce(line->>'variant_id','') !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(line->>'rate','') !~ '^\d{1,15}(\.\d{1,4})?$' then
     raise exception using errcode='22023',message='Supply a valid INR rate for every item.'; end if;
   select * into rfq_item from sales.rfq_items where rfq_id=p_rfq and variant_id=(line->>'variant_id')::uuid;
   if not found then raise exception using errcode='22023',message='Quotation item does not match the request.'; end if;
   rate:=(line->>'rate')::numeric(20,4);
   if rate<=0 then raise exception using errcode='22023',message='Rates must be positive.'; end if;
   subtotal:=subtotal+round(rfq_item.qty*rate,2);
 end loop;
 grand:=subtotal-p_discount+p_gst+p_freight;
 if grand<0 or grand>100000000000 then raise exception using errcode='22023',message='Grand total is invalid.'; end if;
 next_revision:=q.current_revision+1; rev_id:=gen_random_uuid();
 update sales.quotation_revisions set status='superseded' where quotation_id=q.id and status='sent';
 insert into sales.quotation_revisions(id,quotation_id,revision_no,valid_until,subtotal,discount_total,gst_total,
   freight_total,grand_total,payment_terms,notes,status)
 values(rev_id,q.id,next_revision,p_valid_until,subtotal,p_discount,p_gst,p_freight,grand,
   jsonb_build_object('text',btrim(p_terms)),nullif(btrim(p_notes),''),'sent');
 for line in select value from jsonb_array_elements(p_lines) loop
   select * into rfq_item from sales.rfq_items where rfq_id=p_rfq and variant_id=(line->>'variant_id')::uuid;
   rate:=(line->>'rate')::numeric(20,4);
   insert into sales.quotation_items(revision_id,variant_id,qty,uom,rate,tax_rate,line_total)
   values(rev_id,rfq_item.variant_id,rfq_item.qty,rfq_item.uom,rate,0,round(rfq_item.qty*rate,2));
 end loop;
 update sales.quotations set current_revision=next_revision,status='sent' where id=q.id;
 update sales.rfqs set status='quoted',updated_at=now() where id=p_rfq;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'sales.quote.issue','quotation',q.id,jsonb_build_object('revision',next_revision,'grand_total',grand));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('sales.quote.sent','quotation',q.id,jsonb_build_object('revision_id',rev_id,'rfq_id',p_rfq));
 return jsonb_build_object('quotation_id',q.id,'revision_id',rev_id,'revision_no',next_revision);
end $$;

create or replace function public.fti_sales_revision_request(p_quote uuid,p_revision integer,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); q sales.quotations; r sales.rfqs; rev sales.quotation_revisions;
begin
 select * into q from sales.quotations where id=p_quote for update;
 if not found then raise exception using errcode='P0002',message='Quotation not found.'; end if;
 select * into r from sales.rfqs where id=q.rfq_id;
 if r.buyer_id<>actor then raise exception using errcode='42501',message='Quotation access denied.'; end if;
 select * into rev from sales.quotation_revisions where quotation_id=q.id and revision_no=p_revision for update;
 if q.current_revision is distinct from p_revision or q.status<>'sent' or rev.status<>'sent'
   or rev.valid_until<=now() or length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then
   raise exception using errcode='22023',message='Only the current unexpired quotation can be revised.'; end if;
 insert into sales.revision_requests(quotation_id,revision_no,requested_by,reason)
 values(q.id,p_revision,actor,btrim(p_reason));
 update sales.quotation_revisions set status='superseded' where id=rev.id;
 update sales.quotations set status='superseded' where id=q.id;
 update sales.rfqs set status='reviewing',updated_at=now() where id=r.id;
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('sales.quote.revision_requested','quotation',q.id,jsonb_build_object('revision',p_revision));
end $$;

create or replace function public.fti_sales_accept(p_quote uuid,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); q sales.quotations; r sales.rfqs; rev sales.quotation_revisions;
begin
 select * into q from sales.quotations where id=p_quote for update;
 if not found then raise exception using errcode='P0002',message='Quotation not found.'; end if;
 select * into r from sales.rfqs where id=q.rfq_id for update;
 if r.buyer_id<>actor then raise exception using errcode='42501',message='Quotation access denied.'; end if;
 select * into rev from sales.quotation_revisions where quotation_id=q.id and revision_no=p_revision for update;
 if q.current_revision is distinct from p_revision or q.status<>'sent' or rev.status<>'sent'
   or rev.valid_until<=now() then
   raise exception using errcode='22023',message='Only the current unexpired quotation can be accepted once.'; end if;
 update sales.quotation_revisions set status='accepted',accepted_at=now() where id=rev.id;
 update sales.quotations set status='accepted' where id=q.id;
 update sales.rfqs set status='accepted',updated_at=now() where id=r.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'sales.quote.accept','quotation',q.id,jsonb_build_object('revision',p_revision,'grand_total',rev.grand_total));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('sales.quote.accepted','quotation',q.id,jsonb_build_object('revision_id',rev.id,'rfq_id',r.id));
end $$;

revoke all on function public.fti_sales_submit(uuid,uuid,uuid,text,jsonb),public.fti_sales_my(integer),
 public.fti_sales_queue(integer),public.fti_sales_detail(uuid),public.fti_sales_assign(uuid,uuid),
 public.fti_sales_quote(uuid,timestamptz,jsonb,numeric,numeric,numeric,text,text),
 public.fti_sales_revision_request(uuid,integer,text),public.fti_sales_accept(uuid,integer)
 from public,anon,authenticated;
grant execute on function public.fti_sales_submit(uuid,uuid,uuid,text,jsonb),public.fti_sales_my(integer),
 public.fti_sales_queue(integer),public.fti_sales_detail(uuid),public.fti_sales_assign(uuid,uuid),
 public.fti_sales_quote(uuid,timestamptz,jsonb,numeric,numeric,numeric,text,text),
 public.fti_sales_revision_request(uuid,integer,text),public.fti_sales_accept(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
