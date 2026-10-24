-- Run in the Supabase SQL Editor as the database administrator.
-- Imports the 25 supplied rates, using a minimum order of 1 MT.
-- Re-running updates these SKUs; other products/variants are retained.
begin;

insert into catalog.categories (slug, name, sort_order, is_active)
values ('sheet', 'Sheet', 70, true), ('flat', 'Flat', 60, true)
on conflict (slug) do update set is_active = true;

do $$
declare
  r record;
  product_uuid uuid;
  variant_uuid uuid;
  total_rate numeric;
  gst_amount numeric;
begin
  for r in
    select * from (values
      ('sheet',  2, 52900, 3300),
      ('sheet',  3, 52900, 3300),
      ('sheet',  4, 53000, 3300),
      ('sheet',  5, 53000, 3300),
      ('sheet',  6, 53200, 2300),
      ('sheet',  8, 53500, 2300),
      ('sheet', 10, 53500, 2300),
      ('sheet', 12, 53500, 2300),
      ('flat',   5, 53000, 6000),
      ('flat',   6, 53000, 6000),
      ('flat',   8, 53500, 6000),
      ('flat',  10, 53500, 6000),
      ('flat',  12, 54000, 6000),
      ('flat',  15, 54000, 6000),
      ('flat',  16, 54200, 6000),
      ('flat',  18, 54200, 6000),
      ('flat',  20, 55000, 6000),
      ('flat',  22, 55000, 6000),
      ('flat',  25, 55000, 6000),
      ('flat',  30, 55000, 6000),
      ('flat',  35, 55000, 6000),
      ('flat',  38, 55000, 6000),
      ('flat',  40, 55000, 6000),
      ('flat',  45, 55000, 6000),
      ('flat',  50, 55000, 6000)
    ) as rates(category_slug, thickness, base_rate, vadha)
  loop
    insert into catalog.products
      (category_id, slug, name, product_kind, purchase_mode, status)
    select id, r.category_slug || '-ms', upper(r.category_slug) || ' MS',
      'steel', 'rfq', 'published'
    from catalog.categories where slug = r.category_slug
    on conflict (slug) do update set
      category_id = excluded.category_id,
      product_kind = 'steel', purchase_mode = 'rfq',
      status = 'published', updated_at = now()
    returning id into product_uuid;

    insert into catalog.product_variants
      (product_id, sku, size_label, uom, min_order_qty, is_active)
    values (
      product_uuid,
      'FTI-' || upper(r.category_slug) || '-MS-' || lpad(r.thickness::text, 2, '0') || 'MM',
      r.thickness::text || 'MM', 'MT', 1, true
    )
    on conflict (sku) do update set
      size_label = excluded.size_label, uom = 'MT', is_active = true
    where catalog.product_variants.product_id = excluded.product_id
    returning id into variant_uuid;

    if variant_uuid is null then
      raise exception 'SKU belongs to another product: % MS %MM', r.category_slug, r.thickness;
    end if;

    total_rate := r.base_rate + r.vadha;
    gst_amount := round(total_rate * 0.18, 2);

    insert into catalog.variant_attributes (variant_id, attribute_key, value_json)
    select variant_uuid, key, value
    from jsonb_each(jsonb_build_object(
      'grade', 'MS',
      'size_group', r.thickness::text || 'MM',
      'sheet_flat_base_rate_pmt', r.base_rate::text,
      'sheet_flat_vadha', r.vadha::text,
      'sheet_flat_total', total_rate::text,
      'sheet_flat_gst', gst_amount::text,
      'sheet_flat_net_prate', (total_rate + gst_amount)::text
    ))
    on conflict (variant_id, attribute_key)
    do update set value_json = excluded.value_json;
  end loop;
end $$;

-- Confirm the published rows and prices before committing.
select p.name as category, v.size_label as size_thickness,
  a.value_json #>> '{}' as net_prate, v.uom, p.status
from catalog.products p
join catalog.product_variants v on v.product_id = p.id
join catalog.variant_attributes a on a.variant_id = v.id
  and a.attribute_key = 'sheet_flat_net_prate'
where p.slug in ('sheet-ms', 'flat-ms') and v.is_active
order by case p.slug when 'sheet-ms' then 0 else 1 end,
  replace(v.size_label, 'MM', '')::numeric;

commit;
