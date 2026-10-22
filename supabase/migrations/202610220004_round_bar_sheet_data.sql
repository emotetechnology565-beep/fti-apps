-- Import the supplied Round Bar — As Rolled grade sheet as one published
-- quotation catalogue. Blank source cells contribute zero to the workbook's
-- SUM formulas; a zero base is shown as "Not specified in sheet" to customers.
begin;

-- The source workbook leaves Base Price blank and omits rolling on two grades.
-- Permit zero components when the resulting grade net is still positive.
create or replace function internal.catalog_grade_rows(p_rows jsonb, p_previous jsonb, p_publish boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  item jsonb; grp jsonb; cleaned jsonb; groups jsonb; result jsonb := '[]';
  grades text[] := '{}'; labels text[]; ids uuid[] := '{}'; group_id uuid;
  grade text; label text; field text; amount text; grade_net numeric;
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
    grade_net := 0;
    foreach field in array array['base_price','base_charge','profile','rolling'] loop
      amount := trim(coalesce(item->>field,''));
      if (amount <> '' or p_publish) and amount !~ '^\d{1,12}(\.\d{1,4})?$' then
        raise exception 'Enter valid non-negative prices (up to 12 digits and 4 decimals)' using errcode='22023';
      end if;
      if amount <> '' then grade_net := grade_net + amount::numeric; end if;
      cleaned := cleaned || jsonb_build_object(field,amount);
    end loop;
    if p_publish and grade_net <= 0 then
      raise exception 'Each brand or grade must have a positive net price' using errcode='22023';
    end if;
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

do $$
declare
  category uuid;
  product uuid;
  item record;
  size_row record;
  variant_sku text;
  size_code text;
  variant uuid;
  final_price numeric;
  groups jsonb;
  grade_rows jsonb := '[]';
  row_json jsonb;
  publish_time timestamptz := now();
begin
  select id into category from catalog.categories where slug='round-bar-as-rolled' and is_active;
  if category is null then
    raise exception 'Apply the material categories migration first';
  end if;

  -- Never overwrite a list a staff member has already started or published.
  if exists(select 1 from catalog.category_grade_sheets where category_id=category) then
    raise notice 'Round Bar grade sheet already exists; leaving it unchanged';
    return;
  end if;

  insert into catalog.products(category_id,slug,name,description,product_kind,purchase_mode,status)
  values(category,'round-bar-as-rolled-grade-list','Round Bar — As Rolled',
    'Round bar grades and size groups. Prices are INR per metric tonne.',
    'steel','rfq','published')
  on conflict(slug) do update set category_id=excluded.category_id,name=excluded.name,
    description=excluded.description,product_kind='steel',purchase_mode='rfq',status='published',updated_at=now()
  returning id into product;

  for item in select * from (values
    ('16MNCR5',14000::numeric), ('20MNCR5',14000), ('30MNB5',NULL::numeric),
    ('30MNCR4',15000), ('41CR4',11000), ('42CRMO4',20000), ('A-105',10500),
    ('BORON',11500), ('C-55',9000), ('CK-45',8500), ('EN-15',11500),
    ('EN-18',11000), ('EN-18D',12000), ('EN-19',23000), ('EN-24',36000),
    ('EN-353',30000), ('EN-36A',NULL::numeric), ('EN-45',14000), ('EN-45A',15000),
    ('EN-8D',8500), ('EN-8DCR',10000), ('EN-8DLHT',9000), ('EN-9',9000),
    ('LC',10000), ('S-45C',8500), ('S-48C',8500), ('SAE-1018',8000),
    ('SAE-1541',11500), ('SAE-4130',20000), ('SAE-4140',20000),
    ('SAE-8620',23000), ('SCM-420',21000), ('SCM-435',20000), ('ST-52.3',10500)
  ) as g(grade,rolling) order by g.grade loop
    groups := '[]';
    for size_row in select * from (values
      ('16MM TO 50MM',0::numeric,'16-50'),
      ('53MM TO 80MM',1000::numeric,'53-80')
    ) as s(size_group,addition,size_code) loop
      size_code := size_row.size_code;
      variant_sku := 'RBA-' || regexp_replace(item.grade,'[^A-Z0-9]+','-','g') || '-' || size_code;
      final_price := 4000 + 1000 + coalesce(item.rolling,0) + size_row.addition;
      insert into catalog.product_variants(product_id,sku,size_label,uom,min_order_qty,is_active)
      values(product,variant_sku,item.grade || ' / ' || size_row.size_group,'MT',1,true)
      on conflict on constraint product_variants_sku_key
      do update set product_id=excluded.product_id,size_label=excluded.size_label,
        uom='MT',min_order_qty=1,is_active=true
      returning id into variant;
      delete from catalog.variant_attributes where variant_id=variant;
      insert into catalog.variant_attributes(variant_id,attribute_key,value_json) values
        (variant,'grade',to_jsonb(item.grade)),
        (variant,'size_group',to_jsonb(size_row.size_group)),
        (variant,'grade_list_price',to_jsonb(to_char(final_price,'FM999999999999990.0000'))),
        (variant,'grade_list_updated_at',to_jsonb(publish_time));
      groups := groups || jsonb_build_array(jsonb_build_object(
        'id',variant,'label',size_row.size_group,'add_price',size_row.addition::text));
    end loop;
    row_json := jsonb_build_object(
      'grade',item.grade,'base_price','0','base_charge','4000','profile','1000',
      'rolling',coalesce(item.rolling,0)::text,'size_groups',groups);
    grade_rows := grade_rows || jsonb_build_array(row_json);
  end loop;

  insert into catalog.category_grade_sheets(category_id,product_id,product_kind,uom,min_order_qty,
    rows,revision,published_revision,updated_at)
  values(category,product,'steel','MT',1,grade_rows,1,1,publish_time);
end $$;

notify pgrst,'reload schema';
commit;
