"""Prepare the supplied TMT rates for Supabase SQL Editor; no remote writes.

Only complete brands from the supplied sheet are included. Prices are INR/MT.
Freight and GST are excluded from every imported price.
"""
import csv
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'deployment' / 'tmt-rates'
SIZES = (8, 10, 12, 16, 20, 25, 32)
BRANDS = (
    ('ZARA TMT', 'zara-tmt', 41400),
    ('STAR TMT', 'star-tmt', 41400),
    ('ZEE CON TMT', 'zee-con-tmt', 41400),
    ('AWADH TMT', 'awadh-tmt', 41400),
    ('MAJHI TMT', 'majhi-tmt', 41300),
    ('SUPERX TMT', 'superx-tmt', 41300),
    ('HR PLATINUM', 'hr-platinum', 41300),
    ('SMS TMT', 'sms-tmt', 41200),
    ('BALSHALI 550D', 'balshali-550d', 41800),
    ('RATHI TMT', 'rathi-tmt', 42800),
)


def build_rates():
    return [
        {
            'brand': brand,
            'slug': slug,
            'size_mm': size,
            'base_price': 41500 if slug == 'zara-tmt' and size in (8, 10) else base,
            'rolling': 8000 if size in (8, 32) else 6000,
            'profile': 2000,
            'loading': 475,
        }
        for brand, slug, base in BRANDS for size in SIZES
    ]


def main():
    rates = build_rates()
    for row in rates:
        row['net_price'] = sum(row[key] for key in ('base_price', 'rolling', 'profile', 'loading'))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'rates.json').write_text(json.dumps(rates, indent=2) + '\n', encoding='utf-8')
    with (OUT / 'rates.csv').open('w', newline='', encoding='utf-8') as output:
        writer = csv.DictWriter(output, fieldnames=list(rates[0]))
        writer.writeheader()
        writer.writerows(rates)
    values = ',\n'.join(
        "      ('{brand}', '{slug}', {size_mm}, {base_price}, {rolling}, {profile}, {loading})".format(**row)
        for row in rates
    )
    sql = """-- Supabase SQL Editor: run the complete file as the database administrator.
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
__VALUES__
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
__SLUGS__
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
__SLUGS__
) and v.is_active order by p.name,v.diameter_mm;

commit;
"""
    slugs = ',\n'.join("        'tmt-" + slug + "'" for _, slug, _ in BRANDS)
    (OUT / 'publish.sql').write_text(sql.replace('__VALUES__', values).replace('__SLUGS__', slugs), encoding='utf-8')
    print(f'Prepared {len(BRANDS)} brands and {len(rates)} rates in {OUT.relative_to(OUT.parents[1])}. No remote records changed.')


if __name__ == '__main__':
    main()
