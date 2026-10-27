begin;
-- Request fulfillment is independent of message delivery and checkout payment state.
create table sales.request_fulfillments (
 id uuid primary key default gen_random_uuid(),
 raw_request_id uuid unique references sales.raw_material_requests(id),
 fastener_request_id uuid unique references sales.fastener_requests(id),
 status text not null default 'pending_confirmation'
   check(status in ('pending_confirmation','confirmed','processing','shipped','delivered')),
 revision integer not null default 0 check(revision>=0),
 confirmed_total numeric(20,2), confirmation_note text,
 carrier text, tracking_number text, vehicle_number text, delivery_note text,
 history jsonb not null default '[]'::jsonb check(jsonb_typeof(history)='array'),
 updated_at timestamptz not null default now(),
 check(num_nonnulls(raw_request_id,fastener_request_id)=1),
 check(status='pending_confirmation' or (confirmed_total>0 and confirmation_note is not null)),
 check(status not in ('shipped','delivered') or (carrier is not null and tracking_number is not null)),
 check(status<>'delivered' or delivery_note is not null)
);
alter table sales.request_fulfillments enable row level security;
revoke all on sales.request_fulfillments from public,anon,authenticated;

create function internal.request_fulfillment_data(p_raw uuid,p_fastener uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select to_jsonb(f)-'confirmed_total'||jsonb_build_object('confirmed_total',f.confirmed_total::text)
 from sales.request_fulfillments f where (p_raw is not null and f.raw_request_id=p_raw)
 or (p_fastener is not null and f.fastener_request_id=p_fastener)),
 jsonb_build_object('status','pending_confirmation','revision',0,'history','[]'::jsonb));
$$;
revoke all on function internal.request_fulfillment_data(uuid,uuid) from public,anon,authenticated;

create function public.fti_request_fulfillment_update(
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
 carrier=f.carrier,tracking_number=f.tracking_number,vehicle_number=f.vehicle_number,delivery_note=f.delivery_note,
 history=history||jsonb_build_array(event),updated_at=now() where id=f.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
 values(actor,'request.'||p_status,p_kind||'_request',p_request,
 jsonb_build_object('status',f.status,'revision',f.revision),
 jsonb_build_object('status',p_status,'revision',f.revision+1,'confirmed_total',f.confirmed_total,
 'confirmation_note',f.confirmation_note,'carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'delivery_note',f.delivery_note));
 insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at)
 values(buyer,'in_app','operations',jsonb_build_object('title',initcap(p_kind)||' request '||case p_status when 'shipped' then 'dispatched' else p_status end,
 'entity_id',p_request,'request_type',p_kind,'request_state',p_status),'delivered',now());
 return internal.request_fulfillment_data(case when p_kind='material' then p_request end,case when p_kind='fastener' then p_request end);
end $$;
revoke all on function public.fti_request_fulfillment_update(text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.fti_request_fulfillment_update(text,uuid,integer,text,jsonb) to authenticated;

create or replace function public.fti_catalog_raw_orders(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select q.*,internal.request_fulfillment_data(q.id,null) as fulfillment,
  (select jsonb_agg(jsonb_build_object('id',j.id,'phone',j.phone,'template',j.template,'status',j.status,'error',j.last_error))
   from sales.raw_material_jobs j where j.request_id=q.id) as deliveries
  from sales.raw_material_requests q order by created_at desc,id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))) r),'[]');
end $$;
create or replace function public.fti_catalog_fastener_orders(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select q.*,internal.request_fulfillment_data(null,q.id) as fulfillment,
  (select jsonb_agg(jsonb_build_object('id',j.id,'phone',j.phone,'template',j.template,'status',j.status,'error',j.last_error))
   from sales.fastener_jobs j where j.request_id=q.id) as deliveries
  from sales.fastener_requests q order by created_at desc,id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))) r),'[]');
end $$;
revoke all on function public.fti_catalog_raw_orders(integer),public.fti_catalog_fastener_orders(integer) from public,anon;
grant execute on function public.fti_catalog_raw_orders(integer),public.fti_catalog_fastener_orders(integer) to authenticated;
notify pgrst,'reload schema';
commit;
