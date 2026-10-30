begin;

-- Keep the existing two-parameter Meta template and its worker contract:
-- "FTI update for order {{1}}: {{2}}. Open the FTI app for details."
create or replace function internal.confirmation_whatsapp_total_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref text; total numeric; event_kind text; order_state text; status_text text;
begin
 if not exists(select 1 from identity.profiles p where p.id=new.user_id and p.account_status='active'
  and p.whatsapp_updates_opt_in_at is not null and p.phone ~ '^\+[1-9][0-9]{7,14}$') then return new; end if;

 if new.template_code='operations' and new.payload->>'request_state'='confirmed' then
  if new.payload->>'request_type'='material' then
   select coalesce(nullif(btrim(r.details->>'reference'),''),r.id::text),f.confirmed_total into ref,total
   from sales.raw_material_requests r join sales.request_fulfillments f on f.raw_request_id=r.id
   where r.id::text=new.payload->>'entity_id' and r.buyer_id=new.user_id and f.status='confirmed';
  elsif new.payload->>'request_type'='fastener' then
   select coalesce(nullif(btrim(r.details->>'reference'),''),r.id::text),f.confirmed_total into ref,total
   from sales.fastener_requests r join sales.request_fulfillments f on f.fastener_request_id=r.id
   where r.id::text=new.payload->>'entity_id' and r.buyer_id=new.user_id and f.status='confirmed';
  end if;
 elsif new.template_code='transactional' and new.event_id is not null then
  select e.event_type into event_kind from platform.outbox_events e where e.id=new.event_id;
  if event_kind='commerce.order.created' then
   -- Cart approval finalizes GST/delivery and moves the order to pending payment.
   select o.order_no,o.grand_total,o.status into ref,total,order_state
   from platform.outbox_events e join commerce.orders o on o.id=e.aggregate_id
   where e.id=new.event_id and e.aggregate_type='order' and o.buyer_id=new.user_id
    and o.status in ('pending_payment','confirmed','processing','partially_shipped','shipped','delivered');
  elsif event_kind='commerce.payment.verified' then
   -- The outbox aggregate and notification entity are the payment ID here.
   select o.order_no,o.grand_total,o.status into ref,total,order_state
   from platform.outbox_events e join commerce.payments p on p.id=e.aggregate_id
   join commerce.orders o on o.id=p.order_id
   where e.id=new.event_id and e.aggregate_type='payment' and p.status='successful'
    and o.buyer_id=new.user_id and o.status in ('confirmed','processing','partially_shipped','shipped','delivered');
  end if;
 end if;

 if ref is null or total is null or total<0 then return new; end if;
 status_text:='confirmed; total INR '||to_char(total,'FM999,999,999,999,999,999,990.00');
 if order_state='pending_payment' then status_text:=status_text||'; awaiting payment';
 elsif event_kind='commerce.payment.verified' then status_text:=status_text||'; payment verified'; end if;
 insert into platform.whatsapp_jobs(notification_id,user_id,template_code,parameters)
 values(new.id,new.user_id,'fti_order_status_v1',jsonb_build_array(left(ref,100),status_text))
 on conflict(notification_id) do nothing;
 return new;
end $$;
revoke all on function internal.confirmation_whatsapp_total_enqueue() from public,anon,authenticated;

-- Runs alphabetically before the generic operations/request triggers. Their
-- ON CONFLICT handling preserves this job, giving one message per notification.
drop trigger if exists confirmation_whatsapp_total_on_notice on platform.notifications;
create trigger confirmation_whatsapp_total_on_notice after insert on platform.notifications
for each row when (new.channel='in_app' and (
 (new.template_code='operations' and new.payload->>'request_type' in ('material','fastener') and new.payload->>'request_state'='confirmed')
 or (new.template_code='transactional' and new.event_id is not null)
)) execute function internal.confirmation_whatsapp_total_enqueue();

-- Future confirmations only. Previously queued/sent messages are left intact.
notify pgrst,'reload schema';
commit;
