begin;
alter table commerce.shipments add column driver_name text, add column driver_phone text;
alter table sales.request_fulfillments add column driver_name text, add column driver_phone text;

create function internal.validate_driver_details(p_name text,p_phone text) returns void
language plpgsql set search_path='' as $$
begin
 if nullif(btrim(p_name),'') is not null and length(btrim(p_name)) not between 2 and 120 then
  raise exception 'Driver name must be 2-120 characters' using errcode='22023';
 end if;
 if nullif(btrim(p_phone),'') is not null and regexp_replace(btrim(p_phone),'[[:space:]().-]','','g') !~ '^\+?[0-9]{7,15}$' then
  raise exception 'Driver phone number must contain 7-15 digits, with an optional + prefix' using errcode='22023';
 end if;
end $$;
revoke all on function internal.validate_driver_details(text,text) from public,anon,authenticated;

-- Replace the old signature; defaults preserve older clients that omit driver details.
drop function public.fti_operations_dispatch(uuid,text,text,text);
create function public.fti_operations_dispatch(p_order uuid,p_carrier text,p_tracking text,p_vehicle text,p_driver_name text default null,p_driver_phone text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('operations.manage'); o commerce.orders; sid uuid;
begin
 if p_carrier is null or length(trim(p_carrier)) not between 2 and 120 or p_tracking is null or length(trim(p_tracking)) not between 2 and 120
 or length(coalesce(p_vehicle,''))>40 then raise exception 'Enter carrier and LR/tracking reference (2-120 characters)' using errcode='22023'; end if;
 perform internal.validate_driver_details(p_driver_name,p_driver_phone);
 select * into o from commerce.orders where id=p_order for update;
 if o.id is null or o.status not in ('confirmed','processing') or o.amount_due<>0 then
 raise exception 'Only a confirmed, fully paid order can be dispatched' using errcode='22023'; end if;
 if exists(select 1 from commerce.shipments where order_id=p_order) then raise exception 'Shipment already exists' using errcode='22023'; end if;
 insert into commerce.shipments(order_id,carrier,tracking_number,vehicle_number,driver_name,driver_phone,status,dispatched_at)
 values(o.id,trim(p_carrier),trim(p_tracking),nullif(trim(p_vehicle),''),nullif(btrim(p_driver_name),''),nullif(regexp_replace(btrim(p_driver_phone),'[[:space:]().-]','','g'),''),'dispatched',now()) returning id into sid;
 update commerce.orders set status='shipped',updated_at=now() where id=o.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'order.dispatched','order',o.id,jsonb_build_object('shipment_id',sid,'tracking',trim(p_tracking)));
 perform internal.operations_notify(o.buyer_id,'Order '||o.order_no||' dispatched',o.id);
 return sid;
end $$;

create or replace function public.fti_request_fulfillment_update(
 p_kind text,p_request uuid,p_revision integer,p_status text,p_details jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; buyer uuid; f sales.request_fulfillments; next_status text;
 total_text text; note text; carrier text; tracking text; vehicle text; evidence text; event jsonb;
begin
 actor:=internal.identity_staff('order.manage');
 if p_kind is null or p_kind not in ('material','fastener') or p_request is null
 or p_revision is null or p_status is null or p_status not in ('confirmed','processing','shipped','delivered')
 or p_details is null or jsonb_typeof(p_details)<>'object' then
  raise exception 'Choose a valid request and fulfillment step' using errcode='22023';
 end if;
 if p_status in ('shipped','delivered') then perform internal.identity_staff('operations.manage'); end if;
 -- Lock the original request even before its first fulfillment record exists.
 if p_kind='material' then
  select buyer_id into buyer from sales.raw_material_requests where id=p_request for update;
 else
  select buyer_id into buyer from sales.fastener_requests where id=p_request for update;
 end if;
 if not found then raise exception 'Request not found' using errcode='P0002'; end if;
 if p_kind='material' then
  insert into sales.request_fulfillments(raw_request_id) values(p_request) on conflict(raw_request_id) do nothing;
  select * into f from sales.request_fulfillments where raw_request_id=p_request for update;
 else
  insert into sales.request_fulfillments(fastener_request_id) values(p_request) on conflict(fastener_request_id) do nothing;
  select * into f from sales.request_fulfillments where fastener_request_id=p_request for update;
 end if;
 if f.revision<>p_revision then raise exception 'Request changed. Refresh before continuing' using errcode='40001'; end if;
 next_status:=case f.status when 'pending_confirmation' then 'confirmed' when 'confirmed' then 'processing'
 when 'processing' then 'shipped' when 'shipped' then 'delivered' else null end;
 if p_status is distinct from next_status then raise exception 'Complete the preceding fulfillment step first' using errcode='22023'; end if;
 if p_status='confirmed' then
  total_text:=p_details->>'confirmed_total'; note:=btrim(p_details->>'confirmation_note');
  if total_text is null or total_text !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$'
   or coalesce(length(note),0) not between 5 and 1000 then
   raise exception 'Enter a positive agreed total (up to two decimals) and a confirmation note (5-1000 characters)' using errcode='22023';
  end if;
  if total_text::numeric<=0 then raise exception 'Agreed total must be positive' using errcode='22023'; end if;
  f.confirmed_total:=total_text::numeric; f.confirmation_note:=note;
 elsif p_status='shipped' then
  carrier:=btrim(p_details->>'carrier'); tracking:=btrim(p_details->>'tracking_number'); vehicle:=btrim(coalesce(p_details->>'vehicle_number',''));
  if coalesce(length(carrier),0) not between 2 and 120 or coalesce(length(tracking),0) not between 2 and 120 or length(vehicle)>40 then
   raise exception 'Enter a transporter and LR/tracking reference (2-120 characters); vehicle number is optional (up to 40)' using errcode='22023';
  end if;
  perform internal.validate_driver_details(p_details->>'driver_name',p_details->>'driver_phone');
  f.driver_name:=nullif(btrim(p_details->>'driver_name'),'');
  f.driver_phone:=nullif(regexp_replace(btrim(p_details->>'driver_phone'),'[[:space:]().-]','','g'),'');
  f.carrier:=carrier; f.tracking_number:=tracking; f.vehicle_number:=nullif(vehicle,'');
 elsif p_status='delivered' then
  evidence:=btrim(p_details->>'delivery_note');
  if coalesce(length(evidence),0) not between 5 and 1000 then
   raise exception 'Enter delivery evidence or recipient confirmation (5-1000 characters)' using errcode='22023';
  end if;
  f.delivery_note:=evidence;
 end if;
 event:=jsonb_build_object('status',p_status,'at',now(),'actor_id',actor);
 update sales.request_fulfillments set status=p_status,revision=revision+1,
 confirmed_total=f.confirmed_total,confirmation_note=f.confirmation_note,
 driver_name=f.driver_name,driver_phone=f.driver_phone,carrier=f.carrier,tracking_number=f.tracking_number,vehicle_number=f.vehicle_number,delivery_note=f.delivery_note,
 history=history||jsonb_build_array(event),updated_at=now() where id=f.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
 values(actor,'request.'||p_status,p_kind||'_request',p_request,
 jsonb_build_object('status',f.status,'revision',f.revision),
 jsonb_build_object('status',p_status,'revision',f.revision+1,'confirmed_total',f.confirmed_total,
 'driver_name',f.driver_name,'driver_phone',f.driver_phone,'confirmation_note',f.confirmation_note,'carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'delivery_note',f.delivery_note));
 insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at)
 values(buyer,'in_app','operations',jsonb_build_object('title',initcap(p_kind)||' request '||case p_status when 'shipped' then 'dispatched' else p_status end,
 'entity_id',p_request,'request_type',p_kind,'request_state',p_status),'delivered',now());
 return internal.request_fulfillment_data(case when p_kind='material' then p_request end,case when p_kind='fastener' then p_request end);
end $$;

revoke all on function public.fti_operations_dispatch(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fti_operations_dispatch(uuid,text,text,text,text,text) to authenticated;
create or replace function public.fti_customer_orders(p_offset integer default 0, p_search text default '', p_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); result jsonb;
begin
 with ledger as (
  select o.id, 'commerce'::text as kind, o.order_no as reference, o.status,
   o.created_at, o.grand_total::text as total, o.amount_due::text as amount_due,
   jsonb_build_object('material','Parts / quotation order','location',concat_ws(', ',o.delivery_address_snapshot->>'line1',o.delivery_address_snapshot->>'city')) as details,
   '{}'::jsonb as fulfillment
  from commerce.orders o where o.buyer_id=actor
  union all
  select q.id, 'material', q.details->>'reference', coalesce(f.status,'pending_confirmation'), q.created_at,
   f.confirmed_total::text, null, q.details,
   jsonb_build_object('history',f.history,'driver_name',f.driver_name,'driver_phone',f.driver_phone,'carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'confirmation_note',f.confirmation_note,'delivery_note',f.delivery_note)
  from sales.raw_material_requests q left join sales.request_fulfillments f on f.raw_request_id=q.id where q.buyer_id=actor
  union all
  select q.id, 'fastener', q.details->>'reference', coalesce(f.status,'pending_confirmation'), q.created_at,
   f.confirmed_total::text, null, q.details,
   jsonb_build_object('history',f.history,'driver_name',f.driver_name,'driver_phone',f.driver_phone,'carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'confirmation_note',f.confirmation_note,'delivery_note',f.delivery_note)
  from sales.fastener_requests q left join sales.request_fulfillments f on f.fastener_request_id=q.id where q.buyer_id=actor
 ), filtered as (
  select * from ledger where
   (coalesce(p_status,'all')='all' or status=p_status or (p_status='active' and status not in ('delivered','cancelled','expired')))
   and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',reference,details->>'material',details->>'grade',details->>'size',fulfillment->>'tracking_number')),lower(left(p_search,200)))>0)
 ), page as (select * from filtered order by created_at desc,id,kind limit 24 offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'orders',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id,kind) from page),'[]'::jsonb)) into result;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
