begin;
-- A single buyer-scoped ledger includes requests before they become commerce orders.
create function public.fti_customer_orders(p_offset integer default 0, p_search text default '', p_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); result jsonb;
begin
 with ledger as (
  select o.id, 'commerce'::text as kind, o.order_no as reference, o.status,
   o.created_at, o.grand_total::text as total, o.amount_due::text as amount_due,
   jsonb_build_object('material','Parts / quotation order','location',concat_ws(', ',o.delivery_address_snapshot->>'line1',o.delivery_address_snapshot->>'city')) as details,
   '{}'::jsonb as fulfillment
  from commerce.orders o where o.buyer_id=actor
  union all
  select q.id, 'material', q.details->>'reference', coalesce(f.status,'pending_confirmation'), q.created_at,
   f.confirmed_total::text, null, q.details,
   jsonb_build_object('carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'confirmation_note',f.confirmation_note,'delivery_note',f.delivery_note)
  from sales.raw_material_requests q left join sales.request_fulfillments f on f.raw_request_id=q.id where q.buyer_id=actor
  union all
  select q.id, 'fastener', q.details->>'reference', coalesce(f.status,'pending_confirmation'), q.created_at,
   f.confirmed_total::text, null, q.details,
   jsonb_build_object('carrier',f.carrier,'tracking_number',f.tracking_number,'vehicle_number',f.vehicle_number,'confirmation_note',f.confirmation_note,'delivery_note',f.delivery_note)
  from sales.fastener_requests q left join sales.request_fulfillments f on f.fastener_request_id=q.id where q.buyer_id=actor
 ), filtered as (
  select * from ledger where
   (coalesce(p_status,'all')='all' or status=p_status or (p_status='active' and status not in ('delivered','cancelled','expired')))
   and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',reference,details->>'material',details->>'grade',details->>'size',fulfillment->>'tracking_number')),lower(left(p_search,200)))>0)
 ), page as (select * from filtered order by created_at desc,id,kind limit 24 offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'orders',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id,kind) from page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.fti_customer_orders(integer,text,text) from public,anon;
grant execute on function public.fti_customer_orders(integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
