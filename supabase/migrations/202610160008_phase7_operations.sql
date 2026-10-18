-- Phase 7: manual dispatch, support and transactional in-app updates. No demo data.
begin;
insert into identity.role_permissions(role_code,permission) values
 ('super_admin','operations.manage'),('order_manager','operations.manage'),
 ('super_admin','support.manage'),('sales_executive','support.manage') on conflict do nothing;
create table platform.support_tickets (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references identity.profiles(id),
 order_id uuid references commerce.orders(id), subject text not null check(length(subject) between 5 and 160),
 status text not null default 'open' check(status in ('open','resolved')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table platform.support_messages (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references platform.support_tickets(id),
 author_id uuid not null references identity.profiles(id), body text not null check(length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index idx_support_buyer on platform.support_tickets(buyer_id,created_at desc,id);
create index idx_support_queue on platform.support_tickets(status,created_at desc,id);
create index idx_support_thread on platform.support_messages(ticket_id,created_at,id);
alter table platform.support_tickets enable row level security;
alter table platform.support_messages enable row level security;
revoke all on platform.support_tickets,platform.support_messages from public,anon,authenticated;
alter table platform.notifications add column if not exists read_at timestamptz;
alter table commerce.shipments add column if not exists vehicle_number text;
alter table commerce.shipments add column if not exists delivery_note text;
create index if not exists idx_shipments_order on commerce.shipments(order_id);

create function internal.operations_notify(p_user uuid,p_title text,p_entity uuid) returns void
language sql security definer set search_path='' as $$
 insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at)
 values(p_user,'in_app','operations',jsonb_build_object('title',p_title,'entity_id',p_entity),'delivered',now());
$$;
revoke all on function internal.operations_notify(uuid,text,uuid) from public,anon,authenticated;

create function public.fti_operations_tickets(p_staff boolean default false,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); result jsonb;
begin
 if p_staff then perform internal.identity_staff('support.manage'); end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from
 (select t.* from platform.support_tickets t where p_staff or t.buyer_id=actor
 order by t.created_at desc,t.id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) t;
 return result;
end $$;
create function public.fti_operations_ticket_create(p_subject text,p_body text,p_order uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); tid uuid;
begin
 if p_subject is null or length(trim(p_subject)) not between 5 and 160 or p_body is null or length(trim(p_body)) not between 1 and 4000 then
 raise exception 'Enter a subject (5-160 characters) and message (1-4000 characters)' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,71));
 if (select count(*) from platform.support_tickets where buyer_id=actor and status='open')>=20 then
 raise exception 'Resolve an existing ticket before opening more (20 open tickets maximum)' using errcode='22023'; end if;
 if p_order is not null and not exists(select 1 from commerce.orders where id=p_order and buyer_id=actor) then
 raise exception 'Order unavailable' using errcode='42501'; end if;
 insert into platform.support_tickets(buyer_id,order_id,subject) values(actor,p_order,trim(p_subject)) returning id into tid;
 insert into platform.support_messages(ticket_id,author_id,body) values(tid,actor,trim(p_body));
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'support.created','ticket',tid);
 return tid;
end $$;
create function public.fti_operations_thread(p_ticket uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); owner_id uuid; result jsonb;
begin
 select buyer_id into owner_id from platform.support_tickets where id=p_ticket;
 if owner_id is null then raise exception 'Ticket unavailable' using errcode='42501'; end if;
 if owner_id<>actor then perform internal.identity_staff('support.manage'); end if;
 select coalesce(jsonb_agg(to_jsonb(m)),'[]') into result from
 (select id,author_id,body,created_at from platform.support_messages where ticket_id=p_ticket
 order by created_at,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) m;
 return result;
end $$;
create function public.fti_operations_reply(p_ticket uuid,p_body text,p_resolve boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); t platform.support_tickets;
begin
 select * into t from platform.support_tickets where id=p_ticket for update;
 if t.id is null then raise exception 'Ticket unavailable' using errcode='42501'; end if;
 if t.buyer_id<>actor or p_resolve then perform internal.identity_staff('support.manage'); end if;
 if t.status='resolved' then raise exception 'Ticket is already resolved; open a new ticket for further help' using errcode='22023'; end if;
 if p_body is null or length(trim(p_body)) not between 1 and 4000 then raise exception 'Message must contain 1-4000 characters' using errcode='22023'; end if;
 insert into platform.support_messages(ticket_id,author_id,body) values(t.id,actor,trim(p_body));
 update platform.support_tickets set status=case when p_resolve then 'resolved' else status end,updated_at=now() where id=t.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,case when p_resolve then 'support.resolved' else 'support.replied' end,'ticket',t.id,jsonb_build_object('resolved',p_resolve));
 if actor<>t.buyer_id then perform internal.operations_notify(t.buyer_id,case when p_resolve then 'Support ticket resolved' else 'New support reply' end,t.id); end if;
end $$;
create function public.fti_operations_orders(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('operations.manage');
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into result from
 (select id,order_no,status,created_at from commerce.orders where status in ('confirmed','processing','shipped','delivered')
 order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) o;
 return result;
end $$;
create function public.fti_operations_shipments(p_order uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); owner_id uuid; result jsonb;
begin
 select buyer_id into owner_id from commerce.orders where id=p_order;
 if owner_id is null then raise exception 'Order unavailable' using errcode='42501'; end if;
 if owner_id<>actor then perform internal.identity_staff('operations.manage'); end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at),'[]') into result from commerce.shipments s where order_id=p_order;
 return result;
end $$;
create function public.fti_operations_dispatch(p_order uuid,p_carrier text,p_tracking text,p_vehicle text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('operations.manage'); o commerce.orders; sid uuid;
begin
 if p_carrier is null or length(trim(p_carrier)) not between 2 and 120 or p_tracking is null or length(trim(p_tracking)) not between 2 and 120
 or length(coalesce(p_vehicle,''))>40 then raise exception 'Enter carrier and LR/tracking reference (2-120 characters)' using errcode='22023'; end if;
 select * into o from commerce.orders where id=p_order for update;
 if o.id is null or o.status not in ('confirmed','processing') or o.amount_due<>0 then
 raise exception 'Only a confirmed, fully paid order can be dispatched' using errcode='22023'; end if;
 if exists(select 1 from commerce.shipments where order_id=p_order) then raise exception 'Shipment already exists' using errcode='22023'; end if;
 insert into commerce.shipments(order_id,carrier,tracking_number,vehicle_number,status,dispatched_at)
 values(o.id,trim(p_carrier),trim(p_tracking),nullif(trim(p_vehicle),''),'dispatched',now()) returning id into sid;
 update commerce.orders set status='shipped',updated_at=now() where id=o.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'order.dispatched','order',o.id,jsonb_build_object('shipment_id',sid,'tracking',trim(p_tracking)));
 perform internal.operations_notify(o.buyer_id,'Order '||o.order_no||' dispatched',o.id);
 return sid;
end $$;
create function public.fti_operations_deliver(p_order uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('operations.manage'); o commerce.orders;
begin
 if p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Enter delivery evidence/reference (5-1000 characters)' using errcode='22023'; end if;
 select * into o from commerce.orders where id=p_order for update;
 if o.id is null or o.status<>'shipped' then raise exception 'Only a shipped order can be delivered' using errcode='22023'; end if;
 update commerce.shipments set status='delivered',delivered_at=now(),delivery_note=trim(p_note) where order_id=o.id and status='dispatched';
 if not found then raise exception 'No dispatched shipment found' using errcode='22023'; end if;
 update commerce.orders set status='delivered',updated_at=now() where id=o.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'order.delivered','order',o.id,jsonb_build_object('note',trim(p_note)));
 perform internal.operations_notify(o.buyer_id,'Order '||o.order_no||' delivered',o.id);
end $$;
create function public.fti_operations_notifications(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(n)),'[]') into result from
 (select id,payload,read_at,created_at from platform.notifications where user_id=actor and channel='in_app'
 order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) n;
 return result;
end $$;
create function public.fti_operations_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor();
begin
 update platform.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=actor and channel='in_app';
 if not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
end $$;
create function public.fti_operations_report() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('operations.manage');
 return jsonb_build_object('orders_by_status',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from commerce.orders group by status) a),
 'open_tickets',(select count(*) from platform.support_tickets where status='open'),
 'transfers_awaiting_review',(select count(*) from commerce.payments where status='review'),
 'failed_outbox_events',(select count(*) from platform.outbox_events where status='failed'));
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'fti_operations_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
