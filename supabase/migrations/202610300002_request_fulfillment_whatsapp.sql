begin;

-- Fulfillment notices use structured request fields, not the commerce order title.
-- The existing operations trigger handles commerce/support/other request notices.
create or replace function internal.request_fulfillment_whatsapp_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref text; state text := new.payload->>'request_state';
begin
 if not exists (
  select 1 from identity.profiles p where p.id=new.user_id and p.account_status='active'
   and p.whatsapp_updates_opt_in_at is not null and p.phone ~ '^\+[1-9][0-9]{7,14}$'
 ) then return new; end if;

 -- Resolve the reference from the saved request and verify its buyer and state.
 -- Notification titles are display text and must not determine delivery routing.
 if new.payload->>'request_type'='material' then
  select coalesce(nullif(btrim(r.details->>'reference'),''),r.id::text) into ref
  from sales.raw_material_requests r join sales.request_fulfillments f on f.raw_request_id=r.id
  where r.id::text=new.payload->>'entity_id' and r.buyer_id=new.user_id and f.status=state;
 elsif new.payload->>'request_type'='fastener' then
  select coalesce(nullif(btrim(r.details->>'reference'),''),r.id::text) into ref
  from sales.fastener_requests r join sales.request_fulfillments f on f.fastener_request_id=r.id
  where r.id::text=new.payload->>'entity_id' and r.buyer_id=new.user_id and f.status=state;
 end if;

 if ref is not null then
  insert into platform.whatsapp_jobs(notification_id,user_id,template_code,parameters)
  values(new.id,new.user_id,'fti_order_status_v1',
   jsonb_build_array(left(ref,100),case state when 'shipped' then 'dispatched' else state end))
  on conflict(notification_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function internal.request_fulfillment_whatsapp_enqueue() from public,anon,authenticated;

drop trigger if exists request_fulfillment_whatsapp_on_notice on platform.notifications;
create trigger request_fulfillment_whatsapp_on_notice after insert on platform.notifications
for each row when (
 new.channel='in_app' and new.template_code='operations'
 and new.payload->>'request_type' in ('material','fastener')
 and new.payload->>'request_state' in ('confirmed','processing','shipped','delivered')
) execute function internal.request_fulfillment_whatsapp_enqueue();

-- Future updates only: do not replay historical statuses or contact opted-out buyers.
notify pgrst,'reload schema';
commit;
