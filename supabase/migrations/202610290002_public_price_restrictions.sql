begin;

-- Subscriptions are coming soon: public reads expose specifications, never rates.
-- Existing MFA-protected staff APIs continue to read the original pricing data.
create or replace function internal.redact_public_prices(value jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb;
begin
  if jsonb_typeof(value)='object' then
    select coalesce(jsonb_object_agg(key,internal.redact_public_prices(item)), '{}'::jsonb)
      into result from jsonb_each(value) as entries(key,item)
      where key !~* '(^|_)(price|prate|rate|rates|amount|cost|discount|profit|rolling|loading|freight|gst|tax)(_|$)';
    return result;
  elsif jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(internal.redact_public_prices(item) order by ordinal), '[]'::jsonb)
      into result from jsonb_array_elements(value) with ordinality as entries(item,ordinal);
    return result;
  end if;
  return value;
end $$;
revoke all on function internal.redact_public_prices(jsonb) from public,anon,authenticated;

-- Preserve the current implementations in the unexposed internal schema. Public
-- signatures/defaults stay unchanged, including manual-preview comparisons used
-- by quotation submission. Rerunning does not wrap a wrapper.
do $$
declare fn record; original text; call_args text; result_expression text;
begin
  for fn in select p.oid,p.proname,p.proargnames,
    pg_get_function_arguments(p.oid) as args,
    pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'fti_catalog_list','fti_catalog_filtered_list','fti_catalog_product_get',
      'fti_catalog_selection_options','fti_catalog_manual_preview',
      'fti_pricing_rates','fti_pricing_history'
    ) loop
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='internal' and p.proname=fn.proname||'_unredacted') then
      original:=pg_get_functiondef(fn.oid);
      original:=replace(original, 'public.'||fn.proname||'(', 'internal.'||fn.proname||'_unredacted(');
      execute original;
    end if;
    execute format('revoke all on function internal.%I(%s) from public,anon,authenticated',fn.proname||'_unredacted',fn.identity_args);
    select string_agg(format('%I',name),',') into call_args from unnest(fn.proargnames) name;
    if fn.proname='fti_pricing_rates' then
      result_expression:='jsonb_build_object(''items'',''[]''::jsonb,''total'',0,''disclosure'',''Price subscriptions are coming soon. Request a quotation.'')';
    elsif fn.proname='fti_pricing_history' then
      result_expression:='''[]''::jsonb';
    else
      result_expression:=format('internal.redact_public_prices(internal.%I(%s))',fn.proname||'_unredacted',coalesce(call_args,''));
    end if;
    execute format('create or replace function public.%I(%s) returns jsonb language sql stable security definer set search_path='''' as %L',fn.proname,fn.args,'select '||result_expression);
  end loop;
end $$;

create or replace function public.fti_price_admin_access()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(auth.jwt()->>'aal'='aal2',false) and internal.identity_permission('catalog.manage')
$$;
revoke all on function public.fti_price_admin_access() from public,anon;
grant execute on function public.fti_price_admin_access() to authenticated;
drop policy if exists grade_rates_read on public.fastener_grade_rates;
create policy grade_rates_read on public.fastener_grade_rates for select to authenticated
  using(public.fti_price_admin_access());
revoke select on public.fastener_grade_rates from anon;

-- Grade selection must remain available even though the associated rates do not.
create or replace function public.fti_fastener_grades()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(grade order by grade),'[]'::jsonb) from public.fastener_grade_rates
$$;
revoke all on function public.fti_fastener_grades() from public;
grant execute on function public.fti_fastener_grades() to anon,authenticated;

-- Own confirmed quotations remain visible; unpublished catalogue estimates in
-- request details are not a substitute for subscriber access.
do $$
declare definition text;
begin
  if to_regprocedure('public.fti_customer_orders(integer,text,text)') is not null then
    definition:=pg_get_functiondef('public.fti_customer_orders(integer,text,text)'::regprocedure);
    definition:=replace(definition,'null, q.details,','null, internal.redact_public_prices(q.details),');
    execute definition;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
