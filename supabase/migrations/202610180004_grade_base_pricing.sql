-- Shared MS/EN8 base prices. Repricing is atomic within one market and unit.
begin;
create table if not exists pricing.grade_base_prices (
 id uuid primary key default gen_random_uuid(),
 market_id uuid not null references pricing.markets(id),
 grade_code text not null check(grade_code in ('MS','EN8')),
 uom text not null check(uom in ('kg','MT','piece','box','bundle')),
 base_price numeric(20,4) not null check(base_price>0 and base_price<'Infinity'::numeric),
 revision integer not null default 1 check(revision>0),
 updated_by uuid not null references identity.profiles(id),
 updated_at timestamptz not null default clock_timestamp(),
 unique(market_id,grade_code,uom)
);
alter table pricing.grade_base_prices enable row level security;
revoke all on pricing.grade_base_prices from public,anon,authenticated;

create or replace function internal.pricing_base_grade(p_grade text) returns text
language sql immutable set search_path='' as $$
 select case upper(regexp_replace(coalesce(p_grade,''),'[^A-Za-z0-9]','','g'))
  when 'MS' then 'MS' when 'MILDSTEEL' then 'MS' when 'EN8' then 'EN8' else null end
$$;
revoke all on function internal.pricing_base_grade(text) from public,anon,authenticated;
create or replace function internal.pricing_variant_grade(p_variant uuid) returns text
language sql stable security definer set search_path='' as $$
 select internal.pricing_base_grade(value_json #>> '{}') from catalog.variant_attributes
 where variant_id=p_variant and attribute_key='grade'
$$;
revoke all on function internal.pricing_variant_grade(uuid) from public,anon,authenticated;

-- Prevent a stale draft or installed client from publishing an obsolete shared base.
create or replace function internal.pricing_check_grade_base() returns trigger
language plpgsql security definer set search_path='' as $$
declare market uuid; grade text; expected numeric;
begin
 if tg_table_name='draft_items' then
  select market_id into market from pricing.price_lists where id=new.price_list_id;
 else
  market:=new.market_id;
  if new.tier_id is not null then return new; end if;
 end if;
 grade:=internal.pricing_variant_grade(new.variant_id);
 select base_price into expected from pricing.grade_base_prices
  where market_id=market and grade_code=grade and uom=new.uom;
 if expected is not null and coalesce(new.base_price,new.amount)<>expected then
  raise exception using errcode='22023',message='The shared material base price changed. Refresh pricing and review the item breakdown before saving or publishing.';
 end if;
 return new;
end $$;
revoke all on function internal.pricing_check_grade_base() from public,anon,authenticated;
drop trigger if exists pricing_check_grade_base on pricing.draft_items;
create trigger pricing_check_grade_base before insert or update on pricing.draft_items
 for each row execute function internal.pricing_check_grade_base();
drop trigger if exists pricing_check_grade_base on pricing.price_versions;
create trigger pricing_check_grade_base before insert on pricing.price_versions
 for each row execute function internal.pricing_check_grade_base();

create or replace function public.fti_pricing_grade_base_update(p_market uuid,p_grade text,p_uom text,p_base_price text,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; grade text; base numeric; previous pricing.grade_base_prices; base_id uuid;
 batch uuid; version_id uuid; item record; total numeric; stamp timestamptz; affected integer:=0;
begin
 actor:=internal.identity_staff('price.publish');
 if not internal.identity_permission('price.manage') then
  raise exception using errcode='42501',message='Pricing management permission required'; end if;
 grade:=internal.pricing_base_grade(p_grade);
 if grade is null or p_uom is null or p_uom not in ('kg','MT','piece','box','bundle')
  or coalesce(p_base_price,'') !~ '^[0-9]{1,16}(\.[0-9]{1,4})?$' then
  raise exception using errcode='22023',message='Choose MS or EN8, a unit, and a positive base price with up to four decimal places.'; end if;
 base:=p_base_price::numeric;
 if base<=0 then raise exception using errcode='22023',message='Base price must be positive.'; end if;
 -- Use the same market lock as individual publication, including first publication.
 perform 1 from pricing.markets where id=p_market and is_active for update;
 if not found then raise exception using errcode='22023',message='Select an active market.'; end if;
 select * into previous from pricing.grade_base_prices
  where market_id=p_market and grade_code=grade and uom=p_uom for update;
 if (previous.id is null and p_revision is not null)
  or (previous.id is not null and p_revision is distinct from previous.revision) then
  raise exception using errcode='22023',message='The material base changed. Refresh pricing before updating it.'; end if;
 stamp:=clock_timestamp();
 insert into pricing.grade_base_prices(market_id,grade_code,uom,base_price,updated_by,updated_at)
 values(p_market,grade,p_uom,base,actor,stamp)
 on conflict(market_id,grade_code,uom) do update set base_price=excluded.base_price,
  revision=pricing.grade_base_prices.revision+1,updated_by=actor,updated_at=stamp returning id into base_id;
 for item in
  select c.variant_id,c.price_version_id,c.revision,v.uom,v.amount,v.increased_price,v.rolling_price,v.profit_percent
  from pricing.current_prices c
  join pricing.price_versions v on v.id=c.price_version_id and v.variant_id=c.variant_id and v.market_id=c.market_id
  join catalog.product_variants s on s.id=c.variant_id and s.is_active
  join catalog.products p on p.id=s.product_id and p.status='published'
  join catalog.categories cat on cat.id=p.category_id and cat.is_active
  where c.market_id=p_market and c.tier_key='public' and v.tier_id is null and v.rate_status='indicative'
   and v.currency_code='INR' and v.effective_at<=stamp and v.uom=p_uom and s.uom=p_uom
   and internal.pricing_variant_grade(s.id)=grade
  order by c.variant_id for share of s,p,cat
 loop
  total:=base+item.increased_price+item.rolling_price+
   round((base+item.increased_price+item.rolling_price)*item.profit_percent/100,4);
  if total>=10000000000000000 then
   raise exception using errcode='22023',message='A calculated rate exceeds the supported range. Review product charges and profit before changing the shared base.'; end if;
  if batch is null then
   insert into pricing.price_lists(market_id,title,status,effective_at,created_by,published_by,published_at,updated_at)
   values(p_market,grade||' shared base update','published',stamp,actor,actor,stamp,stamp) returning id into batch;
  end if;
  insert into pricing.price_versions(price_list_id,variant_id,market_id,amount,uom,rate_status,effective_at,
   supersedes_id,created_by,base_price,increased_price,rolling_price,profit_percent)
  values(batch,item.variant_id,p_market,total,p_uom,'indicative',stamp,item.price_version_id,actor,
   base,item.increased_price,item.rolling_price,item.profit_percent) returning id into version_id;
  update pricing.current_prices set price_version_id=version_id,revision=revision+1,updated_at=stamp
   where variant_id=item.variant_id and market_id=p_market and tier_key='public';
  affected:=affected+1;
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
 values(actor,'pricing.grade_base.update','grade_base_price',base_id,to_jsonb(previous),
  jsonb_build_object('market_id',p_market,'grade_code',grade,'uom',p_uom,'base_price',base::text,'updated_products',affected,'updated_at',stamp));
 if batch is not null then
  insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
  values('pricing.published','price_list',batch,jsonb_build_object('market_id',p_market,'grade_code',grade,'published_at',stamp,'updated_products',affected));
 end if;
 return (select to_jsonb(b)||jsonb_build_object('base_price',b.base_price::text,'updated_products',affected) from pricing.grade_base_prices b where id=base_id);
end $$;
revoke all on function public.fti_pricing_grade_base_update(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.fti_pricing_grade_base_update(uuid,text,text,text,integer) to authenticated;

create or replace function public.fti_pricing_admin(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('price.manage');
 return jsonb_build_object('markets',public.fti_pricing_markets(),
 'grade_bases',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('base_price',b.base_price::text) order by b.market_id,b.grade_code,b.uom)
  from pricing.grade_base_prices b join pricing.markets m on m.id=b.market_id and m.is_active),'[]'),
 'drafts',coalesce((select jsonb_agg(to_jsonb(d)) from (
  select l.id,l.title,l.market_id,coalesce(l.updated_at,l.created_at) as updated_at,l.revision,
  coalesce((select jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'amount',i.amount::text,
   'base_price',coalesce(i.base_price,i.amount)::text,'increased_price',i.increased_price::text,
   'rolling_price',i.rolling_price::text,'profit_percent',i.profit_percent::text,'sku',v.sku,'uom',i.uom,
   'grade_code',internal.pricing_variant_grade(v.id)) order by v.sku)
   from pricing.draft_items i join catalog.product_variants v on v.id=i.variant_id where i.price_list_id=l.id),'[]') as items
  from pricing.price_lists l where l.status='draft' order by l.created_at desc,l.id
  limit 24 offset greatest(0,coalesce(p_offset,0))) d),'[]'),
 'current_rates',coalesce((select jsonb_agg(to_jsonb(r)) from (
  select v.id,v.variant_id,c.market_id,p.name,s.sku,s.size_label,v.uom,v.amount::text as amount,
   coalesce(v.base_price,v.amount)::text as base_price,v.increased_price::text as increased_price,
   v.rolling_price::text as rolling_price,v.profit_percent::text as profit_percent,
   internal.pricing_variant_grade(s.id) as grade_code,v.effective_at,c.revision
  from pricing.current_prices c join pricing.price_versions v on v.id=c.price_version_id
   and v.tier_id is null and v.variant_id=c.variant_id and v.market_id=c.market_id
  join pricing.markets m on m.id=c.market_id and m.is_active
  join catalog.product_variants s on s.id=c.variant_id and s.is_active
  join catalog.products p on p.id=s.product_id and p.status='published'
  join catalog.categories cat on cat.id=p.category_id and cat.is_active
  where c.tier_key='public' and v.rate_status='indicative' and v.effective_at<=now()
  order by c.updated_at desc,c.market_id,c.variant_id limit 24 offset greatest(0,coalesce(p_offset,0))) r),'[]'));
end $$;
revoke all on function public.fti_pricing_admin(integer) from public,anon,authenticated;
grant execute on function public.fti_pricing_admin(integer) to authenticated;
notify pgrst,'reload schema';
commit;
