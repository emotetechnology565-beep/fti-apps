-- Initialise Round Bright Bar from the published As Rolled Round Bar sheet.
-- Every size-group price is the corresponding round-bar price + INR 8,000/MT.
-- This is a one-time copy; subsequent changes use Category publishing.
begin;
do $$
declare
  source catalog.category_grade_sheets%rowtype;
  target uuid; product uuid; variant uuid;
  item jsonb; grp jsonb; groups jsonb; copied_rows jsonb := '[]';
  net numeric; bright_rolling numeric;
begin
  select s.* into source from catalog.category_grade_sheets s
    join catalog.categories c on c.id=s.category_id
    join catalog.products p on p.id=s.product_id and p.status='published'
    where c.slug='round-bar-as-rolled' and c.is_active for update of s;
  if not found then raise exception 'Publish the As Rolled Round Bar list first'; end if;
  if source.revision is distinct from source.published_revision then
    raise exception 'Round Bar has unpublished changes. Publish or resolve them before copying';
  end if;
  if source.uom <> 'MT' then raise exception 'Round Bar must use MT before adding INR 8000 per MT'; end if;
  perform internal.catalog_grade_rows(source.rows,source.rows,true);
  select id into target from catalog.categories where slug='round-bright-bar' and is_active for update;
  if target is null then raise exception 'Apply the shared steel categories migration first'; end if;
  if exists(select 1 from catalog.category_grade_sheets where category_id=target) then
    raise notice 'Round Bright Bar already has a sheet; leaving existing prices unchanged';
    return;
  end if;
  insert into catalog.products(category_id,slug,name,description,product_kind,purchase_mode,status)
    values(target,'round-bright-bar-grade-list','Round Bright Bar',
      'Same grades and sizes as As Rolled Round Bar, with INR 8,000 per MT added to net prices.',
      source.product_kind,'rfq','published') returning id into product;
  for item in select value from jsonb_array_elements(source.rows) loop
    -- Store the uplift in the private rolling component so later editor saves
    -- preserve exactly the same net-price calculation.
    bright_rolling := (item->>'rolling')::numeric + 8000;
    net := (item->>'base_price')::numeric + (item->>'base_charge')::numeric
      + (item->>'profile')::numeric + bright_rolling;
    groups := '[]';
    for grp in select value from jsonb_array_elements(item->'size_groups') loop
      variant := gen_random_uuid();
      insert into catalog.product_variants(id,product_id,sku,size_label,uom,min_order_qty,is_active)
        values(variant,product,'GL-' || variant::text,(item->>'grade') || ' / ' || (grp->>'label'),
          'MT',source.min_order_qty,true);
      insert into catalog.variant_attributes(variant_id,attribute_key,value_json) values
        (variant,'grade',to_jsonb(item->>'grade')),
        (variant,'size_group',to_jsonb(grp->>'label')),
        (variant,'grade_list_base_price',to_jsonb(to_char((item->>'base_price')::numeric,'FM999999999999990.0000'))),
        (variant,'grade_list_price',to_jsonb(to_char(net+(grp->>'add_price')::numeric,'FM999999999999990.0000'))),
        (variant,'grade_list_updated_at',to_jsonb(now()));
      -- Copy the published tax disclosure, if present; never invent one for
      -- legacy prices whose original sheet did not specify GST.
      insert into catalog.variant_attributes(variant_id,attribute_key,value_json)
        select variant,attribute_key,value_json from catalog.variant_attributes
        where variant_id=(grp->>'id')::uuid
          and attribute_key in ('grade_list_gst_included','grade_list_gst_rate');
      groups := groups || jsonb_build_array(grp || jsonb_build_object('id',variant));
    end loop;
    copied_rows := copied_rows || jsonb_build_array(item || jsonb_build_object(
      'rolling',bright_rolling::text,'size_groups',groups));
  end loop;
  insert into catalog.category_grade_sheets(category_id,product_id,product_kind,uom,min_order_qty,
    rows,gst_included,gst_rate,revision,published_revision)
    values(target,product,source.product_kind,'MT',source.min_order_qty,copied_rows,
      source.gst_included,source.gst_rate,1,1);
end $$;
notify pgrst,'reload schema';
commit;
