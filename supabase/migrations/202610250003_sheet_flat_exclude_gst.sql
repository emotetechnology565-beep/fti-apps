-- Recalculate Sheet MS and Flat rates from their original components.
-- Re-running never subtracts tax twice. Historical requests remain unchanged.
begin;

with rates as (
  select v.id,
    (a.attributes->>'sheet_flat_base_rate_pmt')::numeric as base,
    (a.attributes->>'sheet_flat_base_rate_pmt')::numeric +
      (a.attributes->>'sheet_flat_vadha')::numeric as net
  from catalog.product_variants v
  join catalog.products p on p.id=v.product_id
  join catalog.categories c on c.id=p.category_id
  join lateral (
    select jsonb_object_agg(attribute_key,value_json) as attributes
    from catalog.variant_attributes where variant_id=v.id
  ) a on true
  where c.slug in ('sheet','flat')
    and upper(trim(a.attributes->>'grade'))='MS'
    and a.attributes->>'sheet_flat_base_rate_pmt' ~ '^\d{1,12}(\.\d{1,2})?$'
    and a.attributes->>'sheet_flat_vadha' ~ '^\d{1,12}(\.\d{1,2})?$'
)
insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
select r.id,entry.key,entry.value from rates r
cross join lateral jsonb_each(jsonb_build_object(
  'sheet_flat_total',to_char(r.net,'FM999999999999990.00'),
  'sheet_flat_gst','0.00',
  'sheet_flat_net_prate',to_char(r.net,'FM999999999999990.00'),
  'sheet_flat_gst_included',false,
  'grade_list_base_price',to_char(r.base,'FM999999999999990.00'),
  'grade_list_price',to_char(r.net,'FM999999999999990.00'),
  'grade_list_gst_included',false,
  'grade_list_gst_rate',null
)) entry
on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;

-- The existing manual-order function assumed every Sheet/Flat rate included GST.
-- Preserve its validation, locking, snapshot and delivery behavior; only replace
-- that assumption with the explicit metadata on the chosen rate.
do $migration$
declare
  function_id regprocedure := to_regprocedure('public.fti_catalog_manual_request_submit(uuid,jsonb,text,jsonb)');
  definition text;
  old_expression text := $old$case when attrs ? 'sheet_flat_net_prate' then 'true'::jsonb else attrs->'grade_list_gst_included' end$old$;
  new_expression text := $new$case when attrs ? 'sheet_flat_net_prate' then coalesce(attrs->'sheet_flat_gst_included','true'::jsonb) else attrs->'grade_list_gst_included' end$new$;
begin
  if function_id is not null then
    definition := pg_get_functiondef(function_id);
    if strpos(definition,old_expression)>0 then
      execute replace(definition,old_expression,new_expression);
    elsif strpos(definition,new_expression)=0 then
      raise exception 'Manual request GST logic changed; review before applying this migration';
    end if;
  end if;
end $migration$;

notify pgrst,'reload schema';
commit;
