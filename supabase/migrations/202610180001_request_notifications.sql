-- Request receipts, staff alerts and decisions. Uses the existing consent-gated worker.
begin;
alter table platform.whatsapp_jobs drop constraint whatsapp_jobs_template_code_check;
alter table platform.whatsapp_jobs add constraint whatsapp_jobs_template_code_check check(template_code in (
 'fti_order_status_v1','fti_support_reply_v1','fti_request_received_v1','fti_admin_request_v1',
 'fti_request_approved_v1','fti_request_rejected_v1','fti_request_update_v1'));

create function internal.request_notice(p_user uuid,p_kind text,p_entity uuid,p_state text,p_detail text default null,p_permission text default null) returns void
language sql security definer set search_path='' as $$
 insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at)
 select p_user,'in_app','request_updates',jsonb_build_object(
  'title',case p_state when 'new' then 'New '||p_kind||' request'
   when 'received' then 'Your '||p_kind||' request was received'
   when 'approved' then 'Your '||p_kind||' request was approved'
   when 'rejected' then 'Your '||p_kind||' request was rejected'
   else 'Your '||p_kind||' request: '||coalesce(p_detail,p_state) end,
  'request_type',p_kind,'entity_id',p_entity,'request_state',p_state,
  'detail',coalesce(p_detail,p_state),'request_permission',p_permission),'delivered',now()
 where exists(select 1 from identity.profiles where id=p_user and account_status='active');
$$;

create function internal.request_staff(p_permission text,p_applicant uuid,p_kind text,p_entity uuid) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 for recipient in select p.id from identity.profiles p where p.account_status='active' and p.id is distinct from p_applicant
  and exists(select 1 from identity.user_roles r join identity.role_permissions rp on rp.role_code=r.role_code
   where r.user_id=p.id and rp.permission=p_permission)
  and exists(select 1 from identity.user_roles r join identity.role_permissions rp on rp.role_code=r.role_code
   where r.user_id=p.id and rp.permission='staff.access')
  and not (p_kind='business verification' and exists(select 1 from identity.business_members m
   where m.business_id=p_entity and m.user_id=p.id and m.status='active')) loop
  perform internal.request_notice(recipient,p_kind,p_entity,'new',null,p_permission);
 end loop;
end $$;

-- Existing sales/commerce outbox processing already creates applicant notices.
-- Add staff recipients without creating a second applicant receipt.
create function internal.request_outbox_staff() returns trigger
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
  when 'commerce.order.created' then
   select buyer_id into applicant from commerce.orders where id=new.aggregate_id;
   permission:='order.manage';kind:='order';
  when 'commerce.payment.review_requested' then
   select o.buyer_id into applicant from commerce.payments p join commerce.orders o on o.id=p.order_id where p.id=new.aggregate_id;
   permission:='payment.review';kind:='payment review';
  else return new;
 end case;
 if applicant is not null then perform internal.request_staff(permission,applicant,kind,new.aggregate_id); end if;
 return new;
end $$;
create trigger request_outbox_staff after insert on platform.outbox_events for each row execute function internal.request_outbox_staff();

-- Identity, support and marketplace have no matching outbox projection.
-- These notices commit or roll back with the request's own transaction.
create function internal.request_table_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_row jsonb:=to_jsonb(new); previous jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 applicant uuid; entity uuid; kind text; permission text; state text; detail text; seller uuid;
begin
 entity:=(current_row->>'id')::uuid;
 case tg_table_schema||'.'||tg_table_name
  when 'identity.businesses' then
   applicant:=new.submitted_by;kind:='business verification';permission:='business.review';
   if new.verification_status='pending' and (tg_op='INSERT' or new.revision is distinct from old.revision) then state:='received';
   elsif new.verification_status is distinct from previous->>'verification_status' then
    state:=case new.verification_status when 'verified' then 'approved' when 'rejected' then 'rejected' end;
   end if;
  when 'identity.deletion_requests' then
   applicant:=new.user_id;entity:=new.user_id;kind:='account deletion';permission:='operations.manage';
   if tg_op='INSERT' then state:='received';
   elsif new.status is distinct from old.status then state:='update';detail:=new.status; end if;
  when 'platform.support_tickets' then
   applicant:=new.buyer_id;kind:='support';permission:='support.manage';
   if tg_op='INSERT' then state:='received';
   end if;
  when 'marketplace.listings' then
   applicant:=new.seller_id;kind:='stock listing';permission:='stock.review';
   if new.status is distinct from previous->>'status' then
    state:=case new.status when 'submitted' then 'received' when 'published' then 'approved'
     when 'rejected' then 'rejected' when 'withdrawn' then 'update' when 'sold' then 'update' end;
    detail:=new.status;
   end if;
  when 'marketplace.enquiries' then
   applicant:=new.buyer_id;kind:='stock enquiry';permission:='stock.review';
   select seller_id into seller from marketplace.listings where id=new.listing_id;
   if tg_op='INSERT' then
    state:='received';
    if seller<>applicant then perform internal.request_notice(seller,kind,entity,'update','new buyer enquiry'); end if;
   elsif new.status is distinct from old.status then
    state:='update';detail:=new.status;
    if seller<>applicant then perform internal.request_notice(seller,kind,entity,state,detail); end if;
   end if;
  when 'sales.rfqs' then
   applicant:=new.buyer_id;kind:='quotation';
   if new.status='rejected' and new.status is distinct from old.status then state:='rejected'; end if;
  else return new;
 end case;
 if applicant is not null and state is not null then
  perform internal.request_notice(applicant,kind,entity,state,detail);
  if state='received' then perform internal.request_staff(permission,applicant,kind,entity); end if;
 end if;
 return new;
end $$;
create trigger request_business_notice after insert or update on identity.businesses for each row execute function internal.request_table_notice();
create trigger request_deletion_notice after insert or update on identity.deletion_requests for each row execute function internal.request_table_notice();
create trigger request_support_notice after insert on platform.support_tickets for each row execute function internal.request_table_notice();
create trigger request_stock_notice after insert or update on marketplace.listings for each row execute function internal.request_table_notice();
create trigger request_enquiry_notice after insert or update on marketplace.enquiries for each row execute function internal.request_table_notice();
create trigger request_rfq_rejection after update on sales.rfqs for each row execute function internal.request_table_notice();

create function internal.request_message_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare applicant uuid; seller uuid;
begin
 if tg_table_schema='marketplace' then
  select e.buyer_id,l.seller_id into applicant,seller from marketplace.enquiries e join marketplace.listings l on l.id=e.listing_id where e.id=new.enquiry_id;
  -- The initial message is covered by the enquiry receipt and seller alert.
  if exists(select 1 from marketplace.messages where enquiry_id=new.enquiry_id and id<>new.id) and not new.closed_enquiry then
   if new.author_id<>applicant then perform internal.request_notice(applicant,'stock enquiry',new.enquiry_id,'update','new reply'); end if;
   if new.author_id<>seller and seller<>applicant then perform internal.request_notice(seller,'stock enquiry',new.enquiry_id,'update','new reply'); end if;
  end if;
 else
  select buyer_id into applicant from platform.support_tickets where id=new.ticket_id;
  if new.author_id=applicant and exists(select 1 from platform.support_messages where ticket_id=new.ticket_id and id<>new.id) then
   perform internal.request_staff('support.manage',applicant,'support reply',new.ticket_id);
  end if;
 end if;
 return new;
end $$;
create trigger request_stock_message after insert on marketplace.messages for each row execute function internal.request_message_notice();
create trigger request_support_message after insert on platform.support_messages for each row execute function internal.request_message_notice();

create or replace function internal.operations_whatsapp_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare template text; params jsonb; ref text; status_text text; kind text; event_type text; state text;
begin
 if new.channel<>'in_app' or not exists(select 1 from identity.profiles p where p.id=new.user_id
  and p.account_status='active' and p.whatsapp_updates_opt_in_at is not null) then return new; end if;
 if new.template_code='request_updates' then
  kind:=new.payload->>'request_type';ref:=new.payload->>'entity_id';state:=new.payload->>'request_state';
  template:=case state when 'new' then 'fti_admin_request_v1' when 'received' then 'fti_request_received_v1'
   when 'approved' then 'fti_request_approved_v1' when 'rejected' then 'fti_request_rejected_v1' else 'fti_request_update_v1' end;
  params:=jsonb_build_array(kind,ref);
  if template='fti_request_update_v1' then params:=params||jsonb_build_array(new.payload->>'detail'); end if;
 elsif new.template_code='operations' and new.payload->>'title'='New support reply' then
  template:='fti_support_reply_v1';params:=jsonb_build_array(left(new.payload->>'entity_id',8));
 elsif new.template_code='operations' and new.payload->>'title'='Support ticket resolved' then
  template:='fti_request_update_v1';params:=jsonb_build_array('support',new.payload->>'entity_id','resolved');
 elsif new.template_code='operations' and new.payload->>'title' like 'Order %' and
  (new.payload->>'title' like '% dispatched' or new.payload->>'title' like '% delivered') then
  select order_no,status into ref,status_text from commerce.orders where id=(new.payload->>'entity_id')::uuid;
  template:='fti_order_status_v1';params:=jsonb_build_array(ref,status_text);
 elsif new.template_code='transactional' and new.event_id is not null then
  select e.event_type into event_type from platform.outbox_events e where e.id=new.event_id;
  ref:=new.payload->>'entity_id';
  case event_type
   when 'sales.rfq.submitted' then kind:='quotation';state:='received';
   when 'sales.quote.sent' then kind:='quotation';state:='update';status_text:='quotation ready';
   when 'sales.quote.revision_requested' then kind:='quotation revision';state:='received';
   when 'sales.quote.accepted' then kind:='quotation';state:='update';status_text:='accepted';
   when 'commerce.payment.review_requested' then kind:='payment review';state:='received';
   when 'commerce.payment.verified' then kind:='payment review';state:='approved';
   when 'commerce.payment.rejected' then kind:='payment review';state:='rejected';
   else
    select o.order_no,case event_type when 'commerce.order.created' then 'created' when 'commerce.order.expired' then 'reservation expired' end
    into ref,status_text from commerce.orders o where o.id=(new.payload->>'entity_id')::uuid;
    if status_text is not null then template:='fti_order_status_v1';params:=jsonb_build_array(ref,status_text); end if;
  end case;
  if kind is not null then
   template:=case state when 'received' then 'fti_request_received_v1' when 'approved' then 'fti_request_approved_v1'
    when 'rejected' then 'fti_request_rejected_v1' else 'fti_request_update_v1' end;
   params:=jsonb_build_array(kind,ref);
   if state='update' then params:=params||jsonb_build_array(status_text); end if;
  end if;
 end if;
 if template is not null then
  insert into platform.whatsapp_jobs(notification_id,user_id,template_code,parameters)
  values(new.id,new.user_id,template,params) on conflict(notification_id) do nothing;
 end if;
 return new;
end $$;

-- Recheck active account, consent and current staff authorization immediately before sending.
create or replace function public.fti_operations_whatsapp_can_send(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from platform.whatsapp_jobs j join identity.profiles p on p.id=j.user_id
  join platform.notifications n on n.id=j.notification_id
  where j.id=p_id and j.status='claimed' and p.account_status='active' and p.whatsapp_updates_opt_in_at is not null
   and p.phone ~ '^\+[1-9][0-9]{7,14}$'
   and (j.template_code<>'fti_admin_request_v1' or (
    exists(select 1 from identity.user_roles r join identity.role_permissions rp on rp.role_code=r.role_code
     where r.user_id=p.id and rp.permission=n.payload->>'request_permission') and
    exists(select 1 from identity.user_roles r join identity.role_permissions rp on rp.role_code=r.role_code
     where r.user_id=p.id and rp.permission='staff.access'))))
$$;
revoke all on function internal.request_notice(uuid,text,uuid,text,text,text),internal.request_staff(text,uuid,text,uuid),
 internal.request_outbox_staff(),internal.request_table_notice(),internal.request_message_notice() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
