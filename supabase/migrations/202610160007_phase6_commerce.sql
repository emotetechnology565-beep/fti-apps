-- Phase 6: accepted-quotation orders, tracked stock and manual bank-transfer review.
-- No products, stock, policy, orders or payments are seeded.
begin;

insert into identity.role_permissions(role_code,permission) values
 ('super_admin','order.manage'),('super_admin','inventory.manage'),('super_admin','payment.review'),('super_admin','order.policy'),
 ('order_manager','order.manage'),('order_manager','inventory.manage'),('accounts','payment.review')
 on conflict do nothing;

create table if not exists commerce.order_policy (
 id boolean primary key default true check(id),
 reservation_hours integer not null check(reservation_hours between 1 and 168),
 updated_by uuid not null references identity.profiles(id), updated_at timestamptz not null default now()
);
alter table commerce.order_policy enable row level security;
revoke all on commerce.order_policy from public,anon,authenticated;
alter table commerce.orders add column if not exists client_request_id uuid;
alter table commerce.orders add column if not exists request_hash text;
create unique index if not exists uq_order_buyer_request on commerce.orders(buyer_id,client_request_id) where client_request_id is not null;
create unique index if not exists uq_bank_transfer_active_order on commerce.payments(order_id)
 where gateway='bank_transfer' and status in ('review','successful');
create index if not exists idx_inventory_location_active on commerce.inventory(stock_location_id,variant_id);

create or replace function public.fti_commerce_policy_get()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage');
begin
 return (select jsonb_build_object('reservation_hours',reservation_hours,'updated_at',updated_at)
   from commerce.order_policy where id=true);
end $$;

create or replace function public.fti_commerce_my(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor();
begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select o.id,o.order_no,o.status,o.grand_total::text as grand_total,o.amount_due::text as amount_due,
     o.created_at,o.updated_at,o.quotation_revision_id,
     (select min(sr.expires_at) from commerce.stock_reservations sr join commerce.order_items oi on oi.id=sr.order_item_id
       where oi.order_id=o.id and sr.status='active') as reservation_expires_at
   from commerce.orders o where o.buyer_id=actor order by o.created_at desc,o.id desc
   limit 24 offset greatest(0,least(coalesce(p_offset,0),10000))
 ) x),'[]'::jsonb);
end $$;

create or replace function public.fti_commerce_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); o commerce.orders;
begin
 select * into o from commerce.orders where id=p_id;
 if not found then raise exception using errcode='P0002',message='Order not found.'; end if;
 if o.buyer_id<>actor then perform internal.identity_staff('order.manage'); end if;
 return (to_jsonb(o)-'request_hash'-'client_request_id') || jsonb_build_object(
   'subtotal',o.subtotal::text,'discount_total',o.discount_total::text,'gst_total',o.gst_total::text,
   'freight_total',o.freight_total::text,'loading_total',o.loading_total::text,
   'grand_total',o.grand_total::text,'amount_due',o.amount_due::text,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'variant_id',i.variant_id,
     'sku',i.sku_snapshot,'qty',i.qty::text,'uom',i.uom,'unit_price',i.unit_price::text,
     'line_total',i.line_total::text,'reservation_expires_at',r.expires_at) order by i.id)
     from commerce.order_items i left join commerce.stock_reservations r on r.order_item_id=i.id
     where i.order_id=p_id),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'method',p.gateway,
     'reference',p.gateway_payment_id,'amount',p.amount::text,'status',p.status,
     'created_at',p.created_at,'updated_at',p.updated_at) order by p.created_at desc)
     from commerce.payments p where p.order_id=p_id),'[]'::jsonb));
end $$;

create or replace function public.fti_commerce_bank_submit(p_order uuid,p_utr text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); o commerce.orders; normalized text; existing commerce.payments; result uuid;
begin
 normalized:=upper(btrim(coalesce(p_utr,'')));
 if normalized !~ '^[A-Z0-9/-]{6,40}$' then
   raise exception using errcode='22023',message='Enter the bank transfer reference, 6 to 40 letters or digits.'; end if;
 select * into o from commerce.orders where id=p_order for update;
 if not found then raise exception using errcode='P0002',message='Order not found.'; end if;
 if o.buyer_id<>actor then raise exception using errcode='42501',message='Order access denied.'; end if;
 if o.status<>'pending_payment' or o.amount_due<>o.grand_total or o.grand_total<=0
   or not exists(select 1 from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
     where i.order_id=o.id and r.status='active' and r.expires_at>now())
   or exists(select 1 from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
     where i.order_id=o.id and (r.status<>'active' or r.expires_at<=now())) then
   raise exception using errcode='22023',message='Order is not awaiting a valid full bank transfer.'; end if;
 select * into existing from commerce.payments where order_id=p_order and gateway='bank_transfer'
   and status in ('review','successful') for update;
 if found then
   if existing.gateway_payment_id=normalized then return jsonb_build_object('id',existing.id,'replayed',true); end if;
   raise exception using errcode='23505',message='A transfer is already awaiting review for this order.'; end if;
 insert into commerce.payments(order_id,gateway,gateway_payment_id,amount,status)
 values(p_order,'bank_transfer',normalized,o.grand_total,'review') returning id into result;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,'commerce.bank.submit','payment',result);
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('commerce.payment.review_requested','payment',result,jsonb_build_object('order_id',o.id));
 return jsonb_build_object('id',result,'replayed',false);
end $$;

create or replace function public.fti_commerce_payment_queue(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('payment.review');
begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select p.id,p.order_id,o.order_no,o.buyer_id,p.gateway_payment_id as reference,p.amount::text as amount,
     p.status,p.created_at from commerce.payments p join commerce.orders o on o.id=p.order_id
   where p.gateway='bank_transfer' and p.status='review' order by p.created_at,p.id
   limit 24 offset greatest(0,least(coalesce(p_offset,0),10000))
 ) x),'[]'::jsonb);
end $$;

create or replace function public.fti_commerce_payment_decide(p_payment uuid,p_approved boolean,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('payment.review'); p commerce.payments; o commerce.orders; row record;
begin
 if p_approved is null or length(btrim(coalesce(p_note,''))) not between 5 and 500 then
   raise exception using errcode='22023',message='Record a bank verification decision and note.'; end if;
 select * into p from commerce.payments where id=p_payment;
 if not found then raise exception using errcode='P0002',message='Payment not found.'; end if;
 select * into o from commerce.orders where id=p.order_id for update;
 select * into p from commerce.payments where id=p_payment for update;
 if p.gateway<>'bank_transfer' or p.status<>'review' or o.status<>'pending_payment'
   or p.amount<>o.grand_total or o.amount_due<>o.grand_total or o.buyer_id=actor then
   raise exception using errcode='22023',message='Payment is unavailable for review.'; end if;
 if p_approved then
   if not exists(select 1 from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
       where i.order_id=o.id)
     or exists(select 1 from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
       where i.order_id=o.id and (r.status<>'active' or r.expires_at<=now())) then
     raise exception using errcode='22023',message='Stock reservation expired; payment requires manual resolution.'; end if;
   for row in select r.* from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
     where i.order_id=o.id order by r.variant_id,r.stock_location_id for update of r loop
     update commerce.inventory set on_hand=on_hand-row.qty,reserved=reserved-row.qty,updated_at=now()
       where variant_id=row.variant_id and stock_location_id=row.stock_location_id and reserved>=row.qty;
     if not found then raise exception using errcode='22023',message='Inventory reservation is inconsistent.'; end if;
     update commerce.stock_reservations set status='consumed' where id=row.id;
     insert into commerce.inventory_movements(variant_id,stock_location_id,qty_delta,reason,external_ref,performed_by)
     values(row.variant_id,row.stock_location_id,-row.qty,'Bank payment verified; stock allocated',o.order_no,actor);
   end loop;
   update commerce.payments set status='successful',updated_at=now() where id=p.id;
   update commerce.orders set status='confirmed',amount_due=0,updated_at=now() where id=o.id;
 else
   update commerce.payments set status='failed',updated_at=now() where id=p.id;
 end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,case when p_approved then 'commerce.bank.approve' else 'commerce.bank.reject' end,'payment',p.id,
   jsonb_build_object('note',btrim(p_note),'order_id',o.id));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values(case when p_approved then 'commerce.payment.verified' else 'commerce.payment.rejected' end,
   'payment',p.id,jsonb_build_object('order_id',o.id));
end $$;

create or replace function public.fti_commerce_expire(p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage'); o commerce.orders; row record; released integer := 0;
begin
 if p_limit not between 1 and 100 then raise exception using errcode='22023',message='Limit must be 1 to 100.'; end if;
 for o in select orders.* from commerce.orders orders where orders.status='pending_payment'
   and exists(select 1 from commerce.order_items i join commerce.stock_reservations r on r.order_item_id=i.id
     where i.order_id=orders.id and r.status='active' and r.expires_at<=now())
   and not exists(select 1 from commerce.payments p where p.order_id=orders.id and p.status='review')
   order by orders.id limit p_limit for update of orders skip locked loop
   for row in select r.* from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
     where i.order_id=o.id and r.status='active' order by r.variant_id,r.stock_location_id for update of r loop
     update commerce.inventory set reserved=reserved-row.qty,updated_at=now()
       where variant_id=row.variant_id and stock_location_id=row.stock_location_id and reserved>=row.qty;
     if not found then raise exception using errcode='22023',message='Inventory reservation is inconsistent.'; end if;
     update commerce.stock_reservations set status='released' where id=row.id;
   end loop;
   update commerce.orders set status='cancelled',updated_at=now() where id=o.id;
   insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
   values(actor,'commerce.order.expire','order',o.id);
   insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
   values('commerce.order.expired','order',o.id,jsonb_build_object('order_id',o.id));
   released:=released+1;
 end loop;
 return released;
end $$;



create or replace function public.fti_commerce_policy_set(p_hours integer)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.policy');
begin
 if p_hours not between 1 and 168 then
   raise exception using errcode='22023',message='Approved reservation duration must be 1 to 168 hours.'; end if;
 insert into commerce.order_policy(id,reservation_hours,updated_by) values(true,p_hours,actor)
 on conflict(id) do update set reservation_hours=excluded.reservation_hours,updated_by=actor,updated_at=now();
 insert into platform.audit_logs(actor_id,action,resource_type,after_data)
 values(actor,'commerce.policy.set','order_policy',jsonb_build_object('reservation_hours',p_hours));
end $$;

create or replace function public.fti_commerce_location_create(p_code text,p_name text,p_city text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('inventory.manage'); result uuid;
begin
 if coalesce(p_code,'') !~ '^[A-Z0-9_-]{2,24}$' or length(btrim(coalesce(p_name,''))) not between 2 and 120
   or length(coalesce(p_city,''))>120 then
   raise exception using errcode='22023',message='Supply a location code and name.'; end if;
 insert into commerce.stock_locations(code,name,city) values(p_code,btrim(p_name),nullif(btrim(p_city),'')) returning id into result;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,'commerce.location.create','stock_location',result);
 return result;
end $$;

create or replace function public.fti_commerce_stock_adjust(p_variant uuid,p_location uuid,p_delta numeric,p_reason text,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('inventory.manage'); stock commerce.inventory; result numeric(18,3);
begin
 if p_variant is null or p_location is null or p_delta is null or p_delta=0 or abs(p_delta)>1000000000
   or p_delta<>round(p_delta,3) or length(btrim(coalesce(p_reason,''))) not between 5 and 300
   or length(coalesce(p_reference,''))>120 then
   raise exception using errcode='22023',message='Supply a valid signed quantity, reason and reference.'; end if;
 if not exists(select 1 from catalog.product_variants where id=p_variant and is_active)
   or not exists(select 1 from commerce.stock_locations where id=p_location and is_active) then
   raise exception using errcode='22023',message='Active variant and location required.'; end if;
 insert into commerce.inventory(variant_id,stock_location_id) values(p_variant,p_location) on conflict do nothing;
 select * into stock from commerce.inventory where variant_id=p_variant and stock_location_id=p_location for update;
 result:=stock.on_hand+p_delta;
 if result<stock.reserved or result<0 then
   raise exception using errcode='22023',message='Adjustment cannot reduce stock below reserved quantity.'; end if;
 update commerce.inventory set on_hand=result,updated_at=now() where variant_id=p_variant and stock_location_id=p_location;
 insert into commerce.inventory_movements(variant_id,stock_location_id,qty_delta,reason,external_ref,performed_by)
 values(p_variant,p_location,p_delta,btrim(p_reason),nullif(btrim(p_reference),''),actor);
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'commerce.stock.adjust','inventory',p_variant,
   jsonb_build_object('location_id',p_location,'delta',p_delta,'on_hand',result));
 return jsonb_build_object('on_hand',result,'reserved',stock.reserved,'available',result-stock.reserved);
end $$;

create or replace function public.fti_commerce_stock()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('inventory.manage');
begin
 return jsonb_build_object(
   'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'city',city,'is_active',is_active) order by code)
     from commerce.stock_locations),'[]'::jsonb),
   'inventory',coalesce((select jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'sku',v.sku,
      'location_id',i.stock_location_id,'on_hand',i.on_hand::text,'reserved',i.reserved::text,
      'available',(i.on_hand-i.reserved)::text) order by l.code,v.sku)
      from commerce.inventory i join catalog.product_variants v on v.id=i.variant_id
      join commerce.stock_locations l on l.id=i.stock_location_id),'[]'::jsonb));
end $$;

create or replace function public.fti_commerce_addresses()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'business_id',a.business_id,
   'label',a.label,'line1',a.line1,'city',a.city,'state',a.state,'pincode',a.pincode)
   order by a.created_at desc,a.id desc) from identity.addresses a
   where a.user_id=actor or (a.business_id is not null and exists(
     select 1 from identity.business_members m join identity.businesses b on b.id=m.business_id
     where m.business_id=a.business_id and m.user_id=actor and m.status='active' and b.verification_status='verified'))),'[]'::jsonb);
end $$;

create or replace function public.fti_commerce_address_save(p_line1 text,p_city text,p_state text,p_pincode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); result uuid;
begin
 if length(btrim(coalesce(p_line1,''))) not between 5 and 200
   or length(btrim(coalesce(p_city,''))) not between 2 and 100
   or length(btrim(coalesce(p_state,''))) not between 2 and 100
   or coalesce(p_pincode,'') !~ '^[1-9][0-9]{5}$' then
   raise exception using errcode='22023',message='Supply a complete Indian delivery address.'; end if;
 if (select count(*) from identity.addresses where user_id=actor and business_id is null)>=5 then
   raise exception using errcode='22023',message='Personal address limit reached.'; end if;
 insert into identity.addresses(user_id,label,line1,city,state,pincode)
 values(actor,'shipping',btrim(p_line1),btrim(p_city),btrim(p_state),p_pincode) returning id into result;
 return result;
end $$;

create or replace function public.fti_commerce_quote_order(p_request_id uuid,p_quote uuid,p_address uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); q sales.quotations; r sales.rfqs; rev sales.quotation_revisions;
 address identity.addresses; policy_hours integer; fingerprint text; previous commerce.orders; order_id uuid;
 line record; stock commerce.inventory; item_id uuid; expires timestamptz;
begin
 if p_request_id is null or p_quote is null or p_address is null then
   raise exception using errcode='22023',message='Quote, address and request ID required.'; end if;
 fingerprint:=md5(jsonb_build_object('quote',p_quote,'address',p_address)::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select * into previous from commerce.orders where buyer_id=actor and client_request_id=p_request_id;
 if found then
   if previous.request_hash<>fingerprint then
     raise exception using errcode='23505',message='Request ID was already used with different details.'; end if;
   return jsonb_build_object('id',previous.id,'replayed',true); end if;
 select * into q from sales.quotations where id=p_quote for update;
 if not found then raise exception using errcode='P0002',message='Quotation not found.'; end if;
 select * into r from sales.rfqs where id=q.rfq_id for update;
 if r.buyer_id<>actor then raise exception using errcode='42501',message='Quotation access denied.'; end if;
 select * into rev from sales.quotation_revisions where quotation_id=q.id and revision_no=q.current_revision for update;
 if q.status<>'accepted' or r.status<>'accepted' or rev.status<>'accepted' or rev.valid_until<=now()
   or rev.grand_total<=0 then
   raise exception using errcode='22023',message='Only the latest unexpired accepted quotation can become an order.'; end if;
 select reservation_hours into policy_hours from commerce.order_policy where id=true;
 if policy_hours is null then
   raise exception using errcode='22023',message='Order reservation policy has not been approved.'; end if;
 select * into address from identity.addresses a where a.id=p_address and
   ((a.business_id is null and a.user_id=actor) or (r.business_id is not null and a.business_id=r.business_id));
 if not found then raise exception using errcode='42501',message='Delivery address is unavailable.'; end if;
 if r.business_id is not null and not exists(select 1 from identity.business_members m
   join identity.businesses b on b.id=m.business_id where m.business_id=r.business_id and m.user_id=actor
   and m.status='active' and b.verification_status='verified') then
   raise exception using errcode='42501',message='Verified business membership required.'; end if;
 if not exists(select 1 from sales.quotation_items where revision_id=rev.id) then
   raise exception using errcode='22023',message='Quotation has no items.'; end if;
 expires:=now()+make_interval(hours=>policy_hours); order_id:=gen_random_uuid();
 insert into commerce.orders(id,order_no,buyer_id,business_id,quotation_revision_id,delivery_address_snapshot,
   status,subtotal,discount_total,gst_total,freight_total,grand_total,amount_due,client_request_id,request_hash)
 values(order_id,'FTI-O-'||upper(substr(replace(order_id::text,'-',''),1,12)),actor,r.business_id,rev.id,
   jsonb_build_object('line1',address.line1,'line2',address.line2,'city',address.city,'state',address.state,
     'pincode',address.pincode,'country_code',address.country_code),
   'pending_payment',rev.subtotal,rev.discount_total,rev.gst_total,rev.freight_total,rev.grand_total,
   rev.grand_total,p_request_id,fingerprint);
 for line in select qi.*,v.sku from sales.quotation_items qi join catalog.product_variants v on v.id=qi.variant_id
   where qi.revision_id=rev.id order by qi.variant_id loop
   select i.* into stock from commerce.inventory i join commerce.stock_locations l on l.id=i.stock_location_id
     where i.variant_id=line.variant_id and l.is_active and i.on_hand-i.reserved>=line.qty
     order by i.stock_location_id limit 1 for update of i;
   if not found then raise exception using errcode='22023',message='Tracked stock is unavailable for a quoted item.'; end if;
   insert into commerce.order_items(order_id,variant_id,sku_snapshot,qty,uom,unit_price,tax_rate,line_total)
   values(order_id,line.variant_id,line.sku,line.qty,line.uom,line.rate,line.tax_rate,line.line_total)
   returning id into item_id;
   update commerce.inventory set reserved=reserved+line.qty,updated_at=now()
     where variant_id=stock.variant_id and stock_location_id=stock.stock_location_id;
   insert into commerce.stock_reservations(order_item_id,variant_id,stock_location_id,qty,status,expires_at)
   values(item_id,line.variant_id,stock.stock_location_id,line.qty,'active',expires);
 end loop;
 update sales.quotations set status='converted' where id=q.id;
 update sales.rfqs set status='converted',updated_at=now() where id=r.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'commerce.order.create','order',order_id,jsonb_build_object('quote_revision_id',rev.id,'grand_total',rev.grand_total));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('commerce.order.created','order',order_id,jsonb_build_object('order_id',order_id));
 return jsonb_build_object('id',order_id,'replayed',false);
end $$;

revoke all on function public.fti_commerce_policy_get(),public.fti_commerce_policy_set(integer),
 public.fti_commerce_location_create(text,text,text),public.fti_commerce_stock_adjust(uuid,uuid,numeric,text,text),
 public.fti_commerce_stock(),public.fti_commerce_addresses(),public.fti_commerce_address_save(text,text,text,text),
 public.fti_commerce_quote_order(uuid,uuid,uuid),public.fti_commerce_my(integer),
 public.fti_commerce_detail(uuid),public.fti_commerce_bank_submit(uuid,text),public.fti_commerce_payment_queue(integer),
 public.fti_commerce_payment_decide(uuid,boolean,text),public.fti_commerce_expire(integer)
 from public,anon,authenticated;
grant execute on function public.fti_commerce_policy_get(),public.fti_commerce_policy_set(integer),
 public.fti_commerce_location_create(text,text,text),public.fti_commerce_stock_adjust(uuid,uuid,numeric,text,text),
 public.fti_commerce_stock(),public.fti_commerce_addresses(),public.fti_commerce_address_save(text,text,text,text),
 public.fti_commerce_quote_order(uuid,uuid,uuid),public.fti_commerce_my(integer),
 public.fti_commerce_detail(uuid),public.fti_commerce_bank_submit(uuid,text),public.fti_commerce_payment_queue(integer),
 public.fti_commerce_payment_decide(uuid,boolean,text),public.fti_commerce_expire(integer) to authenticated;
notify pgrst,'reload schema';
commit;

