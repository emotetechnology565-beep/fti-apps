-- Exact as-rolled and bright-bar availability. Price groups and historical variant IDs survive.
begin;

create or replace function internal.round_bar_sizes() returns integer[]
language sql immutable set search_path='' as $$
  select array[8,10,12,16,17,18,20,21,22,23,24,25,26,27,28,30,32,34,36,
    38,40,42,45,48,50,51,53,56,60,63,65,68,70,72,75,80];
$$;
create or replace function internal.round_bar_grades() returns text[]
language sql immutable set search_path='' as $$
  select array['16MNCR5','20MNCR5','30MNB5','30MNCR4','41CR4','42CRMO4','A-105','BORON','C-55','CK-45',
    'EN-15','EN-18','EN-18D','EN-19','EN-24','EN-353','EN-36A','EN-45','EN-45A','EN-8D',
    'EN-8DCR','EN-8DLHT','EN-9','LC','S-45C','S-48C','SAE-1018','SAE-1541',
    'SAE-4130','SAE-4140','SAE-8620','SCM-420','SCM-435','ST-52.3'];
$$;

-- Used by both catalogue filtering and order validation. Other categories keep
-- their existing range matching, including any sizes specific to those products.
create or replace function internal.catalog_variant_size_matches(
  p_variant uuid,p_diameter numeric,p_label text,p_size integer
) returns boolean language plpgsql stable set search_path='' as $$
declare attrs jsonb; slug text;
begin
  select c.slug into slug from catalog.product_variants v
    join catalog.products p on p.id=v.product_id join catalog.categories c on c.id=p.category_id
    where v.id=p_variant;
  if slug is null or slug not in ('round-bar-as-rolled','round-bright-bar') then
    return internal.catalog_size_matches(p_diameter,p_label,p_size);
  end if;
  select coalesce(jsonb_object_agg(attribute_key,value_json),'{}') into attrs
    from catalog.variant_attributes where variant_id=p_variant;
  if not coalesce(upper(trim(attrs->>'grade'))=any(internal.round_bar_grades()),false) then return false; end if;
  if p_size is null then return true; end if;
  if not p_size=any(internal.round_bar_sizes()) then return false; end if;
  if attrs->'quote_only'='true'::jsonb then
    return coalesce(attrs->'available_sizes' @> to_jsonb(array[p_size]),false);
  end if;
  return internal.catalog_size_matches(p_diameter,p_label,p_size);
end $$;

create or replace function internal.sync_round_bar_availability(p_product uuid) returns void
language plpgsql set search_path='' as $$
declare grade text; missing integer[]; variant uuid; unit text; minimum numeric;
begin
  select s.uom,s.min_order_qty into unit,minimum from catalog.category_grade_sheets s
    join catalog.categories c on c.id=s.category_id
    where s.product_id=p_product and c.slug in ('round-bar-as-rolled','round-bright-bar');
  if not found then return; end if;

  -- Retain every row for historical requests; only availability changes.
  update catalog.product_variants v set is_active=false where v.product_id=p_product
    and not exists(select 1 from catalog.variant_attributes a where a.variant_id=v.id
      and a.attribute_key='grade' and upper(trim(a.value_json#>>'{}'))=any(internal.round_bar_grades()));

  insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
    select v.id,'available_sizes',coalesce((select jsonb_agg(sz order by sz)
      from unnest(internal.round_bar_sizes()) sz
      where internal.catalog_size_matches(v.diameter_mm,coalesce(a.value_json#>>'{}',v.size_label),sz)),'[]')
    from catalog.product_variants v left join catalog.variant_attributes a
      on a.variant_id=v.id and a.attribute_key='size_group'
    where v.product_id=p_product and v.is_active and not exists(
      select 1 from catalog.variant_attributes q where q.variant_id=v.id and q.attribute_key='quote_only' and q.value_json='true')
    on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;

  foreach grade in array internal.round_bar_grades() loop
    select coalesce(array_agg(sz order by sz),'{}'::integer[]) into missing
      from unnest(internal.round_bar_sizes()) sz where not exists(
        select 1 from catalog.product_variants v
        join catalog.variant_attributes g on g.variant_id=v.id and g.attribute_key='grade'
        left join catalog.variant_attributes a on a.variant_id=v.id and a.attribute_key='size_group'
        where v.product_id=p_product and v.is_active and upper(trim(g.value_json#>>'{}'))=grade
          and not exists(select 1 from catalog.variant_attributes q where q.variant_id=v.id
            and q.attribute_key='quote_only' and q.value_json='true')
          and internal.catalog_size_matches(v.diameter_mm,coalesce(a.value_json#>>'{}',v.size_label),sz));

    insert into catalog.product_variants(product_id,sku,size_label,uom,min_order_qty,is_active)
      values(p_product,'RBA-QUOTE-'||p_product::text||'-'||grade,grade||' / Request quote',unit,minimum,cardinality(missing)>0)
      on conflict(sku) do update set size_label=excluded.size_label,uom=excluded.uom,
        min_order_qty=excluded.min_order_qty,is_active=excluded.is_active returning id into variant;
    insert into catalog.variant_attributes(variant_id,attribute_key,value_json) values
      (variant,'grade',to_jsonb(grade)),(variant,'quote_only','true'),
      (variant,'available_sizes',to_jsonb(missing))
      on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;
  end loop;
  insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
    select v.id,'availability_category',to_jsonb(c.slug)
    from catalog.product_variants v join catalog.products p on p.id=v.product_id join catalog.categories c on c.id=p.category_id where v.product_id=p_product and v.is_active
    on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;
end $$;

-- Remove unavailable grades from existing private sheets without changing costs.
-- Preserve the distinction between published sheets and unsaved draft revisions.
update catalog.category_grade_sheets s set
  rows=(select coalesce(jsonb_agg(r order by n),'[]') from jsonb_array_elements(s.rows) with ordinality e(r,n)
    where upper(trim(r->>'grade'))=any(internal.round_bar_grades())),
  published_revision=case when published_revision=revision then revision+1 else published_revision end,
  revision=revision+1,updated_at=now()
where category_id in(select id from catalog.categories where slug in ('round-bar-as-rolled','round-bright-bar'))
  and exists(select 1 from jsonb_array_elements(s.rows) r
    where not upper(trim(r->>'grade'))=any(internal.round_bar_grades()));

create or replace function internal.guard_round_bar_sheet() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from catalog.categories where id=new.category_id and slug in ('round-bar-as-rolled','round-bright-bar'))
    and exists(select 1 from jsonb_array_elements(new.rows) r
      where not coalesce(upper(trim(r->>'grade'))=any(internal.round_bar_grades()),false)) then
    raise exception 'This grade is unavailable for this round bar category' using errcode='22023';
  end if;
  return new;
end $$;
create or replace function internal.refresh_round_bar_sheet() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.product_id is not null and new.published_revision=new.revision then
    perform internal.sync_round_bar_availability(new.product_id);
  end if;
  return new;
end $$;
drop trigger if exists round_bar_sheet_guard on catalog.category_grade_sheets;
create trigger round_bar_sheet_guard before insert or update on catalog.category_grade_sheets
  for each row execute function internal.guard_round_bar_sheet();
drop trigger if exists round_bar_sheet_refresh on catalog.category_grade_sheets;
create trigger round_bar_sheet_refresh after insert or update on catalog.category_grade_sheets
  for each row execute function internal.refresh_round_bar_sheet();

-- Block reintroducing unavailable grades through the general product editor too.
create or replace function internal.guard_round_bar_grade() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.attribute_key='grade' and not coalesce(upper(trim(new.value_json#>>'{}'))=any(internal.round_bar_grades()),false)
    and exists(select 1 from catalog.product_variants v join catalog.products p on p.id=v.product_id
      join catalog.categories c on c.id=p.category_id where v.id=new.variant_id and c.slug in ('round-bar-as-rolled','round-bright-bar')) then
    raise exception 'This grade is unavailable for this round bar category' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists round_bar_grade_guard on catalog.variant_attributes;
create trigger round_bar_grade_guard before insert or update on catalog.variant_attributes
  for each row execute function internal.guard_round_bar_grade();

create or replace function internal.guard_round_bar_activation() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.is_active and exists(
    select 1 from catalog.products p join catalog.categories c on c.id=p.category_id
      join catalog.variant_attributes a on a.variant_id=new.id and a.attribute_key='grade'
    where p.id=new.product_id and c.slug in ('round-bar-as-rolled','round-bright-bar')
      and not coalesce(upper(trim(a.value_json#>>'{}'))=any(internal.round_bar_grades()),false)) then
    raise exception 'This grade is unavailable for this round bar category' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists round_bar_activation_guard on catalog.product_variants;
create trigger round_bar_activation_guard before insert or update on catalog.product_variants
  for each row execute function internal.guard_round_bar_activation();

select internal.sync_round_bar_availability(s.product_id) from catalog.category_grade_sheets s
  join catalog.categories c on c.id=s.category_id where c.slug in ('round-bar-as-rolled','round-bright-bar') and s.product_id is not null;

revoke all on function internal.round_bar_sizes(),internal.round_bar_grades(),
  internal.catalog_variant_size_matches(uuid,numeric,text,integer),internal.sync_round_bar_availability(uuid),
  internal.guard_round_bar_sheet(),internal.refresh_round_bar_sheet(),internal.guard_round_bar_grade(),internal.guard_round_bar_activation()
  from public,anon,authenticated;

-- Public RPC replacements follow; their authorization and signatures stay intact.
create or replace function public.fti_catalog_filtered_list(
  p_search text default '',p_category text default null,p_limit integer default 24,
  p_offset integer default 0,p_ids uuid[] default null,p_size integer default null,p_grade text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_size is not null and p_size <> all(array[
    8,10,12,16,17,18,19,20,21,22,23,24,25,26,27,28,30,32,34,36,38,40,42,
    45,48,50,51,53,56,60,63,65,68,70,72,75,80
  ]::integer[]) then
    raise exception 'Choose a size from the shared steel size list' using errcode='22023';
  end if;
  return (
    with available as (
      select v.*,p.name as product_name,p.description,p.category_id,p.slug,p.product_kind,p.purchase_mode,p.status,
        c.name as category,coalesce(a.attrs,'{}'::jsonb) as attributes,
        upper(trim(coalesce(a.attrs->>'grade',''))) as grade
      from catalog.product_variants v
      join catalog.products p on p.id=v.product_id and p.status='published'
      join catalog.categories c on c.id=p.category_id and c.is_active
      left join lateral (
        select jsonb_object_agg(attribute_key,value_json) attrs from catalog.variant_attributes where variant_id=v.id
      ) a on true
      where v.is_active and (p_category is null or c.slug=p_category)
        and internal.catalog_variant_size_matches(v.id,v.diameter_mm,coalesce(a.attrs->>'size_group',v.size_label),p_size)
    ), selected as (
      select * from available where nullif(trim(p_grade),'') is null or grade=upper(trim(p_grade))
    ), grouped as (
      select product_id as id,category_id,category,slug,product_name as name,description,product_kind,purchase_mode,status,
        jsonb_agg(jsonb_build_object('id',id,'sku',sku,'size_label',size_label,
          'diameter_mm',diameter_mm,'length_mm',length_mm,'uom',uom,'min_order_qty',min_order_qty,
          'pack_qty',pack_qty,'attributes',attributes) order by sku) as variants,
        lower(concat_ws(' ',product_name,description,category,product_kind,
          string_agg(concat_ws(' ',sku,size_label,attributes::text),' '))) as search_text
      from selected
      group by product_id,category_id,category,slug,product_name,description,product_kind,purchase_mode,status
    ), filtered as (
      select * from grouped where (p_ids is null or id=any(p_ids))
        and (coalesce(trim(p_search),'')='' or strpos(search_text,lower(trim(p_search)))>0)
    ), page_rows as (
      select * from filtered order by name,id
      limit greatest(1,least(coalesce(p_limit,24),50)) offset greatest(coalesce(p_offset,0),0)
    ) select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(page_rows)-'search_text') from page_rows),'[]'::jsonb),
      'total',(select count(*) from filtered),
      'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name',name) order by sort_order,name)
        from catalog.categories where is_active),'[]'::jsonb),
      'grades',case when p_category in ('round-bar-as-rolled','round-bright-bar') then to_jsonb(internal.round_bar_grades()) else to_jsonb(array[
        'MS','LC','FE-500','FE-550','FE-600','FE-600S','FE-550D','FE-650','FE-700',
        '16MNCR5','20MNCR5','30MNB5','30MNCR4','41CR4','42CRMO4','A-105','BORON','C-55','CK-45',
        'EN-15','EN-18','EN-18D','EN-19','EN-24','EN-353','EN-36A','EN-45','EN-45A','EN-8D',
        'EN-8DCR','EN-8DLHT','EN-9','S-45C','S-48C','SAE-1018','SAE-1541','SAE-4130','SAE-4140',
        'SAE-8620','SCM-420','SCM-435','ST-52.3'
      ]::text[]) end
    )
  );
end $$;
revoke all on function public.fti_catalog_filtered_list(text,text,integer,integer,uuid[],integer,text) from public,anon,authenticated;
grant execute on function public.fti_catalog_filtered_list(text,text,integer,integer,uuid[],integer,text) to anon,authenticated;

create or replace function public.fti_catalog_raw_order_submit(p_id uuid,p_variant uuid,p_size integer,p_quantity text,p_buyer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); v record; phone text; nm text; company text; location text;
 old sales.raw_material_requests; details jsonb; ref text; recipient record; attrs jsonb;
begin
 if p_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from sales.raw_material_requests where id=p_id;
 if found then
  if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
  if old.variant_id is distinct from p_variant or old.size_mm is distinct from p_size or old.quantity::text is distinct from
   (case when coalesce(p_quantity,'') ~ '^\d{1,12}(\.\d{1,3})?$' then p_quantity::numeric(18,3)::text else null end)
   or old.details->>'name' is distinct from trim(p_buyer->>'name') or old.details->>'business' is distinct from trim(p_buyer->>'business')
   or old.details->>'location' is distinct from trim(p_buyer->>'location') then
   raise exception 'This request ID was already used for different details' using errcode='22023'; end if;
  return jsonb_build_object('id',old.id,'reference',old.details->>'reference','replayed',true);
 end if;
 select '+' || regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
 if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering' using errcode='22023'; end if;
 nm:=trim(coalesce(p_buyer->>'name','')); company:=trim(coalesce(p_buyer->>'business','')); location:=trim(coalesce(p_buyer->>'location',''));
 if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
 or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
  raise exception 'Enter buyer name, business and delivery location, and agree to WhatsApp order updates' using errcode='22023'; end if;
 if coalesce(p_quantity,'') !~ '^\d{1,12}(\.\d{1,3})?$' then raise exception 'Enter a valid quantity with up to 3 decimal places' using errcode='22023'; end if;
 select pv.*,p.name as product_name,c.name as category_name into v from catalog.product_variants pv
 join catalog.products p on p.id=pv.product_id join catalog.categories c on c.id=p.category_id
 where pv.id=p_variant and pv.is_active and p.status='published' and p.product_kind='steel' and c.is_active for share of pv,p,c;
 if not found then raise exception 'This raw material is no longer available' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(attribute_key,value_json),'{}') into attrs from catalog.variant_attributes where variant_id=p_variant;
 if p_size is null or p_size<=0 or not internal.catalog_variant_size_matches(v.id,v.diameter_mm,coalesce(attrs->>'size_group',v.size_label),p_size)
 or nullif(trim(attrs->>'grade'),'') is null then raise exception 'Choose an available size and grade' using errcode='22023'; end if;
 if p_quantity::numeric<=0 or p_quantity::numeric<v.min_order_qty then raise exception 'Quantity is below the minimum order' using errcode='22023'; end if;
 if (select count(*) from sales.raw_material_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then
  raise exception 'Too many requests. Please try again later' using errcode='22023'; end if;
 ref:='FTI-RM-'||upper(replace(p_id::text,'-',''));
 details:=jsonb_build_object('reference',ref,'material',left(v.product_name,100),'category',v.category_name,'size',p_size||' mm',
  'grade',left(attrs->>'grade',100),'quantity',p_quantity::numeric::text||' '||v.uom,'name',nm,'business',company,'phone',phone,'location',location);
 insert into sales.raw_material_requests(id,buyer_id,variant_id,size_mm,quantity,details) values(p_id,actor,p_variant,p_size,p_quantity::numeric,details);
 insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_raw_material_received_v1',
  jsonb_build_array(nm,ref,details->>'material',details->>'size',details->>'grade',details->>'quantity'));
 for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
  insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_raw_material_admin_v1',
   jsonb_build_array(ref,details->>'material',details->>'size',details->>'grade',details->>'quantity',nm,company,phone,location));
 end loop;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'raw_material.submitted','raw_material_request',p_id);
 return jsonb_build_object('id',p_id,'reference',ref,'replayed',false);
end $$;


notify pgrst,'reload schema';
commit;

