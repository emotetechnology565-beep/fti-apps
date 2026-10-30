begin;
-- Sale-price changes are calculated independently of private pricing components.
create index if not exists market_rate_import_audit_lookup on platform.audit_logs(resource_id) where action='market_rates.import';
create or replace function internal.market_sale_change(p_location uuid,p_id uuid,p_sale numeric,p_at timestamptz) returns numeric
language plpgsql stable security definer set search_path='' as $$
declare previous numeric; reported numeric;
begin
 select sale_price into previous from pricing.market_rate_entries
 where location_id=p_location and (published_at,id)<(p_at,p_id)
 order by published_at desc,id desc limit 1;
 if found then return p_sale-previous; end if;
 -- The imported first report can have a known market movement without a prior
 -- stored quote. Expose only that movement, never the private audit payload.
 select (after_data->>'reported_market_movement')::numeric into reported
 from platform.audit_logs where resource_id=p_id and action='market_rates.import'
 and jsonb_typeof(after_data->'reported_market_movement')='number' limit 1;
 return reported;
end $$;
revoke all on function internal.market_sale_change(uuid,uuid,numeric,timestamptz) from public,anon,authenticated;

create or replace function public.fti_pricing_market_customer_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.fti_subscription_access(),false) then raise exception 'An active price subscription is required.' using errcode='42501'; end if;
 return jsonb_build_object('locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'category',category,'state',state,'district',district) order by state,district) from pricing.market_rate_locations),'[]'::jsonb),
  'settings',(select jsonb_build_object('notes',notes,'support',support,'sms',sms,'whatsapp',whatsapp) from pricing.market_rate_settings where id));
end $$;

create or replace function public.fti_pricing_market_customer_board(p_category text,p_states text[] default '{}',p_districts uuid[] default '{}',p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.fti_subscription_access(),false) then raise exception 'An active price subscription is required.' using errcode='42501'; end if;
 if p_category is null or p_category not in ('Ingot','Scrap','Billet','Old Scrap') or p_offset is null or p_offset<0 or p_offset>1000000
 or length(coalesce(p_search,''))>100 or coalesce(array_length(p_states,1),0)>100 or coalesce(array_length(p_districts,1),0)>100 then
 raise exception 'Choose a valid category and market filters.' using errcode='22023'; end if;
 with quotes as materialized (
   select l.id as location_id,l.category,l.state,l.district,e.id,e.sale_price,e.published_at
   from pricing.market_rate_locations l join lateral (
     select id,sale_price,published_at from pricing.market_rate_entries where location_id=l.id and published_at<=now()
     order by published_at desc,id desc limit 1
   ) e on true where l.category=p_category
   and (coalesce(array_length(p_states,1),0)=0 or l.state=any(p_states))
   and (coalesce(array_length(p_districts,1),0)=0 or l.id=any(p_districts))
   and (coalesce(btrim(p_search),'')='' or strpos(lower(l.district||' '||l.state),lower(btrim(p_search)))>0)
 ), page as (
   select * from quotes order by state,district,location_id limit 24 offset p_offset
 ) select jsonb_build_object('total',(select count(*) from quotes),'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'location_id',location_id,'category',category,'state',state,'district',district,'sale_price',sale_price::text,
   'published_at',published_at,'price_change',internal.market_sale_change(location_id,id,sale_price,published_at)::text) order by state,district,location_id)
   from page),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.fti_pricing_market_customer_history(p_location uuid,p_from date default null,p_to date default null,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.fti_subscription_access(),false) then raise exception 'An active price subscription is required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_offset>1000000 or (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to))
 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Choose a valid history date range.' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'sale_price',sale_price::text,'published_at',published_at,
   'price_change',internal.market_sale_change(location_id,id,sale_price,published_at)::text) order by published_at desc,id desc)
   from (select id,location_id,sale_price,published_at from pricing.market_rate_entries
   where location_id=p_location and published_at<=now()
   and (p_from is null or published_at>=p_from::timestamp at time zone 'Asia/Kolkata')
   and (p_to is null or published_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata')
   order by published_at desc,id desc limit 20 offset p_offset) rows),'[]'::jsonb);
end $$;
revoke all on function public.fti_pricing_market_customer_options(),public.fti_pricing_market_customer_board(text,text[],uuid[],text,integer),public.fti_pricing_market_customer_history(uuid,date,date,integer) from public,anon,authenticated;
grant execute on function public.fti_pricing_market_customer_options(),public.fti_pricing_market_customer_board(text,text[],uuid[],text,integer),public.fti_pricing_market_customer_history(uuid,date,date,integer) to authenticated;
notify pgrst,'reload schema';
commit;
