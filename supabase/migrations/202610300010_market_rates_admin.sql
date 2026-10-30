begin;
create table if not exists pricing.market_rate_locations (
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('Ingot','Scrap','Billet','Old Scrap')),
 state text not null check(length(btrim(state)) between 2 and 80),
 district text not null check(length(btrim(district)) between 2 and 100)
);
create unique index if not exists market_rate_location_unique on pricing.market_rate_locations(category,lower(btrim(state)),lower(btrim(district)));
create table if not exists pricing.market_rate_entries (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references pricing.market_rate_locations(id),
 base_price numeric(14,2) not null check(base_price>0 and base_price<1000000000),
 increase_amount numeric(14,2) not null check(abs(increase_amount)<1000000000),
 sale_price numeric(14,2) generated always as (base_price+increase_amount) stored check(sale_price>0),
 published_at timestamptz not null default clock_timestamp(),
 published_by uuid not null references identity.profiles(id)
);
create index if not exists market_rate_entries_history on pricing.market_rate_entries(location_id,published_at desc,id desc);
create table if not exists pricing.market_rate_settings (
 id boolean primary key default true check(id), revision integer not null default 1,
 notes text not null check(length(notes)<=6000), support text not null check(length(support)<=500),
 sms text not null check(length(sms)<=500), whatsapp text not null check(length(whatsapp)<=500),
 updated_at timestamptz not null default clock_timestamp(), updated_by uuid references identity.profiles(id)
);
insert into pricing.market_rate_settings(id,notes,support,sms,whatsapp) values(true,
 E'All Rates Are Quoted, Estimated (As per Rumours)\nAll Rates Are P.m.t, Spot & only information, not any offer for sale & purchase.\nWe are not responsible for any profit or loss.\n💯% Reliability and Top Service\nBest Service, Right Time, Right People',
 'Support 24×7 +91-9780830333','+91-9780830333',E'+91-9780830333\n+91-9589971567') on conflict(id) do nothing;
alter table pricing.market_rate_locations enable row level security;
alter table pricing.market_rate_entries enable row level security;
alter table pricing.market_rate_settings enable row level security;
revoke all on pricing.market_rate_locations,pricing.market_rate_entries,pricing.market_rate_settings from public,anon,authenticated;

create or replace function internal.market_rate_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Published market rate history cannot be changed' using errcode='22023'; end $$;
revoke all on function internal.market_rate_immutable() from public,anon,authenticated;
drop trigger if exists market_rate_immutable on pricing.market_rate_entries;
create trigger market_rate_immutable before update or delete on pricing.market_rate_entries for each row execute function internal.market_rate_immutable();

create or replace function public.fti_pricing_market_rates_admin() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('price.manage');
 return jsonb_build_object('locations',coalesce((select jsonb_agg(to_jsonb(l) order by state,district,category) from pricing.market_rate_locations l),'[]'::jsonb),
 'settings',(select jsonb_build_object('revision',revision,'notes',notes,'support',support,'sms',sms,'whatsapp',whatsapp) from pricing.market_rate_settings where id));
end $$;

create or replace function public.fti_pricing_market_rates_location(p_category text,p_state text,p_district text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform internal.identity_staff('price.manage');
 if p_category is null or p_category not in ('Ingot','Scrap','Billet','Old Scrap') or coalesce(length(btrim(p_state)),0) not between 2 and 80
 or coalesce(length(btrim(p_district)),0) not between 2 and 100 then
 raise exception 'Choose a category and enter state (2-80 characters) and district (2-100 characters).' using errcode='22023'; end if;
 insert into pricing.market_rate_locations(category,state,district) values(p_category,btrim(p_state),btrim(p_district)) returning id into result;
 return result;
end $$;

drop function if exists public.fti_pricing_market_rates_history(uuid,date,integer);
create or replace function public.fti_pricing_market_rates_history(p_location uuid,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('price.manage');
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>10001
 or (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to)) or (p_from is not null and p_to is not null and p_from>p_to) then
 raise exception 'Invalid history filter' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.published_at desc,r.id desc) from (
 select id,location_id,base_price::text,increase_amount::text,sale_price::text,published_at,published_by
 from pricing.market_rate_entries where location_id=p_location
 and (p_from is null or published_at>=p_from::timestamp at time zone 'Asia/Kolkata')
 and (p_to is null or published_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata')
 order by published_at desc,id desc limit p_limit offset p_offset) r),'[]'::jsonb);
end $$;

create or replace function public.fti_pricing_market_rates_publish(p_location uuid,p_previous uuid,p_base text,p_increase text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid; previous uuid; result uuid;
begin
 actor:=internal.identity_staff('price.publish');
 perform internal.identity_staff('price.manage');
 if coalesce(p_base,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or coalesce(p_increase,'') !~ '^-?[0-9]{1,9}(\.[0-9]{1,2})?$' then
 raise exception 'Enter prices with up to two decimal places.' using errcode='22023'; end if;
 if p_base::numeric<=0 or p_base::numeric+p_increase::numeric<=0 then
 raise exception 'Base and sale prices must be positive.' using errcode='22023'; end if;
 perform 1 from pricing.market_rate_locations where id=p_location for update;
 if not found then raise exception 'District not found.' using errcode='P0002'; end if;
 select id into previous from pricing.market_rate_entries where location_id=p_location order by published_at desc,id desc limit 1;
 if previous is distinct from p_previous then raise exception 'Prices changed. Refresh this district and review the latest price before publishing.' using errcode='22023'; end if;
 insert into pricing.market_rate_entries(location_id,base_price,increase_amount,published_by)
 values(p_location,p_base::numeric,p_increase::numeric,actor) returning id into result;
 return result;
end $$;

create or replace function public.fti_pricing_market_rates_settings(p_revision integer,p_notes text,p_support text,p_sms text,p_whatsapp text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid; result integer;
begin
 actor:=internal.identity_staff('price.manage');
 if p_notes is null or length(p_notes)>6000 or p_support is null or length(p_support)>500 or p_sms is null or length(p_sms)>500 or p_whatsapp is null or length(p_whatsapp)>500 then
 raise exception 'Notes must be at most 6000 characters; contact fields at most 500 each.' using errcode='22023'; end if;
 if exists(select 1 from regexp_split_to_table(btrim(p_sms)||E'\n'||btrim(p_whatsapp),E'\n') phone
 where btrim(phone)<>'' and btrim(phone) !~ '^\+?[0-9][0-9 +()\-]{5,29}$') then
 raise exception 'Use phone numbers for SMS and WhatsApp contacts, one per line.' using errcode='22023'; end if;
 update pricing.market_rate_settings set notes=btrim(p_notes),support=btrim(p_support),sms=btrim(p_sms),whatsapp=btrim(p_whatsapp),
 revision=revision+1,updated_at=clock_timestamp(),updated_by=actor where id and revision=p_revision returning revision into result;
 if result is null then raise exception 'Notes or contacts changed. Reload them before saving.' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function public.fti_pricing_market_rates_admin(),public.fti_pricing_market_rates_location(text,text,text),public.fti_pricing_market_rates_history(uuid,date,date,integer,integer),public.fti_pricing_market_rates_publish(uuid,uuid,text,text),public.fti_pricing_market_rates_settings(integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fti_pricing_market_rates_admin(),public.fti_pricing_market_rates_location(text,text,text),public.fti_pricing_market_rates_history(uuid,date,date,integer,integer),public.fti_pricing_market_rates_publish(uuid,uuid,text,text),public.fti_pricing_market_rates_settings(integer,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
