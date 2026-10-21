-- Rates stay active until replaced. Publication timestamps and history are server-owned.
begin;
alter table pricing.price_lists add column if not exists updated_at timestamptz;
alter table pricing.draft_items
 add column if not exists base_price numeric(20,4),
 add column if not exists increased_price numeric(20,4) not null default 0,
 add column if not exists rolling_price numeric(20,4) not null default 0,
 add column if not exists profit_percent numeric(20,4) not null default 0;
alter table pricing.price_versions
 add column if not exists base_price numeric(20,4),
 add column if not exists increased_price numeric(20,4) not null default 0,
 add column if not exists rolling_price numeric(20,4) not null default 0,
 add column if not exists profit_percent numeric(20,4) not null default 0;
-- Leave immutable historical rows untouched; legacy amounts read as their base price.
do $$
declare relation regclass;
begin
 foreach relation in array array['pricing.draft_items'::regclass,'pricing.price_versions'::regclass] loop
  if not exists(select 1 from pg_constraint where conrelid=relation and conname='pricing_components_valid') then
   execute format('alter table %s add constraint pricing_components_valid check (
    (base_price is null or (base_price>0 and base_price<''Infinity''::numeric))
    and increased_price>=0 and increased_price<''Infinity''::numeric
    and rolling_price>=0 and rolling_price<''Infinity''::numeric
    and profit_percent>=0 and profit_percent<''Infinity''::numeric
    and (base_price is null or amount=base_price+increased_price+rolling_price+
      round((base_price+increased_price+rolling_price)*profit_percent/100,4)))',relation);
  end if;
 end loop;
end $$;

create or replace function public.fti_pricing_rates(p_market uuid,p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with eligible as (
 select v.id,v.variant_id,p.id as product_id,p.name,s.sku,s.size_label,
 coalesce(attrs.value,'{}'::jsonb) as attributes,v.amount::text as amount,v.uom,v.currency_code,
 v.effective_at,null::timestamptz as expires_at,c.revision,previous.amount::text as previous_amount,
 previous.effective_at as previous_effective_at
 from pricing.current_prices c
 join pricing.price_versions v on v.id=c.price_version_id and v.tier_id is null
  and v.variant_id=c.variant_id and v.market_id=c.market_id
 join pricing.markets m on m.id=c.market_id and m.is_active
 join catalog.product_variants s on s.id=c.variant_id and s.is_active
 join catalog.products p on p.id=s.product_id and p.status='published'
 join catalog.categories cat on cat.id=p.category_id and cat.is_active
 left join lateral (select jsonb_object_agg(a.attribute_key,a.value_json) as value
  from catalog.variant_attributes a where a.variant_id=s.id) attrs on true
 left join pricing.price_versions previous on previous.id=v.supersedes_id
  and previous.tier_id is null and previous.market_id=v.market_id and previous.variant_id=v.variant_id
  and previous.effective_at<=now() and previous.uom=v.uom and previous.currency_code=v.currency_code
 where c.market_id=p_market and c.tier_key='public' and v.rate_status='indicative' and v.effective_at<=now()
 and (coalesce(trim(p_search),'')='' or strpos(lower(concat_ws(' ',p.name,s.sku,s.size_label)),lower(trim(p_search)))>0)
 ), page as (select * from eligible order by name,sku,variant_id limit 24 offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),
 'total',(select count(*) from eligible),'server_time',now(),
 'disclosure','Indicative INR rates stay active until replaced. GST and freight are not included. Request a quotation for confirmed totals.')
$$;

create or replace function public.fti_pricing_history(p_market uuid,p_variant uuid,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(h)),'[]') from (
 select v.id,v.amount::text as amount,v.uom,v.effective_at,null::timestamptz as expires_at
 from pricing.price_versions v
 join pricing.markets m on m.id=v.market_id and m.is_active
 join catalog.product_variants s on s.id=v.variant_id and s.is_active
 join catalog.products p on p.id=s.product_id and p.status='published'
 join catalog.categories c on c.id=p.category_id and c.is_active
 where v.market_id=p_market and v.variant_id=p_variant and v.tier_id is null
 and v.rate_status='indicative' and v.effective_at<=now()
 order by v.effective_at desc,v.created_at desc,v.id limit 24 offset greatest(0,coalesce(p_offset,0))
 ) h
$$;

create or replace function public.fti_pricing_admin(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('price.manage');
 return jsonb_build_object('markets',public.fti_pricing_markets(),'drafts',coalesce((
 select jsonb_agg(to_jsonb(d)) from (
 select l.id,l.title,l.market_id,coalesce(l.updated_at,l.created_at) as updated_at,l.revision,
 coalesce((select jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'amount',i.amount::text,
  'base_price',coalesce(i.base_price,i.amount)::text,'increased_price',i.increased_price::text,
  'rolling_price',i.rolling_price::text,'profit_percent',i.profit_percent::text,'sku',v.sku,'uom',i.uom) order by v.sku)
  from pricing.draft_items i join catalog.product_variants v on v.id=i.variant_id where i.price_list_id=l.id),'[]') as items
 from pricing.price_lists l where l.status='draft' order by l.created_at desc,l.id
 limit 24 offset greatest(0,coalesce(p_offset,0))) d),'[]'),
 'current_rates',coalesce((select jsonb_agg(to_jsonb(r)) from (
  select v.id,v.variant_id,c.market_id,p.name,s.sku,s.size_label,v.uom,v.amount::text as amount,
   coalesce(v.base_price,v.amount)::text as base_price,v.increased_price::text as increased_price,
   v.rolling_price::text as rolling_price,v.profit_percent::text as profit_percent,
   v.effective_at,c.revision
  from pricing.current_prices c join pricing.price_versions v on v.id=c.price_version_id
   and v.tier_id is null and v.variant_id=c.variant_id and v.market_id=c.market_id
  join pricing.markets m on m.id=c.market_id and m.is_active
  join catalog.product_variants s on s.id=c.variant_id and s.is_active
  join catalog.products p on p.id=s.product_id and p.status='published'
  join catalog.categories cat on cat.id=p.category_id and cat.is_active
  where c.tier_key='public' and v.rate_status='indicative' and v.effective_at<=now()
  order by c.updated_at desc,c.market_id,c.variant_id limit 24 offset greatest(0,coalesce(p_offset,0))) r),'[]'));
end $$;

-- Retain the existing RPC signature for installed clients; p_expires is ignored.
create or replace function public.fti_pricing_draft_save(p_id uuid,p_revision integer,p_market uuid,p_title text,p_expires timestamptz,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid; draft pricing.price_lists; item jsonb; component text;
 base numeric; increase numeric; rolling numeric; profit numeric; total numeric;
begin
 actor:=internal.identity_staff('price.manage');
 if length(trim(coalesce(p_title,''))) not between 2 and 160 or jsonb_typeof(p_items) is distinct from 'array' then
  raise exception using errcode='22023',message='Supply a title and rate items.'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 then
  raise exception using errcode='22023',message='A draft must contain 1 to 100 variants.'; end if;
 perform 1 from pricing.markets where id=p_market and is_active;
 if not found then raise exception using errcode='22023',message='Select an active market.'; end if;
 if p_id is null then
  insert into pricing.price_lists(market_id,title,expires_at,created_by,updated_at)
  values(p_market,trim(p_title),null,actor,clock_timestamp()) returning id into result;
 else
  select * into draft from pricing.price_lists where id=p_id for update;
  if not found or draft.status<>'draft' or p_revision is distinct from draft.revision then
   raise exception using errcode='22023',message='Draft changed or was published. Refresh before editing.'; end if;
  result:=p_id;
  update pricing.price_lists set market_id=p_market,title=trim(p_title),expires_at=null,
   updated_at=clock_timestamp(),revision=revision+1 where id=result;
  delete from pricing.draft_items where price_list_id=result;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' then
   raise exception using errcode='22023',message='Each rate item must be an object.'; end if;
  -- Legacy clients submit amount only. Treat that as the base with zero adjustments.
  if not (item ? 'base_price') then
   item:=item||jsonb_build_object('base_price',item->>'amount','increased_price','0','rolling_price','0','profit_percent','0');
  end if;
  foreach component in array array['base_price','increased_price','rolling_price','profit_percent'] loop
   if coalesce(item->>component,'') !~ '^[0-9]{1,16}(\.[0-9]{1,4})?$' then
    raise exception using errcode='22023',message='Enter non-negative prices and profit percentage with at most four decimal places.'; end if;
  end loop;
  base:=(item->>'base_price')::numeric;increase:=(item->>'increased_price')::numeric;
  rolling:=(item->>'rolling_price')::numeric;profit:=(item->>'profit_percent')::numeric;
  total:=base+increase+rolling+round((base+increase+rolling)*profit/100,4);
  if base<=0 or total>=10000000000000000 then
   raise exception using errcode='22023',message='Base price must be positive and the calculated rate must fit within 16 integer digits.'; end if;
  if item ? 'amount' and (coalesce(item->>'amount','') !~ '^[0-9]{1,16}(\.[0-9]{1,4})?$' or (item->>'amount')::numeric<>total) then
   raise exception using errcode='22023',message='Selling rate must match the price breakdown and profit percentage.'; end if;
  if not exists(select 1 from catalog.product_variants v join catalog.products p on p.id=v.product_id
   join catalog.categories c on c.id=p.category_id where v.id=(item->>'variant_id')::uuid and v.is_active and p.status='published' and c.is_active) then
   raise exception using errcode='22023',message='Only active variants of published products can receive rates.'; end if;
  insert into pricing.draft_items(price_list_id,variant_id,amount,uom,base_price,increased_price,rolling_price,profit_percent)
   select result,v.id,total,v.uom,base,increase,rolling,profit from catalog.product_variants v where v.id=(item->>'variant_id')::uuid;
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'pricing.draft.save','price_list',result,jsonb_build_object('items',jsonb_array_length(p_items),'market_id',p_market));
 return result;
end $$;

create or replace function public.fti_pricing_publish(p_id uuid,p_revision integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid; draft pricing.price_lists; item record; version_id uuid; previous_id uuid; published_time timestamptz;
begin
 actor:=internal.identity_staff('price.publish');
 select * into draft from pricing.price_lists where id=p_id for update;
 if not found or draft.status<>'draft' or p_revision is distinct from draft.revision then
  raise exception using errcode='22023',message='Draft changed or was already published. Refresh before publishing.'; end if;
 perform 1 from pricing.markets where id=draft.market_id and is_active for update;
 if not found then raise exception using errcode='22023',message='Market is inactive.'; end if;
 published_time:=clock_timestamp();
 if not exists(select 1 from pricing.draft_items where price_list_id=p_id) then
  raise exception using errcode='22023',message='Draft has no rate items.'; end if;
 for item in select i.*,v.uom as current_uom,v.is_active,p.status,c.is_active as category_active
 from pricing.draft_items i join catalog.product_variants v on v.id=i.variant_id
 join catalog.products p on p.id=v.product_id join catalog.categories c on c.id=p.category_id
 where i.price_list_id=p_id order by i.variant_id for share of v,p,c loop
  if not item.is_active or item.status<>'published' or not item.category_active then
   raise exception using errcode='22023',message='A draft variant is no longer published and active.'; end if;
  if item.uom<>item.current_uom then
   raise exception using errcode='22023',message='A variant unit changed. Review and save the draft again before publishing.'; end if;
  select price_version_id into previous_id from pricing.current_prices
   where variant_id=item.variant_id and market_id=draft.market_id and tier_key='public';
  insert into pricing.price_versions(price_list_id,variant_id,market_id,amount,uom,rate_status,effective_at,expires_at,
   supersedes_id,created_by,base_price,increased_price,rolling_price,profit_percent)
  values(p_id,item.variant_id,draft.market_id,item.amount,item.uom,'indicative',published_time,null,previous_id,actor,
   coalesce(item.base_price,item.amount),item.increased_price,item.rolling_price,item.profit_percent) returning id into version_id;
  insert into pricing.current_prices(variant_id,market_id,tier_key,price_version_id,updated_at)
   values(item.variant_id,draft.market_id,'public',version_id,published_time)
   on conflict(variant_id,market_id,tier_key) do update set price_version_id=excluded.price_version_id,
    revision=pricing.current_prices.revision+1,updated_at=published_time;
 end loop;
 update pricing.price_lists set status='published',effective_at=published_time,published_at=published_time,
  published_by=actor,expires_at=null,updated_at=published_time,revision=revision+1 where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'pricing.publish','price_list',p_id,jsonb_build_object('market_id',draft.market_id,'updated_at',published_time));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('pricing.published','price_list',p_id,jsonb_build_object('market_id',draft.market_id,'published_at',published_time));
 return p_id;
end $$;

revoke all on function public.fti_pricing_rates(uuid,text,integer),public.fti_pricing_history(uuid,uuid,integer),
 public.fti_pricing_admin(integer),public.fti_pricing_draft_save(uuid,integer,uuid,text,timestamptz,jsonb),public.fti_pricing_publish(uuid,integer)
 from public,anon,authenticated;
grant execute on function public.fti_pricing_rates(uuid,text,integer),public.fti_pricing_history(uuid,uuid,integer) to anon,authenticated;
grant execute on function public.fti_pricing_admin(integer),public.fti_pricing_draft_save(uuid,integer,uuid,text,timestamptz,jsonb),
 public.fti_pricing_publish(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
