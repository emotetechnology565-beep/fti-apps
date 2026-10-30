begin;

alter table commerce.orders drop constraint orders_status_check;
alter table commerce.orders add constraint orders_status_check check(status in (
 'pending_confirmation','pending_payment','confirmed','processing','partially_shipped',
 'shipped','delivered','cancelled','rejected','refunded'));
alter table commerce.orders add column closure_note text;
alter table sales.request_fulfillments drop constraint request_fulfillments_status_check;
alter table sales.request_fulfillments add constraint request_fulfillments_status_check
 check(status in ('pending_confirmation','confirmed','processing','shipped','delivered','cancelled','rejected'));
alter table sales.request_fulfillments add column closure_note text;
-- Pending requests can close without ever receiving a confirmed price.
do $$ declare constraint_name text; begin
 select conname into constraint_name from pg_catalog.pg_constraint
 where conrelid='sales.request_fulfillments'::regclass and contype='c'
 and pg_catalog.pg_get_constraintdef(oid) like '%confirmed_total%confirmation_note%';
 if constraint_name is not null then
  execute format('alter table sales.request_fulfillments drop constraint %I',constraint_name);
 end if;
end $$;
alter table sales.request_fulfillments add constraint request_fulfillments_confirmation_check
 check(status in ('pending_confirmation','cancelled','rejected') or (confirmed_total>0 and confirmation_note is not null));

-- Lock the same parent rows as confirmation, payment review and dispatch. A stale
-- client cannot cancel an order after another transaction starts processing it.
create function public.fti_order_close(p_kind text,p_id uuid,p_action text,p_expected_status text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); buyer uuid; current_status text;
 target text; note text; o commerce.orders; f sales.request_fulfillments; reservation record;
begin
 if p_kind is null or p_kind not in ('commerce','material','fastener') or p_id is null
 or p_action is null or p_action not in ('cancel','reject') or p_expected_status is null then
  raise exception 'Choose a valid order and action' using errcode='22023';
 end if;
 if p_action='reject' then
  perform internal.identity_staff('order.manage');
  note:=btrim(p_note);
  if coalesce(length(note),0) not between 5 and 1000 then
   raise exception 'Enter a rejection reason (5-1000 characters)' using errcode='22023';
  end if;
  target:='rejected';
 else
  if internal.identity_permission('staff.access') then
   raise exception 'Staff can reject orders; customer cancellation is not permitted' using errcode='42501';
  end if;
  target:='cancelled'; note:='Cancelled by customer before processing';
 end if;
 if p_kind='commerce' then
  select * into o from commerce.orders where id=p_id for update;
  buyer:=o.buyer_id; current_status:=o.status;
 elsif p_kind='material' then
  select buyer_id into buyer from sales.raw_material_requests where id=p_id for update;
 else
  select buyer_id into buyer from sales.fastener_requests where id=p_id for update;
 end if;
 if buyer is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if p_action='cancel' and buyer<>actor then raise exception 'Order access denied' using errcode='42501'; end if;
 if p_kind<>'commerce' then
  if p_kind='material' then
   insert into sales.request_fulfillments(raw_request_id) values(p_id) on conflict(raw_request_id) do nothing;
   select * into f from sales.request_fulfillments where raw_request_id=p_id for update;
  else
   insert into sales.request_fulfillments(fastener_request_id) values(p_id) on conflict(fastener_request_id) do nothing;
   select * into f from sales.request_fulfillments where fastener_request_id=p_id for update;
  end if;
  current_status:=f.status;
 end if;
 if current_status<>p_expected_status then raise exception 'Order changed. Refresh before continuing' using errcode='40001'; end if;
 if current_status not in ('pending_confirmation','pending_payment','confirmed')
 and not (p_action='reject' and current_status='processing') then
  raise exception 'This order cannot be cancelled or rejected at this stage. Contact FTI admin for assistance' using errcode='22023';
 end if;
 if p_kind='commerce' then
  -- Unpaid orders hold reservations; paid orders have consumed allocations.
  -- Payments remain intact for accounts to reconcile/refund separately.
  for reservation in select r.* from commerce.stock_reservations r
   join commerce.order_items i on i.id=r.order_item_id where i.order_id=p_id
   and r.status in ('active','consumed') order by r.variant_id,r.stock_location_id,r.id for update of r loop
   if reservation.status='active' then
    update commerce.inventory set reserved=reserved-reservation.qty,updated_at=now()
     where variant_id=reservation.variant_id and stock_location_id=reservation.stock_location_id and reserved>=reservation.qty;
   else
    update commerce.inventory set on_hand=on_hand+reservation.qty,updated_at=now()
     where variant_id=reservation.variant_id and stock_location_id=reservation.stock_location_id;
    if not found then raise exception 'Inventory reservation is inconsistent' using errcode='22023'; end if;
    insert into commerce.inventory_movements(variant_id,stock_location_id,qty_delta,reason,external_ref,performed_by)
     values(reservation.variant_id,reservation.stock_location_id,reservation.qty,'Order '||target||'; allocation returned',o.order_no,actor);
   end if;
   if not found then raise exception 'Inventory reservation is inconsistent' using errcode='22023'; end if;
   update commerce.stock_reservations set status='released' where id=reservation.id;
  end loop;
  update commerce.orders set status=target,closure_note=note,updated_at=now() where id=p_id;
 else
  update sales.request_fulfillments set status=target,closure_note=note,revision=revision+1,
   history=history||jsonb_build_array(jsonb_build_object('status',target,'at',now(),'actor_id',actor,'note',note)),updated_at=now() where id=f.id;
 end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
  values(actor,'order.'||target,p_kind||'_order',p_id,jsonb_build_object('status',current_status),jsonb_build_object('status',target,'note',note));
 insert into platform.notifications(user_id,channel,template_code,payload,status,delivered_at)
  values(buyer,'in_app','operations',jsonb_build_object('title','Order '||target,'entity_id',p_id,'request_type',p_kind,'request_state',target,'note',note),'delivered',now());
 return jsonb_build_object('status',target);
end $$;
revoke all on function public.fti_order_close(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fti_order_close(text,uuid,text,text,text) to authenticated;
create or replace function public.fti_customer_orders(p_offset integer default 0, p_search text default '', p_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); result jsonb;
begin
 with ledger as (
  select o.id, 'commerce'::text as kind, o.order_no as reference, o.status,
   o.created_at, o.grand_total::text as total, o.amount_due::text as amount_due,
   jsonb_build_object('material','Parts / quotation order','location',concat_ws(', ',o.delivery_address_snapshot->>'line1',o.delivery_address_snapshot->>'city')) as details,
   jsonb_build_object('closure_note',o.closure_note) as fulfillment
  from commerce.orders o where o.buyer_id=actor
  union all
  select q.id, 'material', q.details->>'reference', coalesce(f.status,'pending_confirmation'), q.created_at,
   f.confirmed_total::text, null, q.details,
   jsonb_build_object('closure_note',f.closure_note,'history',f.history,'driver_name',f.driver_name,'driver_phone',f.driver_phone,'carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'confirmation_note',f.confirmation_note,'delivery_note',f.delivery_note)
  from sales.raw_material_requests q left join sales.request_fulfillments f on f.raw_request_id=q.id where q.buyer_id=actor
  union all
  select q.id, 'fastener', q.details->>'reference', coalesce(f.status,'pending_confirmation'), q.created_at,
   f.confirmed_total::text, null, q.details,
   jsonb_build_object('closure_note',f.closure_note,'history',f.history,'driver_name',f.driver_name,'driver_phone',f.driver_phone,'carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'confirmation_note',f.confirmation_note,'delivery_note',f.delivery_note)
  from sales.fastener_requests q left join sales.request_fulfillments f on f.fastener_request_id=q.id where q.buyer_id=actor
 ), filtered as (
  select * from ledger where
   (coalesce(p_status,'all')='all' or status=p_status or (p_status='active' and status not in ('delivered','cancelled','rejected','expired','refunded')))
   and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',reference,details->>'material',details->>'grade',details->>'size',fulfillment->>'tracking_number')),lower(left(p_search,200)))>0)
 ), page as (select * from filtered order by created_at desc,id,kind limit 24 offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'orders',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id,kind) from page),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.fti_order_decision_queue(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
  select id,order_no,status,created_at from commerce.orders
  where status in ('pending_confirmation','pending_payment','confirmed','processing')
  order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))
 ) q),'[]'::jsonb);
end $$;
revoke all on function public.fti_order_decision_queue(integer) from public,anon,authenticated;
grant execute on function public.fti_order_decision_queue(integer) to authenticated;
notify pgrst,'reload schema';
commit;
