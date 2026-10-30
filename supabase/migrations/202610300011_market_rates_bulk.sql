begin;
create or replace function public.fti_pricing_market_rates_current(p_locations uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('price.manage');
 if coalesce(array_length(p_locations,1),0) not between 1 and 100 then raise exception 'Select between 1 and 100 districts.' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('location_id',l.id,'latest',(
   select jsonb_build_object('id',e.id,'location_id',e.location_id,'base_price',e.base_price::text,'increase_amount',e.increase_amount::text,
    'sale_price',e.sale_price::text,'published_at',e.published_at,'published_by',e.published_by)
   from pricing.market_rate_entries e where e.location_id=l.id order by e.published_at desc,e.id desc limit 1)) order by l.state,l.district)
 from pricing.market_rate_locations l where l.id=any(p_locations)),'[]'::jsonb);
end $$;
create or replace function public.fti_pricing_market_rates_bulk_publish(p_items jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare item jsonb; n integer; category_count integer; location_count integer;
begin
 perform internal.identity_staff('price.manage');
 perform internal.identity_staff('price.publish');
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Expected district prices.' using errcode='22023'; end if;
 n:=jsonb_array_length(p_items);
 if n not between 1 and 100 then raise exception 'Publish between 1 and 100 changed districts together.' using errcode='22023'; end if;
 if (select count(distinct value->>'location_id') from jsonb_array_elements(p_items))<>n then raise exception 'Each district must appear once.' using errcode='22023'; end if;
 select count(*),count(distinct l.category) into location_count,category_count from pricing.market_rate_locations l
 where l.id in(select (value->>'location_id')::uuid from jsonb_array_elements(p_items));
 if location_count<>n or category_count<>1 then raise exception 'Choose existing districts from one category.' using errcode='22023'; end if;
 perform 1 from pricing.market_rate_locations l where l.id in(select (value->>'location_id')::uuid from jsonb_array_elements(p_items)) order by l.id for update;
 for item in select value from jsonb_array_elements(p_items) order by value->>'location_id' loop
   perform public.fti_pricing_market_rates_publish((item->>'location_id')::uuid,nullif(item->>'previous','')::uuid,item->>'base',item->>'increase');
 end loop;
 return n;
end $$;
revoke all on function public.fti_pricing_market_rates_current(uuid[]),public.fti_pricing_market_rates_bulk_publish(jsonb) from public,anon,authenticated;
grant execute on function public.fti_pricing_market_rates_current(uuid[]),public.fti_pricing_market_rates_bulk_publish(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
