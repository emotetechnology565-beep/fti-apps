-- Scoped operational audit and bounded daily reporting.
begin;
create index if not exists idx_audit_recent on platform.audit_logs(created_at desc,id desc);
create function public.fti_operations_audit(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('operations.manage');
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into result from
 (select id,actor_id,action,resource_type,resource_id,created_at from platform.audit_logs
  order by created_at desc,id desc limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) a;
 return result;
end $$;
create function public.fti_operations_daily(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare orders jsonb; tickets jsonb; payments jsonb;
begin
 perform internal.identity_staff('operations.manage');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>90 or p_to>current_date then
  raise exception 'Choose a historical date range up to 90 days' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by report_day),'[]') into orders from
 (select created_at::date report_day,count(*)::integer orders_created,
   sum(grand_total)::text quoted_order_value from commerce.orders
  where created_at>=p_from and created_at<p_to+1 group by created_at::date) o;
 select coalesce(jsonb_agg(to_jsonb(t) order by report_day),'[]') into tickets from
 (select created_at::date report_day,count(*)::integer tickets_created from platform.support_tickets
  where created_at>=p_from and created_at<p_to+1 group by created_at::date) t;
 select coalesce(jsonb_agg(to_jsonb(p) order by report_day),'[]') into payments from
 (select created_at::date report_day,count(*)::integer transfer_claims,
  count(*) filter(where status='successful')::integer verified_transfers
  from commerce.payments where gateway='bank_transfer' and created_at>=p_from and created_at<p_to+1 group by created_at::date) p;
 return jsonb_build_object('orders',orders,'tickets',tickets,'payments',payments);
end $$;
revoke all on function public.fti_operations_audit(integer),public.fti_operations_daily(date,date) from public,anon,authenticated;
grant execute on function public.fti_operations_audit(integer),public.fti_operations_daily(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
