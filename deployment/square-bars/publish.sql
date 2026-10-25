-- Run the complete file in Supabase SQL Editor as the database administrator.
-- Raw Materials > Square: 40 sizes, MS / Alloy. Blank source rates stay quote-only.
-- Re-runnable; existing priced variants and unrelated catalogue records are retained.
begin;

insert into catalog.categories(slug,name,sort_order,is_active)
values('square','Square',80,true)
on conflict(slug) do update set is_active=true;

do $$
declare
  category_uuid uuid; product_uuid uuid; variant_uuid uuid; r record;
begin
  select id into category_uuid from catalog.categories where slug='square' for update;
  if exists(select 1 from catalog.products where slug='square-bar' and category_id<>category_uuid) then
    raise exception 'Square Bar slug belongs to another category';
  end if;
  insert into catalog.products(category_id,slug,name,description,product_kind,purchase_mode,status)
  values(category_uuid,'square-bar','Square Bar',
    'Square bars in MS and Alloy. Approximate weights are in kg per metre. Request a quote for rates and confirm grade, tolerances and availability.',
    'steel','rfq','published')
  on conflict(slug) do update set name=excluded.name,description=excluded.description,
    product_kind='steel',purchase_mode='rfq',status='published',updated_at=now()
  returning id into product_uuid;

  for r in
    select * from (values
      (10, 100, 0.785),
      (12, 144, 1.13),
      (14, 196, 1.538),
      (15, 225, 1.766),
      (16, 256, 2.01),
      (18, 324, 2.543),
      (20, 400, 3.14),
      (22, 484, 3.799),
      (25, 625, 4.906),
      (28, 784, 6.154),
      (30, 900, 7.065),
      (32, 1024, 8.038),
      (35, 1225, 9.616),
      (36, 1296, 10.173),
      (38, 1444, 11.336),
      (40, 1600, 12.56),
      (42, 1764, 13.847),
      (45, 2025, 15.896),
      (48, 2304, 18.096),
      (50, 2500, 19.625),
      (55, 3025, 23.746),
      (60, 3600, 28.26),
      (65, 4225, 33.166),
      (70, 4900, 38.465),
      (75, 5625, 44.156),
      (80, 6400, 50.24),
      (85, 7225, 56.716),
      (90, 8100, 63.585),
      (95, 9025, 70.846),
      (100, 10000, 78.5),
      (105, 11025, 86.546),
      (110, 12100, 94.985),
      (115, 13225, 103.816),
      (120, 14400, 113.04),
      (125, 15625, 122.656),
      (130, 16900, 132.665),
      (135, 18225, 143.066),
      (140, 19600, 153.86),
      (145, 21025, 165.046),
      (150, 22500, 176.625)
    ) as sizes(side_mm,area_mm2,weight_kg_per_m)
    cross join (values('MS'),('ALLOY')) as materials(grade)
  loop
    insert into catalog.product_variants(product_id,sku,size_label,uom,min_order_qty,is_active)
    values(product_uuid,'FTI-SQUARE-'||r.grade||'-'||r.side_mm||'MM',
      r.side_mm||' x '||r.side_mm||'MM','MT',1,true)
    on conflict(sku) do update set size_label=excluded.size_label,is_active=true
    where catalog.product_variants.product_id=excluded.product_id
    returning id into variant_uuid;
    if variant_uuid is null then raise exception 'Square Bar SKU belongs to another product'; end if;

    insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
    select variant_uuid,key,value from jsonb_each(jsonb_build_object(
      'grade',r.grade,'size_group',r.side_mm||'MM',
      'dimensions',jsonb_build_object('side_mm',r.side_mm),
      'available_sizes',jsonb_build_array(r.side_mm),
      'cross_section_area_mm2',r.area_mm2,'weight_kg_per_m',r.weight_kg_per_m
    )) on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;
    -- Never turn a subsequently priced variant back into a quote-only item.
    if not exists(select 1 from catalog.variant_attributes where variant_id=variant_uuid
      and attribute_key in ('grade_list_price','sheet_flat_net_prate')) then
      insert into catalog.variant_attributes values(variant_uuid,'quote_only','true'::jsonb)
      on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;
    end if;
  end loop;

  insert into catalog.category_specs(category_id,dimension_label,dimension_keys,enabled)
  values(category_uuid,'Square side (mm)',array['side_mm'],true)
  on conflict(category_id) do nothing;
  if not exists(select 1 from catalog.category_specs where category_id=category_uuid
    and dimension_keys=array['side_mm'] and enabled) then
    raise exception 'Square category dimensions are disabled or incompatible; review before importing';
  end if;
  perform internal.sync_material_selection(product_uuid);
  insert into platform.audit_logs(action,resource_type,resource_id,after_data)
  values('catalog.square_bar.import','product',product_uuid,
    jsonb_build_object('sizes',40,'material_options',array['MS','ALLOY'],'variants',80,'pricing','request_quote'));
end $$;

select p.name,p.status,count(*) as active_variants
from catalog.products p join catalog.product_variants v on v.product_id=p.id
where p.slug='square-bar' and v.is_active group by p.id;
commit;
