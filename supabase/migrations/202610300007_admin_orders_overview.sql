begin;

create index if not exists orders_admin_created on commerce.orders(created_at desc,id);
create index if not exists raw_requests_admin_created on sales.raw_material_requests(created_at desc,id);
create index if not exists fastener_requests_admin_created on sales.fastener_requests(created_at desc,id);

create view internal.admin_order_ledger as
 select o.id,'commerce'::text as kind,o.order_no as reference,o.status,o.created_at,
  coalesce(p.full_name,'') as buyer_name,coalesce(p.phone,'') as phone,
  coalesce(b.legal_name,'') as business,
  concat_ws(', ',o.delivery_address_snapshot->>'line1',o.delivery_address_snapshot->>'city',o.delivery_address_snapshot->>'state',o.delivery_address_snapshot->>'pincode') as location,
  coalesce(items.material,'Parts order') as material,coalesce(items.quantity,'') as quantity,
  ''::text as grade,''::text as size,o.grand_total::text as total,o.amount_due::text as amount_due,
  o.closure_note,jsonb_build_object('carrier',shipping.carrier,'tracking_number',shipping.tracking_number) as fulfillment
 from commerce.orders o left join identity.profiles p on p.id=o.buyer_id
 left join identity.businesses b on b.id=o.business_id
 left join lateral (select string_agg(i.sku_snapshot,', ' order by i.id) as material,
  string_agg(i.qty::text||' '||i.uom,', ' order by i.id) as quantity
  from commerce.order_items i where i.order_id=o.id) items on true
 left join lateral (select string_agg(s.carrier,', ' order by s.created_at,s.id) as carrier,
  string_agg(s.tracking_number,', ' order by s.created_at,s.id) as tracking_number
  from commerce.shipments s where s.order_id=o.id) shipping on true
 union all
 select q.id,'material',q.details->>'reference',coalesce(f.status,'pending_confirmation'),q.created_at,
  coalesce(q.details->>'name',p.full_name,''),coalesce(q.details->>'phone',p.phone,''),coalesce(q.details->>'business',''),
  coalesce(q.details->>'location',''),coalesce(q.details->>'material','Material request'),coalesce(q.details->>'quantity',''),
  coalesce(q.details->>'grade',''),coalesce(q.details->>'size',''),f.confirmed_total::text,null::text,f.closure_note,
  internal.request_fulfillment_data(q.id,null)
 from sales.raw_material_requests q left join sales.request_fulfillments f on f.raw_request_id=q.id
 left join identity.profiles p on p.id=q.buyer_id
 union all
 select q.id,'fastener',q.details->>'reference',coalesce(f.status,'pending_confirmation'),q.created_at,
  coalesce(q.details->>'name',p.full_name,''),coalesce(q.details->>'phone',p.phone,''),coalesce(q.details->>'business',''),
  coalesce(q.details->>'location',''),coalesce(q.details->>'material','Fastener request'),coalesce(q.details->>'quantity',''),
  coalesce(q.details->>'grade',''),coalesce(q.details->>'size',''),f.confirmed_total::text,null::text,f.closure_note,
  internal.request_fulfillment_data(null,q.id)
 from sales.fastener_requests q left join sales.request_fulfillments f on f.fastener_request_id=q.id
 left join identity.profiles p on p.id=q.buyer_id;
revoke all on internal.admin_order_ledger from public,anon,authenticated;

create function public.fti_admin_orders(p_search text default '',p_kind text default 'all',p_status text default 'all',
 p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('order.manage');
 if p_kind is null or p_kind not in ('all','commerce','material','fastener')
 or p_status is null or p_status not in ('all','pending_confirmation','pending_payment','confirmed','processing','partially_shipped','shipped','delivered','cancelled','rejected','refunded','expired')
 or p_limit is null or p_limit not between 1 and 10000 or p_offset is null or p_offset<0
 or length(coalesce(p_search,''))>200 or (p_from is not null and p_to is not null and p_from>p_to) then
  raise exception 'Choose valid order filters, dates and page size' using errcode='22023';
 end if;
 with filtered as materialized (
  select * from internal.admin_order_ledger l
  where (p_kind='all' or l.kind=p_kind) and (p_status='all' or l.status=p_status)
  and (p_from is null or l.created_at>=(p_from::timestamp at time zone 'Asia/Kolkata'))
  and (p_to is null or l.created_at<((p_to+1)::timestamp at time zone 'Asia/Kolkata'))
  and (btrim(coalesce(p_search,''))='' or strpos(lower(concat_ws(' ',l.reference,l.id::text,l.buyer_name,l.phone,l.business,l.location,l.material,l.grade,l.size,
    l.fulfillment->>'tracking_number')),lower(btrim(p_search)))>0)
 ), page as (select * from filtered order by created_at desc,id,kind limit p_limit offset p_offset)
 select jsonb_build_object(
  'orders',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id,kind) from page),'[]'::jsonb),
  'summary',(select jsonb_build_object('total',count(*),
   'awaiting',count(*) filter(where status in ('pending_confirmation','pending_payment')),
   'active',count(*) filter(where status in ('pending_confirmation','pending_payment','confirmed','processing','partially_shipped','shipped')),
   'processing',count(*) filter(where status='processing'),
   'shipped',count(*) filter(where status in ('partially_shipped','shipped')),
   'delivered',count(*) filter(where status='delivered'),
   'cancelled',count(*) filter(where status='cancelled'),
   'rejected',count(*) filter(where status='rejected'),
   'confirmed_value',coalesce(sum(total::numeric) filter(where status in ('confirmed','processing','partially_shipped','shipped','delivered')),0)::text)
   from filtered)) into result;
 return result;
end $$;
revoke all on function public.fti_admin_orders(text,text,text,date,date,integer,integer) from public,anon,authenticated;
grant execute on function public.fti_admin_orders(text,text,text,date,date,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
