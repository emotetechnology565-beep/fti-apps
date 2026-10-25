-- Supabase SQL Editor: run the complete file as the database administrator.
-- 10 brands, 7 sizes each. No freight or GST is added to published rates.
-- Re-runnable: preserves variant IDs, order history and unrelated products.
-- Existing admin fields are unchanged; no schema or admin columns are added.
begin;

insert into catalog.categories(slug,name,sort_order,is_active)
values('tmt','TMT Bar',50,true)
on conflict(slug) do update set is_active=true;

do $$
declare
  r record; category_uuid uuid; product_uuid uuid; variant_uuid uuid;
begin
  select id into category_uuid from catalog.categories where slug='tmt' for update;
  for r in
    select * from (values
      ('ZARA TMT', 'zara-tmt', 8, 41500, 8000, 2000, 475),
      ('ZARA TMT', 'zara-tmt', 10, 41500, 6000, 2000, 475),
      ('ZARA TMT', 'zara-tmt', 12, 41400, 6000, 2000, 475),
      ('ZARA TMT', 'zara-tmt', 16, 41400, 6000, 2000, 475),
      ('ZARA TMT', 'zara-tmt', 20, 41400, 6000, 2000, 475),
      ('ZARA TMT', 'zara-tmt', 25, 41400, 6000, 2000, 475),
      ('ZARA TMT', 'zara-tmt', 32, 41400, 8000, 2000, 475),
      ('STAR TMT', 'star-tmt', 8, 41400, 8000, 2000, 475),
      ('STAR TMT', 'star-tmt', 10, 41400, 6000, 2000, 475),
      ('STAR TMT', 'star-tmt', 12, 41400, 6000, 2000, 475),
      ('STAR TMT', 'star-tmt', 16, 41400, 6000, 2000, 475),
      ('STAR TMT', 'star-tmt', 20, 41400, 6000, 2000, 475),
      ('STAR TMT', 'star-tmt', 25, 41400, 6000, 2000, 475),
      ('STAR TMT', 'star-tmt', 32, 41400, 8000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 8, 41400, 8000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 10, 41400, 6000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 12, 41400, 6000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 16, 41400, 6000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 20, 41400, 6000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 25, 41400, 6000, 2000, 475),
      ('ZEE CON TMT', 'zee-con-tmt', 32, 41400, 8000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 8, 41400, 8000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 10, 41400, 6000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 12, 41400, 6000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 16, 41400, 6000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 20, 41400, 6000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 25, 41400, 6000, 2000, 475),
      ('AWADH TMT', 'awadh-tmt', 32, 41400, 8000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 8, 41300, 8000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 10, 41300, 6000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 12, 41300, 6000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 16, 41300, 6000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 20, 41300, 6000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 25, 41300, 6000, 2000, 475),
      ('MAJHI TMT', 'majhi-tmt', 32, 41300, 8000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 8, 41300, 8000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 10, 41300, 6000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 12, 41300, 6000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 16, 41300, 6000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 20, 41300, 6000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 25, 41300, 6000, 2000, 475),
      ('SUPERX TMT', 'superx-tmt', 32, 41300, 8000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 8, 41300, 8000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 10, 41300, 6000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 12, 41300, 6000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 16, 41300, 6000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 20, 41300, 6000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 25, 41300, 6000, 2000, 475),
      ('HR PLATINUM', 'hr-platinum', 32, 41300, 8000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 8, 41200, 8000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 10, 41200, 6000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 12, 41200, 6000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 16, 41200, 6000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 20, 41200, 6000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 25, 41200, 6000, 2000, 475),
      ('SMS TMT', 'sms-tmt', 32, 41200, 8000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 8, 41800, 8000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 10, 41800, 6000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 12, 41800, 6000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 16, 41800, 6000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 20, 41800, 6000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 25, 41800, 6000, 2000, 475),
      ('BALSHALI 550D', 'balshali-550d', 32, 41800, 8000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 8, 42800, 8000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 10, 42800, 6000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 12, 42800, 6000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 16, 42800, 6000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 20, 42800, 6000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 25, 42800, 6000, 2000, 475),
      ('RATHI TMT', 'rathi-tmt', 32, 42800, 8000, 2000, 475)
    ) as rates(brand,slug,size_mm,base_price,rolling,profile,loading)
  loop
    if exists(select 1 from catalog.products where slug='tmt-'||r.slug and category_id<>category_uuid) then
      raise exception 'TMT slug belongs to another category: %',r.slug;
    end if;
    insert into catalog.products(category_id,slug,name,description,product_kind,purchase_mode,status)
    values(category_uuid,'tmt-'||r.slug,r.brand,
      'TMT bar. GST and freight are excluded. Both will be added during order confirmation.',
      'steel','rfq','published')
    on conflict(slug) do update set name=excluded.name,description=excluded.description,
      product_kind='steel',purchase_mode='rfq',status='published',updated_at=now()
    returning id into product_uuid;

    insert into catalog.product_variants(product_id,sku,size_label,diameter_mm,uom,min_order_qty,is_active)
    values(product_uuid,'FTI-TMT-'||upper(r.slug)||'-'||r.size_mm||'MM',r.size_mm||'MM',r.size_mm,'MT',1,true)
    on conflict(sku) do update set size_label=excluded.size_label,diameter_mm=excluded.diameter_mm,
      uom='MT',is_active=true
    where catalog.product_variants.product_id=excluded.product_id
    returning id into variant_uuid;
    if variant_uuid is null then
      raise exception 'TMT SKU belongs to another product: % %MM',r.brand,r.size_mm;
    end if;
    insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
    select variant_uuid,key,value from jsonb_each(jsonb_build_object(
      'grade',r.brand,'brand',r.brand,'size_group',r.size_mm||'MM',
      'grade_list_base_price',r.base_price::text,
      'grade_list_price',(r.base_price+r.rolling+r.profile+r.loading)::text,
      'grade_list_gst_included',false,'grade_list_freight_excluded',true,
      'grade_list_updated_at',now()
    )) on conflict(variant_id,attribute_key) do update set value_json=excluded.value_json;
    -- These SKUs have a confirmed net price and do not include any tax.
    delete from catalog.variant_attributes where variant_id=variant_uuid
      and attribute_key in ('quote_only','grade_list_gst_rate');
  end loop;

  -- Populate the existing category / size / grade selection flow, if installed.
  if to_regprocedure('internal.sync_material_selection(uuid)') is not null then
    insert into catalog.category_specs(category_id,dimension_label,dimension_keys,enabled)
    values(category_uuid,'Diameter (mm)',array['diameter_mm'],true)
    on conflict(category_id) do nothing;
    if not exists(select 1 from catalog.category_specs where category_id=category_uuid
      and dimension_keys=array['diameter_mm'] and enabled) then
      raise exception 'TMT category dimensions are disabled or incompatible; review before importing';
    end if;
    for product_uuid in select id from catalog.products
      where category_id=category_uuid and slug in (
        'tmt-zara-tmt',
        'tmt-star-tmt',
        'tmt-zee-con-tmt',
        'tmt-awadh-tmt',
        'tmt-majhi-tmt',
        'tmt-superx-tmt',
        'tmt-hr-platinum',
        'tmt-sms-tmt',
        'tmt-balshali-550d',
        'tmt-rathi-tmt'
      )
    loop
      perform internal.sync_material_selection(product_uuid);
    end loop;
  end if;
  insert into platform.audit_logs(action,resource_type,resource_id,after_data)
  values('catalog.tmt_rates.import','category',category_uuid,
    jsonb_build_object('brands',10,'variants',70,'gst_included',false,'freight_included',false));
end $$;

-- Verify all 70 rows and their published rates before the transaction commits.
select p.name,v.size_label,a.value_json #>> '{}' as net_price_pmt,v.uom,p.status
from catalog.products p join catalog.product_variants v on v.product_id=p.id
join catalog.variant_attributes a on a.variant_id=v.id and a.attribute_key='grade_list_price'
where p.slug in (
        'tmt-zara-tmt',
        'tmt-star-tmt',
        'tmt-zee-con-tmt',
        'tmt-awadh-tmt',
        'tmt-majhi-tmt',
        'tmt-superx-tmt',
        'tmt-hr-platinum',
        'tmt-sms-tmt',
        'tmt-balshali-550d',
        'tmt-rathi-tmt'
) and v.is_active order by p.name,v.diameter_mm;

commit;
