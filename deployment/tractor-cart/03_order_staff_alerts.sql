-- Notify all active staff as soon as a new order commits, including cart requests.
-- Requires the existing request-notification migration (202610180001).
begin;

do $$ begin
 if to_regprocedure('internal.request_staff(text,uuid,text,uuid)') is null then
   raise exception 'Deploy the request-notification migration before order staff alerts.';
 end if;
end $$;

create function internal.order_all_staff_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform internal.request_staff('staff.access',null,'order',new.id);
 return new;
end $$;
revoke all on function internal.order_all_staff_notice() from public,anon,authenticated;
create trigger order_all_staff_notice after insert on commerce.orders
for each row execute function internal.order_all_staff_notice();

-- The table trigger now handles order alerts. Keep existing sales/payment alerts,
-- and avoid notifying staff a second time when a cart order is confirmed.
create or replace function internal.request_outbox_staff() returns trigger
language plpgsql security definer set search_path='' as $$
declare applicant uuid; permission text; kind text;
begin
 case new.event_type
  when 'sales.rfq.submitted' then
   select buyer_id into applicant from sales.rfqs where id=new.aggregate_id;
   permission:='sales.manage';kind:='quotation';
  when 'sales.quote.revision_requested' then
   select r.buyer_id into applicant from sales.quotations q join sales.rfqs r on r.id=q.rfq_id where q.id=new.aggregate_id;
   permission:='sales.manage';kind:='quotation revision';
  when 'sales.quote.accepted' then
   select r.buyer_id into applicant from sales.quotations q join sales.rfqs r on r.id=q.rfq_id where q.id=new.aggregate_id;
   permission:='sales.manage';kind:='quotation acceptance';
  when 'commerce.payment.review_requested' then
   select o.buyer_id into applicant from commerce.payments p join commerce.orders o on o.id=p.order_id where p.id=new.aggregate_id;
   permission:='payment.review';kind:='payment review';
  else return new;
 end case;
 if applicant is not null then perform internal.request_staff(permission,applicant,kind,new.aggregate_id); end if;
 return new;
end $$;
commit;
