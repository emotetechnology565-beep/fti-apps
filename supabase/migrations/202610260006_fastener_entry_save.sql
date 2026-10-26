-- Fastener photo/subcategory entries do not require SKU variants.
-- Empty variant arrays leave existing variants untouched; all other kinds still require variants.
begin;
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
    raise exception 'Variants must be an array' using errcode='22023';
  end if;
  if (kind <> 'fastener' and jsonb_array_length(p_variants) < 1) or jsonb_array_length(p_variants) > 100 then
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

commit;
