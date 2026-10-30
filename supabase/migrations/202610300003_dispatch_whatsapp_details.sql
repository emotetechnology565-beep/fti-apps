begin;

alter table platform.whatsapp_jobs drop constraint whatsapp_jobs_template_code_check;
alter table platform.whatsapp_jobs add constraint whatsapp_jobs_template_code_check check(template_code in (
 'fti_order_status_v1','fti_order_dispatch_v1','fti_support_reply_v1','fti_request_received_v1','fti_admin_request_v1',
 'fti_request_approved_v1','fti_request_rejected_v1','fti_request_update_v1','fti_category_quotation_v1'));

create or replace function internal.dispatch_whatsapp_details_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref text; details jsonb;
begin
 if not exists(select 1 from identity.profiles p where p.id=new.user_id and p.account_status='active'
  and p.whatsapp_updates_opt_in_at is not null and p.phone ~ '^\+[1-9][0-9]{7,14}$') then return new; end if;

 if new.payload->>'request_type'='material' and new.payload->>'request_state'='shipped' then
  select coalesce(nullif(btrim(r.details->>'reference'),''),r.id::text),to_jsonb(f) into ref,details
  from sales.raw_material_requests r join sales.request_fulfillments f on f.raw_request_id=r.id
  where r.id::text=new.payload->>'entity_id' and r.buyer_id=new.user_id and f.status='shipped';
 elsif new.payload->>'request_type'='fastener' and new.payload->>'request_state'='shipped' then
  select coalesce(nullif(btrim(r.details->>'reference'),''),r.id::text),to_jsonb(f) into ref,details
  from sales.fastener_requests r join sales.request_fulfillments f on f.fastener_request_id=r.id
  where r.id::text=new.payload->>'entity_id' and r.buyer_id=new.user_id and f.status='shipped';
 elsif new.payload->>'title' like 'Order % dispatched' then
  select o.order_no,to_jsonb(s) into ref,details
  from commerce.orders o join commerce.shipments s on s.order_id=o.id
  where o.id::text=new.payload->>'entity_id' and o.buyer_id=new.user_id and o.status='shipped'
  order by s.dispatched_at desc nulls last,s.id limit 1;
 end if;

 if ref is not null and details is not null then
  insert into platform.whatsapp_jobs(notification_id,user_id,template_code,parameters)
  values(new.id,new.user_id,'fti_order_dispatch_v1',jsonb_build_array(
   left(ref,100),
   left(coalesce(nullif(btrim(details->>'carrier'),''),'Not provided'),100),
   left(coalesce(nullif(btrim(details->>'tracking_number'),''),'Not provided'),100),
   left(coalesce(nullif(btrim(details->>'vehicle_number'),''),'Not provided'),100),
   left(coalesce(nullif(btrim(details->>'driver_name'),''),'Not provided'),100),
   left(coalesce(nullif(btrim(details->>'driver_phone'),''),'Not provided'),100)))
  on conflict(notification_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function internal.dispatch_whatsapp_details_enqueue() from public,anon,authenticated;

-- PostgreSQL runs same-event triggers alphabetically. Queue detailed dispatch
-- before the generic operations/request triggers; their conflict handling skips it.
drop trigger if exists dispatch_whatsapp_details_on_notice on platform.notifications;
create trigger dispatch_whatsapp_details_on_notice after insert on platform.notifications
for each row when (new.channel='in_app' and new.template_code='operations' and (
 (new.payload->>'request_type' in ('material','fastener') and new.payload->>'request_state'='shipped')
 or new.payload->>'title' like 'Order % dispatched'
)) execute function internal.dispatch_whatsapp_details_enqueue();

notify pgrst,'reload schema';
commit;
