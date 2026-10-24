-- Category-specific, explicit availability; price sheets and legacy IDs remain intact.
begin;

create or replace function internal.selection_dimensions_valid(p_dimensions jsonb,p_keys text[]) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; amount text;
begin
  if jsonb_typeof(p_dimensions) is distinct from 'object' or cardinality(p_keys) not between 1 and 4 then return false; end if;
  if not p_dimensions ? p_keys[1] or exists(select 1 from jsonb_object_keys(p_dimensions) key where not key=any(p_keys)) then return false; end if;
  for k in select jsonb_object_keys(p_dimensions) loop
    if jsonb_typeof(p_dimensions->k) is distinct from 'number' then return false; end if;
    amount:=p_dimensions->>k;
    if amount !~ '^\d{1,9}(\.\d{1,3})?$' or amount::numeric<=0 then return false; end if;
  end loop;
  return true;
end $$;

create table if not exists catalog.category_specs (
  category_id uuid primary key references catalog.categories(id),
  dimension_label text not null check(length(trim(dimension_label)) between 1 and 60),
  dimension_keys text[] not null check(cardinality(dimension_keys) between 1 and 4
    and dimension_keys <@ array['diameter_mm','thickness_mm','width_mm','height_mm','length_mm','side_mm','size_mm']::text[]),
  enabled boolean not null default true
);
create table if not exists catalog.category_sizes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references catalog.category_specs(category_id),
  label text not null check(length(trim(label)) between 1 and 80),
  dimensions jsonb not null check(jsonb_typeof(dimensions)='object'),
  enabled boolean not null default true,
  sort_order numeric(12,3) not null default 0,
  unique(category_id,dimensions), unique(id,category_id)
);
create unique index if not exists products_id_category_unique on catalog.products(id,category_id);
create unique index if not exists variants_id_product_unique on catalog.product_variants(id,product_id);
create table if not exists catalog.availability_options (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references catalog.category_specs(category_id),
  product_id uuid not null,
  size_id uuid not null,
  grade text not null check(length(grade) between 1 and 80 and grade=upper(trim(grade))),
  uom text not null check(uom in ('kg','MT','piece','box','bundle')),
  min_order_qty numeric(18,3) not null check(min_order_qty>0),
  variant_id uuid,
  enabled boolean not null default true,
  source text not null default 'manual' check(source in ('manual','variant')),
  source_active boolean not null default true,
  foreign key(product_id,category_id) references catalog.products(id,category_id),
  foreign key(size_id,category_id) references catalog.category_sizes(id,category_id),
  foreign key(variant_id,product_id) references catalog.product_variants(id,product_id),
  unique(product_id,size_id,grade)
);
create index if not exists availability_category_size on catalog.availability_options(category_id,size_id);
create index if not exists availability_size on catalog.availability_options(size_id);
create index if not exists availability_variant on catalog.availability_options(variant_id);
alter table catalog.category_specs enable row level security;
alter table catalog.category_sizes enable row level security;
alter table catalog.availability_options enable row level security;
revoke all on catalog.category_specs,catalog.category_sizes,catalog.availability_options from public,anon,authenticated;

-- Decimal and multi-dimensional selections are stored as immutable request details.
-- Legacy requests continue to have their original integer size and variant fields.
alter table sales.raw_material_requests add column if not exists option_id uuid references catalog.availability_options(id);
alter table sales.raw_material_requests alter column variant_id drop not null;
alter table sales.raw_material_requests alter column size_mm drop not null;
create index if not exists raw_material_option on sales.raw_material_requests(option_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='sales.raw_material_requests'::regclass and conname='raw_material_selection_required') then
    alter table sales.raw_material_requests add constraint raw_material_selection_required
      check(option_id is not null or (variant_id is not null and size_mm is not null));
  end if;
end $$;

insert into catalog.category_specs(category_id,dimension_label,dimension_keys)
select id,case when slug='sheet' then 'Thickness (mm)' when slug='flat' then 'Thickness × width (mm)'
  when slug='square' then 'Side (mm)' else 'Diameter (mm)' end,
  case when slug='sheet' then array['thickness_mm'] when slug='flat' then array['thickness_mm','width_mm']
    when slug='square' then array['side_mm'] else array['diameter_mm'] end
from catalog.categories where slug in ('round-bar-as-rolled','round-bright-bar','tmt','sheet','flat','square')
on conflict(category_id) do nothing;

-- A linked pricing variant may cover a range, but this helper never creates stock.
create or replace function internal.selection_variant_matches(p_variant uuid,p_dimensions jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare v record; attrs jsonb; amount numeric; label text; parts text[];
begin
  select * into v from catalog.product_variants where id=p_variant;
  if not found then return false; end if;
  select coalesce(jsonb_object_agg(attribute_key,value_json),'{}') into attrs from catalog.variant_attributes where variant_id=p_variant;
  if jsonb_typeof(attrs->'dimensions')='object' then return attrs->'dimensions'=p_dimensions; end if;
  label:=upper(trim(coalesce(attrs->>'size_group',v.size_label,'')));
  if label='ALL SIZES' then return true; end if;
  if (select count(*) from jsonb_object_keys(p_dimensions))<>1 then return false; end if;
  select value::text::numeric into amount from jsonb_each(p_dimensions);
  if jsonb_typeof(attrs->'available_sizes')='array' then return attrs->'available_sizes' @> jsonb_build_array(amount); end if;
  if v.diameter_mm is not null then return v.diameter_mm=amount; end if;
  parts:=regexp_match(label,'^([0-9]+(?:\.[0-9]+)?)\s*(?:MM)?\s*(?:TO|[-–])\s*([0-9]+(?:\.[0-9]+)?)\s*(?:MM)?$');
  if parts is not null then return amount between parts[1]::numeric and parts[2]::numeric; end if;
  parts:=regexp_match(label,'^([0-9]+(?:\.[0-9]+)?)\s*MM$');
  return coalesce(amount=parts[1]::numeric,false);
end $$;

create or replace function internal.sync_material_selection(p_product uuid) returns void
language plpgsql set search_path='' as $$
declare product record; spec catalog.category_specs; v record; attrs jsonb; candidates jsonb;
  candidate jsonb; dims jsonb; sz uuid; gr text; label text; amount numeric; exact text[];
begin
  select p.*,c.slug as category_slug into product from catalog.products p join catalog.categories c on c.id=p.category_id
    where p.id=p_product and p.product_kind='steel';
  if not found then return; end if;
  select * into spec from catalog.category_specs where category_id=product.category_id;
  if not found then return; end if;
  update catalog.availability_options set source_active=false where product_id=p_product and source='variant';
  -- Process quote-only rows first so an overlapping priced variant wins deterministically.
  for v in select pv.* from catalog.product_variants pv where pv.product_id=p_product and pv.is_active
    order by exists(select 1 from catalog.variant_attributes a where a.variant_id=pv.id and a.attribute_key='quote_only' and a.value_json='true') desc,pv.id loop
    select coalesce(jsonb_object_agg(attribute_key,value_json),'{}') into attrs from catalog.variant_attributes where variant_id=v.id;
    gr:=upper(trim(coalesce(attrs->>'grade','')));
    if gr='' then continue; end if;
    if product.category_slug in ('round-bar-as-rolled','round-bright-bar') and not gr=any(internal.round_bar_grades()) then continue; end if;
    candidates:='[]';
    if internal.selection_dimensions_valid(attrs->'dimensions',spec.dimension_keys) then
      candidates:=jsonb_build_array(attrs->'dimensions');
    else
      if jsonb_typeof(attrs->'available_sizes')='array' then
        select coalesce(jsonb_agg(jsonb_build_object(spec.dimension_keys[1],value)),'[]') into candidates
          from jsonb_array_elements(attrs->'available_sizes') where jsonb_typeof(value)='number';
      elsif v.diameter_mm is not null then
        candidates:=jsonb_build_array(jsonb_build_object(spec.dimension_keys[1],v.diameter_mm));
      else
        exact:=regexp_match(upper(trim(coalesce(attrs->>'size_group',v.size_label,''))),'^([0-9]+(?:\.[0-9]+)?)\s*MM$');
        if exact is not null then candidates:=jsonb_build_array(jsonb_build_object(spec.dimension_keys[1],exact[1]::numeric)); end if;
      end if;
    end if;
    for candidate in select value from jsonb_array_elements(candidates) loop
      dims:=candidate;
      if not internal.selection_dimensions_valid(dims,spec.dimension_keys) then continue; end if;
      if product.category_slug in ('round-bar-as-rolled','round-bright-bar') and
        ((select count(*) from jsonb_object_keys(dims))<>1 or
          not coalesce((dims->>'diameter_mm')::numeric=any(internal.round_bar_sizes()::numeric[]),false)) then continue; end if;
      if (select count(*) from jsonb_object_keys(dims))=1 then
        amount:=(dims->>spec.dimension_keys[1])::numeric;
        label:=regexp_replace(trim(to_char(amount,'FM999999999.999')),'\.$','')||' mm';
      else
        amount:=0;
        select string_agg(regexp_replace(trim(to_char((dims->>k)::numeric,'FM999999999.999')),'\.$',''),' × ' order by n)||' mm' into label
          from unnest(spec.dimension_keys) with ordinality keys(k,n) where dims ? k;
      end if;
      insert into catalog.category_sizes(category_id,label,dimensions,sort_order)
        values(product.category_id,label,dims,amount)
        on conflict(category_id,dimensions) do update set dimensions=excluded.dimensions returning id into sz;
      insert into catalog.availability_options(category_id,product_id,size_id,grade,uom,min_order_qty,variant_id,source,source_active)
        values(product.category_id,p_product,sz,gr,v.uom,v.min_order_qty,v.id,'variant',true)
        on conflict(product_id,size_id,grade) do update set variant_id=excluded.variant_id,uom=excluded.uom,
          min_order_qty=excluded.min_order_qty,source_active=true where catalog.availability_options.source='variant';
    end loop;
  end loop;
end $$;

-- This trigger sorts after round_bar_sheet_refresh, which refreshes its source variants.
create or replace function internal.refresh_material_selection_sheet() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.product_id is not null and new.published_revision=new.revision then
    perform internal.sync_material_selection(new.product_id);
  end if;
  return new;
end $$;
drop trigger if exists zz_material_selection_sheet on catalog.category_grade_sheets;
create trigger zz_material_selection_sheet after insert or update on catalog.category_grade_sheets
  for each row execute function internal.refresh_material_selection_sheet();
select internal.sync_material_selection(id) from catalog.products where product_kind='steel';

-- General catalogue saves log only after their variants and attributes are complete.
create or replace function internal.refresh_material_selection_product() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.action='catalog.product.upsert' and new.resource_id is not null then
    perform internal.sync_material_selection(new.resource_id);
  end if;
  return new;
end $$;
drop trigger if exists material_selection_product_saved on platform.audit_logs;
create trigger material_selection_product_saved after insert on platform.audit_logs
  for each row when(new.action='catalog.product.upsert') execute function internal.refresh_material_selection_product();

create or replace view internal.material_selection_available as
select o.id,o.category_id,o.product_id,o.size_id,o.grade,o.uom,
  greatest(o.min_order_qty,coalesce(v.min_order_qty,o.min_order_qty)) as min_order_qty,o.variant_id,
  p.name as product_name,c.name as category_name,c.slug as category_slug,s.label as size_label,s.dimensions,
  coalesce(a.attributes,jsonb_build_object('grade',o.grade,'quote_only',true)) as attributes
from catalog.availability_options o
join catalog.products p on p.id=o.product_id and p.category_id=o.category_id and p.status='published' and p.product_kind='steel'
join catalog.categories c on c.id=o.category_id and c.is_active
join catalog.category_specs spec on spec.category_id=c.id and spec.enabled
join catalog.category_sizes s on s.id=o.size_id and s.category_id=c.id and s.enabled
left join catalog.product_variants v on v.id=o.variant_id and v.product_id=o.product_id
left join lateral(select jsonb_object_agg(attribute_key,value_json) attributes from catalog.variant_attributes where variant_id=v.id) a on true
where o.enabled and o.source_active and internal.selection_dimensions_valid(s.dimensions,spec.dimension_keys)
  and (c.slug not in ('round-bar-as-rolled','round-bright-bar') or (
    o.grade=any(internal.round_bar_grades()) and (select count(*) from jsonb_object_keys(s.dimensions))=1
    and coalesce((s.dimensions->>'diameter_mm')::numeric=any(internal.round_bar_sizes()::numeric[]),false)))
  and (o.variant_id is null or (v.is_active and v.uom=o.uom
  and upper(trim(a.attributes->>'grade'))=o.grade and internal.selection_variant_matches(v.id,s.dimensions)));
revoke all on internal.material_selection_available from public,anon,authenticated;

create or replace function public.fti_catalog_selection_options(p_category text default null,p_size_id uuid default null,p_product uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cat record; sizes jsonb:='[]'; opts jsonb:='[]';
begin
  select c.id,c.slug,c.name,'steel'::text as product_kind,s.dimension_label,s.dimension_keys into cat
    from catalog.categories c join catalog.category_specs s on s.category_id=c.id and s.enabled
    where c.is_active and (c.slug=p_category or (p_category is null and exists(
      select 1 from catalog.products p where p.id=p_product and p.category_id=c.id and p.status='published' and p.product_kind='steel')));
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'dimensions',s.dimensions) order by s.sort_order,s.label),'[]') into sizes
      from catalog.category_sizes s where s.category_id=cat.id and s.enabled and exists(
        select 1 from internal.material_selection_available a where a.size_id=s.id and (p_product is null or a.product_id=p_product));
    if p_size_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'product_id',a.product_id,'product_name',a.product_name,
        'grade',a.grade,'uom',a.uom,'min_order_qty',a.min_order_qty,'variant_id',a.variant_id,'attributes',a.attributes)
        order by a.grade,a.product_name,a.id),'[]') into opts from internal.material_selection_available a
        where a.category_id=cat.id and a.size_id=p_size_id and (p_product is null or a.product_id=p_product);
    end if;
  end if;
  return jsonb_build_object('categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,
    'product_kind','steel','dimension_label',s.dimension_label) order by c.sort_order,c.name)
    from catalog.categories c join catalog.category_specs s on s.category_id=c.id and s.enabled where c.is_active),'[]'),
    'category',case when cat.id is null then null else to_jsonb(cat) end,'sizes',sizes,'options',opts);
end $$;

create or replace function public.fti_catalog_selection_admin(p_category uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform internal.identity_staff('catalog.manage');
  return jsonb_build_object('spec',(select to_jsonb(s) from catalog.category_specs s where category_id=p_category),
    'sizes',coalesce((select jsonb_agg(to_jsonb(s) order by sort_order,label) from catalog.category_sizes s where category_id=p_category),'[]'),
    'options',coalesce((select jsonb_agg(to_jsonb(o) order by grade,size_id) from catalog.availability_options o where category_id=p_category),'[]'),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'variants',coalesce((
      select jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size_label',v.size_label,'uom',v.uom,'min_order_qty',v.min_order_qty,
        'is_active',v.is_active,'attributes',coalesce((select jsonb_object_agg(attribute_key,value_json) from catalog.variant_attributes where variant_id=v.id),'{}')) order by v.sku)
      from catalog.product_variants v where v.product_id=p.id),'[]')) order by p.name)
      from catalog.products p where p.category_id=p_category and p.product_kind='steel'),'[]'));
end $$;

create or replace function public.fti_catalog_selection_spec_save(p_category uuid,p_dimension_label text,p_dimension_keys text[]) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage');
begin
  perform 1 from catalog.categories where id=p_category and is_active for update;
  if not found then raise exception 'Choose an active category' using errcode='22023'; end if;
  if length(trim(coalesce(p_dimension_label,''))) not between 1 and 60 or cardinality(p_dimension_keys) not between 1 and 4
    or p_dimension_keys is null or array_position(p_dimension_keys,null) is not null
    or not p_dimension_keys <@ array['diameter_mm','thickness_mm','width_mm','height_mm','length_mm','side_mm','size_mm']::text[]
    or (select count(distinct k) from unnest(p_dimension_keys) k)<>cardinality(p_dimension_keys) then
    raise exception 'Choose one to four unique dimension fields and a label' using errcode='22023';
  end if;
  if exists(select 1 from catalog.category_sizes where category_id=p_category and not internal.selection_dimensions_valid(dimensions,p_dimension_keys)) then
    raise exception 'Existing sizes use different dimensions; keep their fields' using errcode='22023';
  end if;
  insert into catalog.category_specs(category_id,dimension_label,dimension_keys) values(p_category,trim(p_dimension_label),p_dimension_keys)
    on conflict(category_id) do update set dimension_label=excluded.dimension_label,dimension_keys=excluded.dimension_keys;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'catalog.selection.spec.save','category',p_category);
end $$;

create or replace function public.fti_catalog_selection_size_save(p_category uuid,p_size jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); spec catalog.category_specs; sid uuid:=nullif(p_size->>'id','')::uuid;
  dimensions jsonb:=p_size->'dimensions'; size_label text:=trim(coalesce(p_size->>'label',''));
begin
  perform 1 from catalog.categories where id=p_category for update;
  select * into spec from catalog.category_specs where category_id=p_category for update;
  if not found then raise exception 'Configure the category dimensions first' using errcode='22023'; end if;
  if not internal.selection_dimensions_valid(dimensions,spec.dimension_keys) or length(size_label) not between 1 and 80
    or jsonb_typeof(p_size->'enabled') is distinct from 'boolean' then
    raise exception 'Enter a label, positive dimensions (up to 3 decimals) and availability' using errcode='22023';
  end if;
  if sid is not null then
    if not exists(select 1 from catalog.category_sizes where id=sid and category_id=p_category) then raise exception 'Size does not belong to this category' using errcode='22023'; end if;
    if exists(select 1 from catalog.category_sizes cs where cs.id=sid and cs.dimensions<>p_size->'dimensions') then
      raise exception 'Create a new size to change dimensions; existing size IDs preserve requests' using errcode='22023';
    end if;
    update catalog.category_sizes set label=size_label,enabled=(p_size->>'enabled')::boolean,
      sort_order=coalesce((p_size->>'sort_order')::numeric,sort_order) where id=sid;
  else
    insert into catalog.category_sizes(category_id,label,dimensions,enabled,sort_order)
      values(p_category,size_label,dimensions,(p_size->>'enabled')::boolean,coalesce((p_size->>'sort_order')::numeric,0)) returning id into sid;
  end if;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'catalog.selection.size.save','category_size',sid);
  return sid;
end $$;

create or replace function public.fti_catalog_selection_option_save(p_category uuid,p_option jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); oid uuid:=nullif(p_option->>'id','')::uuid;
  product uuid:=nullif(p_option->>'product_id','')::uuid; sz uuid:=nullif(p_option->>'size_id','')::uuid;
  variant uuid:=nullif(p_option->>'variant_id','')::uuid; gr text:=upper(trim(coalesce(p_option->>'grade','')));
  unit text:=p_option->>'uom'; qty text:=p_option->>'min_order_qty'; dims jsonb; linked record; slug text;
begin
  select c.slug into slug from catalog.categories c join catalog.products p on p.category_id=c.id
    where p.id=product and c.id=p_category and p.product_kind='steel' for update of c;
  if not found then raise exception 'Choose a steel product in this category' using errcode='22023'; end if;
  select dimensions into dims from catalog.category_sizes where id=sz and category_id=p_category;
  if not found then raise exception 'Choose a size in this category' using errcode='22023'; end if;
  if length(gr) not between 1 and 80 or coalesce(unit,'') not in ('kg','MT','piece','box','bundle')
    or coalesce(qty,'') !~ '^\d{1,12}(\.\d{1,3})?$' or jsonb_typeof(p_option->'enabled') is distinct from 'boolean' then
    raise exception 'Enter grade, unit, positive minimum quantity and availability' using errcode='22023';
  end if;
  if qty::numeric<=0 then raise exception 'Minimum quantity must be positive' using errcode='22023'; end if;
  if slug in ('round-bar-as-rolled','round-bright-bar') and (not gr=any(internal.round_bar_grades())
    or not coalesce((dims->>'diameter_mm')::numeric=any(internal.round_bar_sizes()::numeric[]),false)) then
    raise exception 'Choose a size and grade from the approved round bar list' using errcode='22023';
  end if;
  if variant is not null then
    select v.*,a.value_json#>>'{}' as grade into linked from catalog.product_variants v
      join catalog.variant_attributes a on a.variant_id=v.id and a.attribute_key='grade' where v.id=variant and v.product_id=product;
    if not found or upper(trim(linked.grade))<>gr or linked.uom<>unit or qty::numeric<linked.min_order_qty
      or not internal.selection_variant_matches(variant,dims) then
      raise exception 'Pricing variant must match product, size, grade, unit and minimum quantity' using errcode='22023';
    end if;
  end if;
  if oid is not null then
    if not exists(select 1 from catalog.availability_options where id=oid and category_id=p_category and product_id=product and size_id=sz and grade=gr) then
      raise exception 'Option identity cannot change; add a new combination instead' using errcode='22023';
    end if;
    update catalog.availability_options set variant_id=variant,uom=unit,min_order_qty=qty::numeric,
      enabled=(p_option->>'enabled')::boolean,source='manual',source_active=true where id=oid;
  else
    insert into catalog.availability_options(category_id,product_id,size_id,grade,uom,min_order_qty,variant_id,enabled,source)
      values(p_category,product,sz,gr,unit,qty::numeric,variant,(p_option->>'enabled')::boolean,'manual') returning id into oid;
  end if;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'catalog.selection.option.save','availability_option',oid);
  return oid;
end $$;

create or replace function public.fti_catalog_selection_request_submit(p_id uuid,p_option_id uuid,p_quantity text,p_buyer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); chosen record; old sales.raw_material_requests; details jsonb;
  phone text; nm text:=trim(coalesce(p_buyer->>'name','')); company text:=trim(coalesce(p_buyer->>'business',''));
  location text:=trim(coalesce(p_buyer->>'location','')); ref text; recipient record; legacy_size integer;
begin
  if p_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into old from sales.raw_material_requests where id=p_id;
  if found then
    if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
    if old.option_id is distinct from p_option_id or old.quantity::text is distinct from
      (case when coalesce(p_quantity,'') ~ '^\d{1,12}(\.\d{1,3})?$' then p_quantity::numeric(18,3)::text else null end)
      or old.details->>'name' is distinct from nm or old.details->>'business' is distinct from company
      or old.details->>'location' is distinct from location or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
      raise exception 'This request ID was already used for different details' using errcode='22023';
    end if;
    return jsonb_build_object('id',old.id,'reference',old.details->>'reference','replayed',true);
  end if;
  select '+'||regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
  if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering' using errcode='22023'; end if;
  if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
    or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
    raise exception 'Enter buyer name, business and delivery location, and agree to WhatsApp order updates' using errcode='22023';
  end if;
  if coalesce(p_quantity,'') !~ '^\d{1,12}(\.\d{1,3})?$' then raise exception 'Enter a valid quantity with up to 3 decimal places' using errcode='22023'; end if;
  -- All selection writers and grade publication lock category first. Acquire its
  -- shared lock before subordinate rows so concurrent admin edits cannot invert
  -- the category/spec/size/option lock hierarchy.
  perform 1 from catalog.categories c join catalog.availability_options o on o.category_id=c.id
    where o.id=p_option_id for share of c;
  perform 1 from catalog.products p join catalog.availability_options o on o.product_id=p.id
    where o.id=p_option_id for share of p;
  perform 1 from catalog.product_variants v join catalog.availability_options o on o.variant_id=v.id where o.id=p_option_id for share of v;
  -- Lock every editable availability row before reading the current public option.
  perform 1 from catalog.availability_options o join catalog.category_sizes s on s.id=o.size_id
    join catalog.category_specs spec on spec.category_id=o.category_id join catalog.products p on p.id=o.product_id
    join catalog.categories c on c.id=o.category_id where o.id=p_option_id for share of o,s,spec,p,c;
  select * into chosen from internal.material_selection_available where id=p_option_id;
  if not found then raise exception 'This size and grade are no longer available; choose again' using errcode='22023'; end if;
  if p_quantity::numeric<=0 or p_quantity::numeric<chosen.min_order_qty then raise exception 'Quantity is below the minimum order' using errcode='22023'; end if;
  if (select count(*) from sales.raw_material_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Too many requests. Please try again later' using errcode='22023'; end if;
  ref:='FTI-RM-'||upper(replace(p_id::text,'-',''));
  if (select count(*) from jsonb_object_keys(chosen.dimensions))=1 then
    select case when value::text::numeric=trunc(value::text::numeric) and value::text::numeric<=2147483647 then value::text::numeric::integer else null end
      into legacy_size from jsonb_each(chosen.dimensions);
  end if;
  details:=jsonb_build_object('reference',ref,'material',left(chosen.product_name,100),'category',chosen.category_name,
    'size',chosen.size_label,'dimensions',chosen.dimensions,'grade',chosen.grade,'quantity',p_quantity::numeric::text||' '||chosen.uom,
    'uom',chosen.uom,'option_id',chosen.id,'price_state',case when chosen.attributes ? 'grade_list_price' or chosen.attributes ? 'sheet_flat_net_prate' then 'published' else 'request_quote' end,
    'published_price',coalesce(chosen.attributes->'grade_list_price',chosen.attributes->'sheet_flat_net_prate'),
    'name',nm,'business',company,'phone',phone,'location',location);
  insert into sales.raw_material_requests(id,buyer_id,option_id,variant_id,size_mm,quantity,details)
    values(p_id,actor,chosen.id,chosen.variant_id,legacy_size,p_quantity::numeric,details);
  insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_raw_material_received_v1',
    jsonb_build_array(nm,ref,details->>'material',details->>'size',details->>'grade',details->>'quantity'));
  for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
    insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_raw_material_admin_v1',
      jsonb_build_array(ref,details->>'material',details->>'size',details->>'grade',details->>'quantity',nm,company,phone,location));
  end loop;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'raw_material.submitted','raw_material_request',p_id);
  return jsonb_build_object('id',p_id,'reference',ref,'replayed',false);
end $$;

revoke all on function internal.selection_dimensions_valid(jsonb,text[]),internal.selection_variant_matches(uuid,jsonb),
  internal.sync_material_selection(uuid),internal.refresh_material_selection_sheet(),internal.refresh_material_selection_product() from public,anon,authenticated;
revoke all on function public.fti_catalog_selection_options(text,uuid,uuid),public.fti_catalog_selection_admin(uuid),
  public.fti_catalog_selection_spec_save(uuid,text,text[]),public.fti_catalog_selection_size_save(uuid,jsonb),
  public.fti_catalog_selection_option_save(uuid,jsonb),public.fti_catalog_selection_request_submit(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.fti_catalog_selection_options(text,uuid,uuid) to anon,authenticated;
grant execute on function public.fti_catalog_selection_admin(uuid),public.fti_catalog_selection_spec_save(uuid,text,text[]),
  public.fti_catalog_selection_size_save(uuid,jsonb),public.fti_catalog_selection_option_save(uuid,jsonb),
  public.fti_catalog_selection_request_submit(uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
