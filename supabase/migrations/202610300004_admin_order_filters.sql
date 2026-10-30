begin;
-- Filter before pagination; one-argument RPCs remain available for older clients.
create or replace function public.fti_catalog_raw_orders(p_status text,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select q.*,internal.request_fulfillment_data(q.id,null) as fulfillment,
  (select jsonb_agg(jsonb_build_object('id',j.id,'phone',j.phone,'template',j.template,'status',j.status,'error',j.last_error))
   from sales.raw_material_jobs j where j.request_id=q.id) as deliveries
  from sales.raw_material_requests q where (p_status='all' or coalesce((select f.status from sales.request_fulfillments f where f.raw_request_id=q.id),'pending_confirmation')=p_status) order by created_at desc,id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))) r),'[]');
end $$;
create or replace function public.fti_catalog_fastener_orders(p_status text,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('order.manage');
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select q.*,internal.request_fulfillment_data(null,q.id) as fulfillment,
  (select jsonb_agg(jsonb_build_object('id',j.id,'phone',j.phone,'template',j.template,'status',j.status,'error',j.last_error))
   from sales.fastener_jobs j where j.request_id=q.id) as deliveries
  from sales.fastener_requests q where (p_status='all' or coalesce((select f.status from sales.request_fulfillments f where f.fastener_request_id=q.id),'pending_confirmation')=p_status) order by created_at desc,id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))) r),'[]');
end $$;
create or replace function public.fti_operations_orders(p_status text,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('operations.manage');
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into result from
 (select id,order_no,status,created_at from commerce.orders where status in ('confirmed','processing','shipped','delivered') and (p_status='all' or status=p_status)
 order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) o;
 return result;
end $$;

revoke all on function public.fti_catalog_raw_orders(text,integer),public.fti_catalog_fastener_orders(text,integer),public.fti_operations_orders(text,integer) from public,anon,authenticated;
grant execute on function public.fti_catalog_raw_orders(text,integer),public.fti_catalog_fastener_orders(text,integer),public.fti_operations_orders(text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
