-- Reusable category sheets. Cost components are private; publication copies only
-- base/final prices and specifications to the public catalogue in one transaction.
begin;

create table if not exists catalog.category_grade_sheets (
  category_id uuid primary key references catalog.categories(id),
  product_id uuid unique references catalog.products(id),
  product_kind text not null check (product_kind in ('steel','fastener','other')),
  uom text not null check (uom in ('kg','MT','piece','box','bundle')),
  min_order_qty numeric(18,3) not null check (min_order_qty > 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  revision integer not null default 1,
  published_revision integer,
  updated_at timestamptz not null default now()
);
alter table catalog.category_grade_sheets enable row level security;
revoke all on catalog.category_grade_sheets from public, anon, authenticated;

create or replace function internal.catalog_grade_rows(p_rows jsonb, p_previous jsonb, p_publish boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  item jsonb; grp jsonb; cleaned jsonb; groups jsonb; result jsonb := '[]';
  grades text[] := '{}'; labels text[]; ids uuid[] := '{}'; group_id uuid;
  grade text; label text; field text; amount text;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Add a list of brands or grades' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception 'Add between 1 and 100 brands or grades' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    grade := upper(trim(coalesce(item->>'grade','')));
    if length(grade) not between 1 and 80 or grade = any(grades) then
      raise exception 'Brand or grade is missing, duplicated or too long' using errcode='22023';
    end if;
    grades := array_append(grades,grade);
    cleaned := jsonb_build_object('grade',grade);
    foreach field in array array['base_price','base_charge','profile','rolling'] loop
      amount := trim(coalesce(item->>field,''));
      if (amount <> '' or p_publish) and amount !~ '^\d{1,12}(\.\d{1,4})?$' then
        raise exception 'Enter valid non-negative prices (up to 12 digits and 4 decimals); all prices are required to publish' using errcode='22023';
      end if;
      if p_publish and field = 'base_price' and amount::numeric <= 0 then
        raise exception 'Base price must be greater than zero to publish' using errcode='22023';
      end if;
      cleaned := cleaned || jsonb_build_object(field,amount);
    end loop;
    if jsonb_typeof(item->'size_groups') is distinct from 'array' then
      raise exception 'Add size groups for each brand or grade' using errcode='22023';
    end if;
    if jsonb_array_length(item->'size_groups') not between 1 and 10 then
      raise exception 'Add between 1 and 10 size groups per brand or grade' using errcode='22023';
    end if;
    groups := '[]'; labels := '{}';
    for grp in select value from jsonb_array_elements(item->'size_groups') loop
      label := trim(coalesce(grp->>'label',''));
      if length(label) not between 1 and 100 or upper(label) = any(labels) then
        raise exception 'Size group is missing, duplicated or too long' using errcode='22023';
      end if;
      labels := array_append(labels,upper(label));
      amount := trim(coalesce(grp->>'add_price',''));
      if (amount <> '' or p_publish) and amount !~ '^\d{1,12}(\.\d{1,4})?$' then
        raise exception 'Enter a valid size addition; use 0 for no addition' using errcode='22023';
      end if;
      group_id := nullif(grp->>'id','')::uuid;
      if group_id is not null and not exists (
        select 1 from jsonb_array_elements(coalesce(p_previous,'[]')) r,
          jsonb_array_elements(r->'size_groups') g where g->>'id'=group_id::text
      ) then
        raise exception 'Size group does not belong to this sheet; reload and try again' using errcode='22023';
      end if;
      group_id := coalesce(group_id,gen_random_uuid());
      if group_id = any(ids) then
        raise exception 'Size group identifiers must be unique' using errcode='22023';
      end if;
      ids := array_append(ids,group_id);
      groups := groups || jsonb_build_array(jsonb_build_object('id',group_id,'label',label,'add_price',amount));
    end loop;
    result := result || jsonb_build_array(cleaned || jsonb_build_object('size_groups',groups));
  end loop;
  return result;
end $$;
revoke all on function internal.catalog_grade_rows(jsonb,jsonb,boolean) from public, anon, authenticated;

create or replace function public.fti_catalog_grade_sheet_get(p_category uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform internal.identity_staff('catalog.manage');
  perform internal.identity_staff('price.manage');
  select to_jsonb(s) || jsonb_build_object('min_order_qty',s.min_order_qty::text,'product_status',p.status)
    into result from catalog.category_grade_sheets s
    left join catalog.products p on p.id=s.product_id where s.category_id=p_category;
  return result;
end $$;

create or replace function public.fti_catalog_grade_sheet_save(p_category uuid, p_revision integer, p_sheet jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('catalog.manage');
  current_sheet catalog.category_grade_sheets%rowtype; cleaned jsonb;
  kind text := p_sheet->>'product_kind'; unit text := p_sheet->>'uom';
  qty text := trim(coalesce(p_sheet->>'min_order_qty',''));
begin
  perform internal.identity_staff('price.manage');
  -- Category lock also serializes the first save when no sheet exists yet.
  perform 1 from catalog.categories where id=p_category and is_active for update;
  if not found then raise exception 'Choose an active category' using errcode='22023'; end if;
  select * into current_sheet from catalog.category_grade_sheets where category_id=p_category for update;
  if current_sheet.revision is distinct from p_revision then
    raise exception 'This list changed. Reload it before saving' using errcode='22023';
  end if;
  if kind is null or kind not in ('steel','fastener','other') or unit is null or unit not in ('kg','MT','piece','box','bundle')
    or qty !~ '^\d{1,12}(\.\d{1,3})?$' then
    raise exception 'Choose a product type, price unit and positive minimum order quantity' using errcode='22023';
  end if;
  if qty::numeric <= 0 then raise exception 'Minimum order must be positive' using errcode='22023'; end if;
  cleaned := internal.catalog_grade_rows(p_sheet->'rows',current_sheet.rows,false);
  insert into catalog.category_grade_sheets(category_id,product_kind,uom,min_order_qty,rows)
    values(p_category,kind,unit,qty::numeric,cleaned)
  on conflict(category_id) do update set product_kind=excluded.product_kind,uom=excluded.uom,
    min_order_qty=excluded.min_order_qty,rows=excluded.rows,
    revision=catalog.category_grade_sheets.revision+1,updated_at=now();
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
    values(actor,'catalog.grade_sheet.save','category',p_category,jsonb_build_object('revision',coalesce(p_revision,0)+1,'rows',cleaned));
  return public.fti_catalog_grade_sheet_get(p_category);
end $$;

create or replace function public.fti_catalog_grade_sheet_publish(p_category uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('catalog.manage');
  sheet catalog.category_grade_sheets%rowtype; cat catalog.categories%rowtype;
  product uuid; item jsonb; grp jsonb; net numeric; final_price numeric; variant uuid;
begin
  perform internal.identity_staff('price.publish');
  select * into cat from catalog.categories where id=p_category and is_active for update;
  if not found then raise exception 'Choose an active category' using errcode='22023'; end if;
  select * into sheet from catalog.category_grade_sheets where category_id=p_category for update;
  if not found or p_revision is null or sheet.revision <> p_revision then
    raise exception 'This list changed. Reload it before publishing' using errcode='22023';
  end if;
  perform internal.catalog_grade_rows(sheet.rows,sheet.rows,true);
  product := sheet.product_id;
  if product is null then
    insert into catalog.products(category_id,slug,name,product_kind,purchase_mode,status)
      values(p_category,cat.slug || '-grade-list',cat.name,sheet.product_kind,'rfq','draft') returning id into product;
  end if;
  update catalog.products set name=cat.name,product_kind=sheet.product_kind,
    purchase_mode='rfq',status='published',updated_at=now() where id=product;
  -- Keep old IDs for quotation/order history while removing omitted groups from sale.
  update catalog.product_variants set is_active=false where product_id=product;
  for item in select value from jsonb_array_elements(sheet.rows) loop
    net := (item->>'base_price')::numeric + (item->>'base_charge')::numeric
      + (item->>'profile')::numeric + (item->>'rolling')::numeric;
    for grp in select value from jsonb_array_elements(item->'size_groups') loop
      variant := (grp->>'id')::uuid;
      final_price := net + (grp->>'add_price')::numeric;
      if exists(select 1 from catalog.product_variants where id=variant and product_id<>product) then
        raise exception 'Size group belongs to another product' using errcode='22023';
      end if;
      insert into catalog.product_variants(id,product_id,sku,size_label,uom,min_order_qty,is_active)
        values(variant,product,'GL-' || variant::text,(item->>'grade') || ' / ' || (grp->>'label'),sheet.uom,sheet.min_order_qty,true)
      on conflict(id) do update set size_label=excluded.size_label,uom=excluded.uom,
        min_order_qty=excluded.min_order_qty,is_active=true;
      delete from catalog.variant_attributes where variant_id=variant;
      insert into catalog.variant_attributes(variant_id,attribute_key,value_json) values
        (variant,'grade',to_jsonb(item->>'grade')),
        (variant,'size_group',to_jsonb(grp->>'label')),
        (variant,'grade_list_base_price',to_jsonb(to_char((item->>'base_price')::numeric,'FM999999999999990.0000'))),
        (variant,'grade_list_price',to_jsonb(to_char(final_price,'FM999999999999990.0000'))),
        (variant,'grade_list_updated_at',to_jsonb(now()));
    end loop;
  end loop;
  update catalog.category_grade_sheets set product_id=product,published_revision=revision,updated_at=now() where category_id=p_category;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
    values(actor,'catalog.grade_sheet.publish','category',p_category,jsonb_build_object('revision',p_revision,'product_id',product));
  return public.fti_catalog_grade_sheet_get(p_category);
end $$;

revoke all on function public.fti_catalog_grade_sheet_get(uuid),
  public.fti_catalog_grade_sheet_save(uuid,integer,jsonb),
  public.fti_catalog_grade_sheet_publish(uuid,integer) from public, anon, authenticated;
grant execute on function public.fti_catalog_grade_sheet_get(uuid),
  public.fti_catalog_grade_sheet_save(uuid,integer,jsonb),
  public.fti_catalog_grade_sheet_publish(uuid,integer) to authenticated;

commit;
