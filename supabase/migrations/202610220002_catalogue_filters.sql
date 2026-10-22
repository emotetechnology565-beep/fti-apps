begin;

create or replace function internal.catalog_size_matches(p_diameter numeric,p_label text,p_size integer)
returns boolean language plpgsql immutable set search_path='' as $$
declare label text := upper(trim(coalesce(p_label,''))); parts text[];
begin
  if p_size is null then return true; end if;
  if p_diameter is not null then return p_diameter=p_size; end if;
  if label='ALL SIZES' then return true; end if;
  parts := regexp_match(label,'^([0-9]+(?:\.[0-9]+)?)\s*(?:MM)?\s*(?:TO|[-–])\s*([0-9]+(?:\.[0-9]+)?)\s*(?:MM)?$');
  if parts is not null then return p_size between parts[1]::numeric and parts[2]::numeric; end if;
  parts := regexp_match(label,'^([0-9]+(?:\.[0-9]+)?)\s*MM$');
  return coalesce(p_size=parts[1]::numeric,false);
end $$;
revoke all on function internal.catalog_size_matches(numeric,text,integer) from public,anon,authenticated;

create or replace function public.fti_catalog_filtered_list(
  p_search text default '',p_category text default null,p_limit integer default 24,
  p_offset integer default 0,p_ids uuid[] default null,p_size integer default null,p_grade text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_size is not null and p_size not between 16 and 80 then
    raise exception 'Choose a size between 16 and 80 mm' using errcode='22023';
  end if;
  return (
    with available as (
      select v.*,p.name as product_name,p.description,p.category_id,p.slug,p.product_kind,p.purchase_mode,p.status,
        c.name as category,coalesce(a.attrs,'{}'::jsonb) as attributes,
        upper(trim(coalesce(a.attrs->>'grade',''))) as grade
      from catalog.product_variants v
      join catalog.products p on p.id=v.product_id and p.status='published'
      join catalog.categories c on c.id=p.category_id and c.is_active
      left join lateral (
        select jsonb_object_agg(attribute_key,value_json) attrs from catalog.variant_attributes where variant_id=v.id
      ) a on true
      where v.is_active and (p_category is null or c.slug=p_category)
        and internal.catalog_size_matches(v.diameter_mm,coalesce(a.attrs->>'size_group',v.size_label),p_size)
    ), selected as (
      select * from available where nullif(trim(p_grade),'') is null or grade=upper(trim(p_grade))
    ), grouped as (
      select product_id as id,category_id,category,slug,product_name as name,description,product_kind,purchase_mode,status,
        jsonb_agg(jsonb_build_object('id',id,'sku',sku,'size_label',size_label,
          'diameter_mm',diameter_mm,'length_mm',length_mm,'uom',uom,'min_order_qty',min_order_qty,
          'pack_qty',pack_qty,'attributes',attributes) order by sku) as variants,
        lower(concat_ws(' ',product_name,description,category,product_kind,
          string_agg(concat_ws(' ',sku,size_label,attributes::text),' '))) as search_text
      from selected
      group by product_id,category_id,category,slug,product_name,description,product_kind,purchase_mode,status
    ), filtered as (
      select * from grouped where (p_ids is null or id=any(p_ids))
        and (coalesce(trim(p_search),'')='' or strpos(search_text,lower(trim(p_search)))>0)
    ), page_rows as (
      select * from filtered order by name,id
      limit greatest(1,least(coalesce(p_limit,24),50)) offset greatest(coalesce(p_offset,0),0)
    ) select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(page_rows)-'search_text') from page_rows),'[]'::jsonb),
      'total',(select count(*) from filtered),
      'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name',name) order by sort_order,name)
        from catalog.categories where is_active),'[]'::jsonb),
      'grades',coalesce((select jsonb_agg(grade order by grade) from (select distinct grade from available where grade<>'') g),'[]'::jsonb)
    )
  );
end $$;
revoke all on function public.fti_catalog_filtered_list(text,text,integer,integer,uuid[],integer,text) from public,anon,authenticated;
grant execute on function public.fti_catalog_filtered_list(text,text,integer,integer,uuid[],integer,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
