-- Phase 3: empty, server-backed catalogue with MFA protected staff writes.
-- No sample categories, products, materials or rates are inserted here.
begin;

insert into identity.role_permissions(role_code, permission)
values ('super_admin', 'catalog.manage')
on conflict do nothing;

create or replace function public.fti_catalog_list(
  p_search text default '',
  p_category text default null,
  p_limit integer default 24,
  p_offset integer default 0,
  p_ids uuid[] default null
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with filtered as (
    select p.id, p.category_id, c.name as category, p.slug, p.name, p.description,
      p.product_kind, p.purchase_mode, p.status, p.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'sku', v.sku, 'size_label', v.size_label,
          'diameter_mm', v.diameter_mm, 'length_mm', v.length_mm,
          'uom', v.uom, 'min_order_qty', v.min_order_qty,
          'pack_qty', v.pack_qty, 'attributes', coalesce(attrs.value, '{}'::jsonb)
        ) order by v.sku)
        from catalog.product_variants v
        left join lateral (
          select jsonb_object_agg(a.attribute_key, a.value_json) as value
          from catalog.variant_attributes a where a.variant_id = v.id
        ) attrs on true
        where v.product_id = p.id and v.is_active
      ), '[]'::jsonb) as variants
    from catalog.products p
    join catalog.categories c on c.id = p.category_id and c.is_active
    where p.status = 'published'
      and exists (select 1 from catalog.product_variants v where v.product_id=p.id and v.is_active)
      and (p_category is null or c.slug = p_category)
      and (p_ids is null or p.id = any(p_ids))
      and (coalesce(trim(p_search),'') = '' or strpos(
        lower(concat_ws(' ', p.name, p.description, c.name, p.product_kind,
          (select string_agg(concat_ws(' ', v.sku, v.size_label,
            (select string_agg(a.value_json #>> '{}', ' ') from catalog.variant_attributes a where a.variant_id=v.id)
          ), ' ') from catalog.product_variants v where v.product_id=p.id and v.is_active)
        )), lower(trim(p_search))) > 0)
  ), page_rows as (
    select * from filtered order by name, id
    limit greatest(1, least(coalesce(p_limit,24),50))
    offset greatest(coalesce(p_offset,0),0)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name)
      order by c.sort_order,c.name) from catalog.categories c where c.is_active), '[]'::jsonb)
  );
$$;

create or replace function public.fti_catalog_admin_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform internal.identity_staff('catalog.manage');
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'parent_id',parent_id,'slug',slug,'name',name,'sort_order',sort_order,'is_active',is_active
    ) order by sort_order,name) from catalog.categories), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'category_id',p.category_id,'category',c.name,'slug',p.slug,'name',p.name,
      'description',p.description,'product_kind',p.product_kind,'purchase_mode',p.purchase_mode,'status',p.status,
      'variants', coalesce((select jsonb_agg(jsonb_build_object(
        'id',v.id,'sku',v.sku,'size_label',v.size_label,'diameter_mm',v.diameter_mm,
        'length_mm',v.length_mm,'uom',v.uom,'min_order_qty',v.min_order_qty,'pack_qty',v.pack_qty,
        'is_active',v.is_active,'attributes',coalesce(a.attrs,'{}'::jsonb)
      ) order by v.sku) from catalog.product_variants v left join lateral (
        select jsonb_object_agg(attribute_key,value_json) attrs from catalog.variant_attributes where variant_id=v.id
      ) a on true where v.product_id=p.id), '[]'::jsonb)
    ) order by p.updated_at desc) from catalog.products p join catalog.categories c on c.id=p.category_id), '[]'::jsonb)
  );
end $$;

create or replace function public.fti_catalog_product_get(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(p) || jsonb_build_object('category',c.name,'variants',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',v.id,'sku',v.sku,'size_label',v.size_label,'diameter_mm',v.diameter_mm,
      'length_mm',v.length_mm,'uom',v.uom,'min_order_qty',v.min_order_qty,
      'pack_qty',v.pack_qty,'attributes',coalesce(a.attrs,'{}'::jsonb)
    ) order by v.sku) from catalog.product_variants v left join lateral (
      select jsonb_object_agg(attribute_key,value_json) attrs from catalog.variant_attributes where variant_id=v.id
    ) a on true where v.product_id=p.id and v.is_active
  ),'[]'::jsonb))
  from catalog.products p join catalog.categories c on c.id=p.category_id and c.is_active
  where p.id=p_id and p.status='published'
    and exists(select 1 from catalog.product_variants v where v.product_id=p.id and v.is_active);
$$;

create or replace function public.fti_catalog_category_upsert(p_category jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('catalog.manage'); result_id uuid;
  category_name text := trim(coalesce(p_category->>'name',''));
  category_slug text := lower(trim(coalesce(p_category->>'slug','')));
  parent uuid := nullif(p_category->>'parent_id','')::uuid;
begin
  if length(category_name) not between 2 and 100 or category_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Category name or slug is invalid' using errcode='22023';
  end if;
  if parent is not null and parent = nullif(p_category->>'id','')::uuid then
    raise exception 'A category cannot be its own parent' using errcode='22023';
  end if;
  if nullif(p_category->>'id','') is null then
    insert into catalog.categories(parent_id,slug,name,sort_order,is_active)
    values(parent,category_slug,category_name,coalesce((p_category->>'sort_order')::int,0),coalesce((p_category->>'is_active')::boolean,true)) returning id into result_id;
  else
    result_id := (p_category->>'id')::uuid;
    update catalog.categories set parent_id=parent,slug=category_slug,name=category_name,
      sort_order=coalesce((p_category->>'sort_order')::int,0),is_active=coalesce((p_category->>'is_active')::boolean,true)
      where id=result_id;
    if not found then raise exception 'Category not found' using errcode='P0002'; end if;
  end if;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
  values(actor,'catalog.category.upsert','category',result_id,p_category);
  return result_id;
end $$;

create or replace function public.fti_catalog_product_upsert(p_product jsonb, p_variants jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('catalog.manage'); result_id uuid;
  product_name text := trim(coalesce(p_product->>'name',''));
  product_slug text := lower(trim(coalesce(p_product->>'slug','')));
  kind text := coalesce(p_product->>'product_kind','steel');
  mode text := coalesce(p_product->>'purchase_mode','rfq');
  category uuid := nullif(p_product->>'category_id','')::uuid;
  item jsonb; v_id uuid; unit text; attrs jsonb;
begin
  if length(product_name) not between 2 and 180 or product_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or kind not in ('steel','fastener','tractor_part','other') or mode not in ('rfq','direct','both') then
    raise exception 'Product or variant input is invalid' using errcode='22023';
  end if;
  if jsonb_typeof(p_variants) is distinct from 'array' then
    raise exception 'At least one variant is required' using errcode='22023';
  end if;
  if jsonb_array_length(p_variants) < 1 or jsonb_array_length(p_variants) > 100 then
    raise exception 'Variant count is outside the allowed range' using errcode='22023';
  end if;
  if not exists(select 1 from catalog.categories where id=category and is_active) then
    raise exception 'Choose an active category' using errcode='22023';
  end if;
  if nullif(p_product->>'id','') is null then
    insert into catalog.products(category_id,slug,name,description,product_kind,purchase_mode,status)
    values(category,product_slug,product_name,nullif(trim(p_product->>'description'),''),kind,mode,'draft') returning id into result_id;
  else
    result_id := (p_product->>'id')::uuid;
    update catalog.products set category_id=category,slug=product_slug,name=product_name,
      description=nullif(trim(p_product->>'description'),''),product_kind=kind,purchase_mode=mode,updated_at=now()
      where id=result_id;
    if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_variants) loop
    unit := coalesce(item->>'uom','');
    attrs := coalesce(item->'attributes','{}'::jsonb);
    if trim(coalesce(item->>'sku','')) = '' or unit not in ('kg','MT','piece','box','bundle')
      or coalesce((item->>'min_order_qty')::numeric,0) <= 0 or jsonb_typeof(attrs) <> 'object' then
      raise exception 'Variant input is invalid' using errcode='22023';
    end if;
    if nullif(item->>'id','') is null then
      insert into catalog.product_variants(product_id,sku,size_label,diameter_mm,length_mm,uom,min_order_qty,pack_qty,is_active)
      values(result_id,trim(item->>'sku'),nullif(trim(item->>'size_label'),''),nullif(item->>'diameter_mm','')::numeric,
        nullif(item->>'length_mm','')::numeric,unit,(item->>'min_order_qty')::numeric,
        nullif(item->>'pack_qty','')::numeric,coalesce((item->>'is_active')::boolean,true))
      returning id into v_id;
    else
      v_id := (item->>'id')::uuid;
      update catalog.product_variants set sku=trim(item->>'sku'),size_label=nullif(trim(item->>'size_label'),''),
        diameter_mm=nullif(item->>'diameter_mm','')::numeric,length_mm=nullif(item->>'length_mm','')::numeric,
        uom=unit,min_order_qty=(item->>'min_order_qty')::numeric,pack_qty=nullif(item->>'pack_qty','')::numeric,
        is_active=coalesce((item->>'is_active')::boolean,true)
        where id=v_id and product_id=result_id;
      if not found then raise exception 'Variant not found for product' using errcode='P0002'; end if;
    end if;
    delete from catalog.variant_attributes where catalog.variant_attributes.variant_id=v_id;
    insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
      select v_id,key,value from jsonb_each(attrs);
  end loop;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
  values(actor,'catalog.product.upsert','product',result_id,jsonb_build_object('product',p_product,'variants',p_variants));
  return result_id;
end $$;

create or replace function public.fti_catalog_product_status(p_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('catalog.manage');
begin
  if p_status not in ('draft','published','archived') then raise exception 'Invalid status' using errcode='22023'; end if;
  if p_status='published' and not exists(select 1 from catalog.products p join catalog.categories c on c.id=p.category_id
    where p.id=p_id and c.is_active and exists(select 1 from catalog.product_variants v where v.product_id=p.id and v.is_active)) then
    raise exception 'Publishing requires an active category and at least one active variant' using errcode='22023';
  end if;
  update catalog.products set status=p_status,updated_at=now() where id=p_id;
  if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
  values(actor,'catalog.product.status','product',p_id,jsonb_build_object('status',p_status));
end $$;

revoke all on function public.fti_catalog_list(text,text,integer,integer,uuid[]) from public, anon, authenticated;
revoke all on function public.fti_catalog_admin_list() from public, anon, authenticated;
revoke all on function public.fti_catalog_product_get(uuid) from public, anon, authenticated;
revoke all on function public.fti_catalog_category_upsert(jsonb) from public, anon, authenticated;
revoke all on function public.fti_catalog_product_upsert(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.fti_catalog_product_status(uuid,text) from public, anon, authenticated;
grant execute on function public.fti_catalog_list(text,text,integer,integer,uuid[]) to anon, authenticated;
grant execute on function public.fti_catalog_product_get(uuid) to anon, authenticated;
grant execute on function public.fti_catalog_admin_list(), public.fti_catalog_category_upsert(jsonb),
  public.fti_catalog_product_upsert(jsonb,jsonb), public.fti_catalog_product_status(uuid,text) to authenticated;

commit;
