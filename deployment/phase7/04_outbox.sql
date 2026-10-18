-- Idempotent transactional outbox projection into buyer in-app notifications.
begin;
alter table platform.notifications add column if not exists event_id uuid references platform.outbox_events(id);
create unique index if not exists uq_notification_event_channel_user on platform.notifications(event_id,channel,user_id) where event_id is not null;
alter table platform.outbox_events add column if not exists last_error text;
create index if not exists idx_outbox_ready on platform.outbox_events(next_attempt_at,created_at,id) where status='pending';

create function public.fti_operations_process_outbox(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event_row platform.outbox_events; recipient uuid; title text; processed int:=0; retried int:=0; dead int:=0;
begin
 for event_row in select * from platform.outbox_events where status='pending' and next_attempt_at<=now()
   order by next_attempt_at,created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) for update skip locked loop
  begin
   recipient:=null;title:=null;
   case event_row.event_type
    when 'sales.rfq.submitted' then
     select buyer_id into recipient from sales.rfqs where id=event_row.aggregate_id;
     title:='Your quotation request was received';
    when 'sales.quote.sent' then
     select r.buyer_id into recipient from sales.rfqs r where r.id=(event_row.payload->>'rfq_id')::uuid;
     title:='Your quotation is ready';
    when 'sales.quote.revision_requested' then
     select r.buyer_id into recipient from sales.quotations q join sales.rfqs r on r.id=q.rfq_id where q.id=event_row.aggregate_id;
     title:='Quotation revision requested';
    when 'sales.quote.accepted' then
     select r.buyer_id into recipient from sales.rfqs r where r.id=(event_row.payload->>'rfq_id')::uuid;
     title:='Quotation accepted';
    when 'commerce.order.created' then
     select buyer_id into recipient from commerce.orders where id=event_row.aggregate_id;
     title:='Your order was created';
    when 'commerce.payment.review_requested' then
     select o.buyer_id into recipient from commerce.orders o where o.id=(event_row.payload->>'order_id')::uuid;
     title:='Your transfer reference is under review';
    when 'commerce.payment.verified' then
     select o.buyer_id into recipient from commerce.orders o where o.id=(event_row.payload->>'order_id')::uuid;
     title:='Payment verified and order confirmed';
    when 'commerce.payment.rejected' then
     select o.buyer_id into recipient from commerce.orders o where o.id=(event_row.payload->>'order_id')::uuid;
     title:='Transfer reference needs attention';
    when 'commerce.order.expired' then
     select buyer_id into recipient from commerce.orders where id=event_row.aggregate_id;
     title:='Unpaid order reservation expired';
    else raise exception 'Unsupported event type';
   end case;
   if recipient is null then raise exception 'Event recipient unavailable'; end if;
   insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at,event_id)
   values(recipient,'in_app','transactional',jsonb_build_object('title',title,'entity_id',event_row.aggregate_id),'delivered',now(),event_row.id)
   on conflict(event_id,channel,user_id) where event_id is not null do nothing;
   update platform.outbox_events set status='enqueued',attempts=attempts+1,enqueued_at=now(),last_error=null where id=event_row.id;
   processed:=processed+1;
  exception when others then
   update platform.outbox_events set attempts=attempts+1,
    status=case when attempts+1>=5 then 'failed' else 'pending' end,
    next_attempt_at=now()+make_interval(mins=>least(60,(power(2,least(attempts,5)))::integer)),
    last_error=left(SQLSTATE||' '||SQLERRM,200) where id=event_row.id;
   if event_row.attempts+1>=5 then dead:=dead+1;else retried:=retried+1;end if;
  end;
 end loop;
 return jsonb_build_object('processed',processed,'retried',retried,'failed',dead);
end $$;
revoke all on function public.fti_operations_process_outbox(integer) from public,anon,authenticated;
grant execute on function public.fti_operations_process_outbox(integer) to service_role;

create function public.fti_operations_failed_events(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('operations.manage');
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') into result from
 (select id,event_type,attempts,last_error,created_at from platform.outbox_events where status='failed'
 order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) e;
 return result;
end $$;
create function public.fti_operations_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('operations.manage');
begin
 update platform.outbox_events set status='pending',attempts=0,next_attempt_at=now(),last_error=null where id=p_id and status='failed';
 if not found then raise exception 'Failed event unavailable' using errcode='42501'; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,'outbox.replayed','outbox_event',p_id);
end $$;
revoke all on function public.fti_operations_failed_events(integer),public.fti_operations_replay(uuid) from public,anon,authenticated;
grant execute on function public.fti_operations_failed_events(integer),public.fti_operations_replay(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
