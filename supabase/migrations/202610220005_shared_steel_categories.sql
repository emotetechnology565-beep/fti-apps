-- Make the six steel categories use the same public size and grade filters.
-- Prices remain category-specific; PMT is displayed while the stored UOM remains MT.
begin;

update catalog.categories
set slug='round-bright-bar',name='Round Bright Bar',sort_order=40,is_active=true
where slug='bright-bar' and not exists (
  select 1 from catalog.categories existing where existing.slug='round-bright-bar'
);

insert into catalog.categories(slug,name,sort_order,is_active)
values
  ('round-bar-as-rolled','As Rolled Round Bar',30,true),
  ('round-bright-bar','Round Bright Bar',40,true),
  ('tmt','TMT Bar',50,true),
  ('flat','Flat',60,true),
  ('sheet','Sheet',70,true),
  ('square','Square',80,true)
on conflict(slug) do update set name=excluded.name,sort_order=excluded.sort_order,is_active=true;

create or replace function public.fti_catalog_filtered_list(
  p_search text default '',p_category text default null,p_limit integer default 24,
  p_offset integer default 0,p_ids uuid[] default null,p_size integer default null,p_grade text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_size is not null and p_size <> all(array[
    8,10,12,16,17,18,19,20,21,22,23,24,25,26,27,28,30,32,34,36,38,40,42,
    45,48,50,51,53,56,60,63,65,68,70,72,75,80
  ]::integer[]) then
    raise exception 'Choose a size from the shared steel size list' using errcode='22023';
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
      'grades',to_jsonb(array[
        'MS','LC','FE-500','FE-550','FE-600','FE-600S','FE-550D','FE-650','FE-700',
        '16MNCR5','20MNCR5','30MNB5','30MNCR4','41CR4','42CRMO4','A-105','BORON','C-55','CK-45',
        'EN-15','EN-18','EN-18D','EN-19','EN-24','EN-353','EN-36A','EN-45','EN-45A','EN-8D',
        'EN-8DCR','EN-8DLHT','EN-9','S-45C','S-48C','SAE-1018','SAE-1541','SAE-4130','SAE-4140',
        'SAE-8620','SCM-420','SCM-435','ST-52.3'
      ]::text[])
    )
  );
end $$;
revoke all on function public.fti_catalog_filtered_list(text,text,integer,integer,uuid[],integer,text) from public,anon,authenticated;
grant execute on function public.fti_catalog_filtered_list(text,text,integer,integer,uuid[],integer,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
