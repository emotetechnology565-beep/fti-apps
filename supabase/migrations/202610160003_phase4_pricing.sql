-- Phase 4: manually approved, public indicative rates. No business data seeded.
-- Requires the schema blueprint and Phase 2/3 migrations.
begin;
insert into identity.role_permissions(role_code,permission) values
 ('super_admin','price.manage'),('super_admin','price.publish'),
 ('price_manager','price.manage'),('price_manager','price.publish') on conflict do nothing;
alter table pricing.price_lists add column if not exists revision integer not null default 1;
create table if not exists pricing.draft_items (
 price_list_id uuid not null references pricing.price_lists(id),
 variant_id uuid not null references catalog.product_variants(id),
 amount numeric(20,4) not null check(amount>0 and amount<'Infinity'::numeric),
 uom text not null,
 primary key(price_list_id,variant_id)
);
alter table pricing.draft_items enable row level security;
revoke all on pricing.draft_items from public,anon,authenticated;

create or replace function internal.price_history_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception using errcode='22023',message='Published price history is immutable; publish a replacement.'; end $$;
drop trigger if exists price_history_immutable on pricing.price_versions;
create trigger price_history_immutable before update or delete on pricing.price_versions
 for each row execute function internal.price_history_immutable();

create or replace function public.fti_pricing_markets() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'state',state) order by name),'[]')
 from pricing.markets where is_active
$$;

create or replace function public.fti_pricing_rates(p_market uuid,p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with eligible as (
 select v.id,v.variant_id,p.name,s.sku,s.size_label,v.amount::text as amount,v.uom,v.currency_code,
 v.effective_at,v.expires_at,c.revision,previous.amount::text as previous_amount,
 previous.effective_at as previous_effective_at
 from pricing.current_prices c
 join pricing.price_versions v on v.id=c.price_version_id and v.tier_id is null
   and v.variant_id=c.variant_id and v.market_id=c.market_id
 join pricing.markets m on m.id=c.market_id and m.is_active
 join catalog.product_variants s on s.id=c.variant_id and s.is_active
 join catalog.products p on p.id=s.product_id and p.status='published'
 join catalog.categories cat on cat.id=p.category_id and cat.is_active
 left join pricing.price_versions previous on previous.id=v.supersedes_id
   and previous.tier_id is null and previous.market_id=v.market_id and previous.variant_id=v.variant_id
   and previous.effective_at<=now() and previous.uom=v.uom and previous.currency_code=v.currency_code
 where c.market_id=p_market and c.tier_key='public' and v.rate_status='indicative'
 and v.effective_at<=now() and v.expires_at>now()
 and (coalesce(trim(p_search),'')='' or strpos(lower(concat_ws(' ',p.name,s.sku,s.size_label)),lower(trim(p_search)))>0)
 ), page as (select * from eligible order by name,sku,variant_id limit 24 offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),
 'total',(select count(*) from eligible),'server_time',now(),
 'disclosure','Indicative INR rates. GST and freight are not included. Request a quotation for confirmed totals.')
$$;

create or replace function public.fti_pricing_history(p_market uuid,p_variant uuid,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(h)),'[]') from (
 select v.id,v.amount::text as amount,v.uom,v.effective_at,v.expires_at
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

create or replace function public.fti_pricing_market_create(p_code text,p_name text,p_state text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid;
begin
 actor:=internal.identity_staff('price.manage');
 if coalesce(trim(p_code),'') !~ '^[A-Za-z0-9_-]{2,30}$' or length(trim(coalesce(p_name,''))) not between 2 and 100
 or length(trim(coalesce(p_state,''))) not between 2 and 100 then
 raise exception using errcode='22023',message='Supply a market code, name and state.'; end if;
 insert into pricing.markets(code,name,state) values(upper(trim(p_code)),trim(p_name),trim(p_state)) returning id into result;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'pricing.market.create','market',result,jsonb_build_object('code',upper(trim(p_code))));
 return result;
end $$;

create or replace function public.fti_pricing_admin(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('price.manage');
 return jsonb_build_object('markets',public.fti_pricing_markets(),'drafts',coalesce((
 select jsonb_agg(to_jsonb(d)) from (
 select l.id,l.title,l.market_id,l.expires_at,l.revision,
 coalesce((select jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'amount',i.amount::text,'sku',v.sku,'uom',i.uom) order by v.sku)
 from pricing.draft_items i join catalog.product_variants v on v.id=i.variant_id where i.price_list_id=l.id),'[]') as items
 from pricing.price_lists l where l.status='draft' order by l.created_at desc,l.id limit 24 offset greatest(0,coalesce(p_offset,0))
 ) d),'[]'));
end $$;

create or replace function public.fti_pricing_draft_save(p_id uuid,p_revision integer,p_market uuid,p_title text,p_expires timestamptz,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid; draft pricing.price_lists; item jsonb;
begin
 actor:=internal.identity_staff('price.manage');
 if p_expires is null or not isfinite(p_expires) or p_expires<=now() or length(trim(coalesce(p_title,''))) not between 2 and 160
 or jsonb_typeof(p_items) is distinct from 'array' then
 raise exception using errcode='22023',message='Supply a title, future expiry and rate items.'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 then
 raise exception using errcode='22023',message='A draft must contain 1 to 100 variants.'; end if;
 perform 1 from pricing.markets where id=p_market and is_active;
 if not found then raise exception using errcode='22023',message='Select an active market.'; end if;
 if p_id is null then
 insert into pricing.price_lists(market_id,title,expires_at,created_by) values(p_market,trim(p_title),p_expires,actor) returning id into result;
 else
 select * into draft from pricing.price_lists where id=p_id for update;
 if not found or draft.status<>'draft' or p_revision is distinct from draft.revision then
 raise exception using errcode='22023',message='Draft changed or was published. Refresh before editing.'; end if;
 result:=p_id;
 update pricing.price_lists set market_id=p_market,title=trim(p_title),expires_at=p_expires,revision=revision+1 where id=result;
 delete from pricing.draft_items where price_list_id=result;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
 if coalesce(item->>'amount','') !~ '^[0-9]{1,16}(\.[0-9]{1,4})?$' then
 raise exception using errcode='22023',message='Rates must be positive decimals with at most four decimal places.'; end if;
 if not exists(select 1 from catalog.product_variants v join catalog.products p on p.id=v.product_id
 join catalog.categories c on c.id=p.category_id where v.id=(item->>'variant_id')::uuid and v.is_active and p.status='published' and c.is_active) then
 raise exception using errcode='22023',message='Only active variants of published products can receive rates.'; end if;
 insert into pricing.draft_items(price_list_id,variant_id,amount,uom)
 select result,v.id,(item->>'amount')::numeric,v.uom from catalog.product_variants v where v.id=(item->>'variant_id')::uuid;
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
 -- Serialize all publications in one market, including the first publication of a variant.
 perform 1 from pricing.markets where id=draft.market_id and is_active for update;
 if not found then raise exception using errcode='22023',message='Market is inactive.'; end if;
 published_time:=clock_timestamp();
 if draft.expires_at is null or not isfinite(draft.expires_at) or draft.expires_at<=published_time then
 raise exception using errcode='22023',message='Draft expired. Set a future expiry before publishing.'; end if;
 if not exists(select 1 from pricing.draft_items where price_list_id=p_id) then
 raise exception using errcode='22023',message='Draft has no rate items.'; end if;
 for item in select i.variant_id,i.amount,i.uom,v.uom as current_uom,v.is_active,p.status,c.is_active as category_active
 from pricing.draft_items i join catalog.product_variants v on v.id=i.variant_id
 join catalog.products p on p.id=v.product_id join catalog.categories c on c.id=p.category_id
 where i.price_list_id=p_id order by i.variant_id for share of v,p,c loop
 if not item.is_active or item.status<>'published' or not item.category_active then
 raise exception using errcode='22023',message='A draft variant is no longer published and active.'; end if;
 if item.uom<>item.current_uom then
 raise exception using errcode='22023',message='A variant unit changed. Review and save the draft again before publishing.'; end if;
 select price_version_id into previous_id from pricing.current_prices
 where variant_id=item.variant_id and market_id=draft.market_id and tier_key='public';
 insert into pricing.price_versions(price_list_id,variant_id,market_id,amount,uom,rate_status,effective_at,expires_at,supersedes_id,created_by)
 values(p_id,item.variant_id,draft.market_id,item.amount,item.uom,'indicative',published_time,draft.expires_at,previous_id,actor) returning id into version_id;
 insert into pricing.current_prices(variant_id,market_id,tier_key,price_version_id) values(item.variant_id,draft.market_id,'public',version_id)
 on conflict(variant_id,market_id,tier_key) do update set price_version_id=excluded.price_version_id,revision=pricing.current_prices.revision+1,updated_at=published_time;
 end loop;
 update pricing.price_lists set status='published',effective_at=published_time,published_at=published_time,published_by=actor,revision=revision+1 where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'pricing.publish','price_list',p_id,jsonb_build_object('market_id',draft.market_id,'expires_at',draft.expires_at));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('pricing.published','price_list',p_id,jsonb_build_object('market_id',draft.market_id,'published_at',published_time));
 return p_id;
end $$;

revoke all on function internal.price_history_immutable() from public,anon,authenticated;
revoke all on function public.fti_pricing_markets(), public.fti_pricing_rates(uuid,text,integer), public.fti_pricing_history(uuid,uuid,integer),
 public.fti_pricing_market_create(text,text,text),public.fti_pricing_admin(integer),public.fti_pricing_draft_save(uuid,integer,uuid,text,timestamptz,jsonb),public.fti_pricing_publish(uuid,integer) from public,anon,authenticated;
grant execute on function public.fti_pricing_markets(),public.fti_pricing_rates(uuid,text,integer),public.fti_pricing_history(uuid,uuid,integer) to anon,authenticated;
grant execute on function public.fti_pricing_market_create(text,text,text),public.fti_pricing_admin(integer),public.fti_pricing_draft_save(uuid,integer,uuid,text,timestamptz,jsonb),public.fti_pricing_publish(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
