begin;

create table commerce.order_receipts (
 id uuid primary key,
 commerce_order_id uuid references commerce.orders(id),
 raw_request_id uuid references sales.raw_material_requests(id),
 fastener_request_id uuid references sales.fastener_requests(id),
 amount numeric(20,2) not null check(amount>0),
 reference text not null check(length(btrim(reference)) between 5 and 120),
 recorded_by uuid not null references identity.profiles(id),
 created_at timestamptz not null default now(),
 check(num_nonnulls(commerce_order_id,raw_request_id,fastener_request_id)=1)
);
create index order_receipts_commerce on commerce.order_receipts(commerce_order_id,created_at);
create index order_receipts_raw on commerce.order_receipts(raw_request_id,created_at);
create index order_receipts_fastener on commerce.order_receipts(fastener_request_id,created_at);
create unique index order_receipts_reference on commerce.order_receipts(
 (case when commerce_order_id is not null then 'commerce' when raw_request_id is not null then 'material' else 'fastener' end),
 coalesce(commerce_order_id,raw_request_id,fastener_request_id),lower(btrim(reference)));
alter table commerce.order_receipts enable row level security;
revoke all on commerce.order_receipts from public,anon,authenticated;

create function internal.order_payment_summary(p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare total numeric; paid numeric:=0; state text; receipts jsonb;
begin
 if p_kind='commerce' then
  select case when status='pending_confirmation' then null else grand_total end,
   grand_total-amount_due,status into total,paid,state from commerce.orders where id=p_id;
 elsif p_kind in ('material','fastener') then
  select confirmed_total,status into total,state from sales.request_fulfillments
   where (p_kind='material' and raw_request_id=p_id) or (p_kind='fastener' and fastener_request_id=p_id);
  select coalesce(sum(amount),0) into paid from commerce.order_receipts
   where (p_kind='material' and raw_request_id=p_id) or (p_kind='fastener' and fastener_request_id=p_id);
 else raise exception 'Invalid order type' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount::text,'reference',reference,'at',created_at) order by created_at,id),'[]'::jsonb)
 into receipts from commerce.order_receipts where (p_kind='commerce' and commerce_order_id=p_id)
 or (p_kind='material' and raw_request_id=p_id) or (p_kind='fastener' and fastener_request_id=p_id);
 return jsonb_build_object('total',total::text,'paid',coalesce(paid,0)::text,
  'remaining',case when total is null then null else greatest(0,total-coalesce(paid,0))::text end,
  'status',coalesce(state,'pending_confirmation'),'receipts',receipts);
end $$;
revoke all on function internal.order_payment_summary(text,uuid) from public,anon,authenticated;

create function public.fti_order_payments(p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); buyer uuid;
begin
 if p_kind='commerce' then select buyer_id into buyer from commerce.orders where id=p_id;
 elsif p_kind='material' then select buyer_id into buyer from sales.raw_material_requests where id=p_id;
 elsif p_kind='fastener' then select buyer_id into buyer from sales.fastener_requests where id=p_id;
 else raise exception 'Invalid order type' using errcode='22023'; end if;
 if buyer is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if buyer<>actor then
  if internal.identity_permission('order.manage') then perform internal.identity_staff('order.manage');
  elsif internal.identity_permission('payment.review') then perform internal.identity_staff('payment.review');
  else perform internal.identity_staff('operations.manage'); end if;
 end if;
 return internal.order_payment_summary(p_kind,p_id);
end $$;

create function internal.record_order_receipt(p_kind text,p_id uuid,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid; receipt_id uuid; amount_text text; amount numeric; reference text;
 existing commerce.order_receipts; o commerce.orders; f sales.request_fulfillments;
 buyer uuid; summary jsonb; reservation record;
begin
 amount_text:=nullif(btrim(p_details->>'payment_amount'),'');
 if amount_text is null then return; end if;
 actor:=internal.identity_staff('payment.review');
 if amount_text !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$' or amount_text::numeric<=0
 or coalesce(p_details->>'payment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(length(btrim(p_details->>'payment_reference')),0) not between 5 and 120 then
  raise exception 'Enter a positive payment amount, a receipt ID and a reference (5-120 characters)' using errcode='22023';
 end if;
 receipt_id:=(p_details->>'payment_id')::uuid; amount:=amount_text::numeric; reference:=btrim(p_details->>'payment_reference');
 -- Serialize payments with confirmation, closure, bank review and dispatch.
 if p_kind='commerce' then
  select * into o from commerce.orders where id=p_id for update; buyer:=o.buyer_id;
 elsif p_kind='material' then
  select buyer_id into buyer from sales.raw_material_requests where id=p_id for update;
  select * into f from sales.request_fulfillments where raw_request_id=p_id for update;
 elsif p_kind='fastener' then
  select buyer_id into buyer from sales.fastener_requests where id=p_id for update;
  select * into f from sales.request_fulfillments where fastener_request_id=p_id for update;
 else raise exception 'Invalid order type' using errcode='22023'; end if;
 if buyer is null then raise exception 'Order not found' using errcode='P0002'; end if;
 select * into existing from commerce.order_receipts where id=receipt_id;
 if found then
  if existing.amount<>amount or existing.reference<>reference
  or (p_kind='commerce' and existing.commerce_order_id is distinct from p_id)
  or (p_kind='material' and existing.raw_request_id is distinct from p_id)
  or (p_kind='fastener' and existing.fastener_request_id is distinct from p_id) then
   raise exception 'Receipt ID already used for a different payment' using errcode='23505';
  end if;
  return;
 end if;
 summary:=internal.order_payment_summary(p_kind,p_id);
 if summary->>'total' is null or summary->>'status' not in ('pending_payment','confirmed','processing','shipped','delivered') then
  raise exception 'Confirm the order before recording payment; closed orders cannot receive payments' using errcode='22023';
 end if;
 if amount>(summary->>'remaining')::numeric then raise exception 'Payment exceeds the remaining amount' using errcode='22023'; end if;
 if p_kind='commerce' then
  if exists(select 1 from commerce.payments where order_id=p_id and status in ('review','processing')) then
   raise exception 'Resolve the pending payment review before recording another receipt' using errcode='22023';
  end if;
  if not exists(select 1 from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id where i.order_id=p_id)
  or exists(select 1 from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
   where i.order_id=p_id and (r.status<>'active' or r.expires_at<=now())) then
   raise exception 'Stock reservation expired; payment requires manual resolution' using errcode='22023';
  end if;
  if amount=o.amount_due then
   for reservation in select r.* from commerce.stock_reservations r join commerce.order_items i on i.id=r.order_item_id
    where i.order_id=p_id and r.status='active' order by r.variant_id,r.stock_location_id,r.id for update of r loop
    update commerce.inventory set on_hand=on_hand-reservation.qty,reserved=reserved-reservation.qty,updated_at=now()
     where variant_id=reservation.variant_id and stock_location_id=reservation.stock_location_id and reserved>=reservation.qty;
    if not found then raise exception 'Inventory reservation is inconsistent' using errcode='22023'; end if;
    update commerce.stock_reservations set status='consumed' where id=reservation.id;
    insert into commerce.inventory_movements(variant_id,stock_location_id,qty_delta,reason,external_ref,performed_by)
     values(reservation.variant_id,reservation.stock_location_id,-reservation.qty,'Manual payment verified; stock allocated',o.order_no,actor);
   end loop;
  end if;
  update commerce.orders set amount_due=amount_due-amount,
   status=case when amount_due=amount and status='pending_payment' then 'confirmed' else status end,updated_at=now() where id=p_id;
 end if;
 insert into commerce.order_receipts(id,commerce_order_id,raw_request_id,fastener_request_id,amount,reference,recorded_by)
 values(receipt_id,case when p_kind='commerce' then p_id end,case when p_kind='material' then p_id end,
  case when p_kind='fastener' then p_id end,amount,reference,actor);
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'order.payment_recorded',p_kind||'_order',p_id,jsonb_build_object('receipt_id',receipt_id,'amount',amount,'reference',reference));
end $$;
revoke all on function internal.record_order_receipt(text,uuid,jsonb) from public,anon,authenticated;

create function public.fti_order_receipt_record(p_kind text,p_id uuid,p_details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('payment.review');
 if nullif(btrim(p_details->>'payment_amount'),'') is null then raise exception 'Enter a payment amount' using errcode='22023'; end if;
 perform internal.record_order_receipt(p_kind,p_id,p_details);
 return public.fti_order_payments(p_kind,p_id);
end $$;

-- Optional receipts and fulfillment steps commit or roll back together. Existing
-- revision checks still run before the receipt is recorded.
do $$ declare definition text; revised text; begin
 definition:=pg_get_functiondef('public.fti_request_fulfillment_update(text,uuid,integer,text,jsonb)'::regprocedure);
 revised:=replace(definition,' insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)',
  ' perform internal.record_order_receipt(p_kind,p_request,p_details);' || E'\n' || ' insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)');
 if definition=revised then raise exception 'Fulfillment receipt insertion point not found'; end if;
 execute revised;
 -- A buyer who has already paid an advance submits only the remaining balance.
 definition:=pg_get_functiondef('public.fti_commerce_bank_submit(uuid,text)'::regprocedure);
 revised:=replace(definition,'o.amount_due<>o.grand_total','o.amount_due<=0');
 revised:=replace(revised,'normalized,o.grand_total,','normalized,o.amount_due,');
 if definition=revised then raise exception 'Bank submission remaining balance update not found'; end if;
 execute revised;
 definition:=pg_get_functiondef('public.fti_commerce_payment_decide(uuid,boolean,text)'::regprocedure);
 revised:=replace(definition,'p.amount<>o.grand_total or o.amount_due<>o.grand_total','p.amount<>o.amount_due or o.amount_due<=0');
 if definition=revised then raise exception 'Bank review remaining balance update not found'; end if;
 execute revised;
 definition:=pg_get_functiondef('public.fti_commerce_expire(integer)'::regprocedure);
 revised:=replace(definition,
  'and not exists(select 1 from commerce.payments p where p.order_id=orders.id and p.status=''review'')',
  'and not exists(select 1 from commerce.payments p where p.order_id=orders.id and p.status=''review'') and not exists(select 1 from commerce.order_receipts receipt where receipt.commerce_order_id=orders.id)');
 if definition=revised then raise exception 'Reservation expiry payment guard insertion point not found'; end if;
 execute revised;
end $$;

create function public.fti_order_step_with_payment(p_action text,p_order uuid,p_details jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_action='confirm' then
  perform public.fti_commerce_cart_confirm(p_order,p_details->'items',(p_details->>'gst')::numeric,(p_details->>'delivery')::numeric);
  perform internal.record_order_receipt('commerce',p_order,p_details);
 elsif p_action='dispatch' then
  perform internal.record_order_receipt('commerce',p_order,p_details);
  perform public.fti_operations_dispatch(p_order,p_details->>'carrier',p_details->>'tracking',p_details->>'vehicle',p_details->>'driver_name',p_details->>'driver_phone');
 elsif p_action='deliver' then
  perform internal.record_order_receipt('commerce',p_order,p_details);
  perform public.fti_operations_deliver(p_order,p_details->>'note');
 else raise exception 'Choose a valid order step' using errcode='22023'; end if;
 return public.fti_order_payments('commerce',p_order);
end $$;

-- Return payment totals with existing list responses without one RPC per card.
do $$ declare signature text; definition text; revised text; begin
 foreach signature in array array['public.fti_customer_orders(integer,text,text)','public.fti_admin_orders(text,text,text,date,date,integer,integer)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  revised:=replace(definition,'to_jsonb(page) order by',
   '(to_jsonb(page)||jsonb_build_object(''payment_summary'',internal.order_payment_summary(page.kind,page.id))) order by');
  if definition=revised then raise exception 'Order list payment summary insertion point not found: %',signature; end if;
  execute revised;
 end loop;
end $$;

revoke all on function public.fti_order_payments(text,uuid),public.fti_order_receipt_record(text,uuid,jsonb),public.fti_order_step_with_payment(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fti_order_payments(text,uuid),public.fti_order_receipt_record(text,uuid,jsonb),public.fti_order_step_with_payment(text,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
