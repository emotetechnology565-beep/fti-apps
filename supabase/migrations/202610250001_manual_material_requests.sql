-- Manual enquiries preserve buyer intent and use the existing notification jobs.
begin;
alter table sales.raw_material_requests add column if not exists manual_entry boolean not null default false;
alter table sales.raw_material_requests drop constraint if exists raw_material_selection_required;
alter table sales.raw_material_requests add constraint raw_material_selection_required
  check(manual_entry or option_id is not null or (variant_id is not null and size_mm is not null));

create or replace function internal.manual_material_key(p_value text) returns text
language sql immutable set search_path='' as $$
  select regexp_replace(lower(trim(coalesce(p_value,''))),'[^a-z0-9]','','g')
$$;

create or replace function public.fti_catalog_manual_preview(p_material text,p_size text,p_grade text,p_product uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cat record; candidate record; opt record; amounts numeric[]; pieces text[]; part text;
  material_key text:=internal.manual_material_key(p_material); distance numeric; count_options integer;
  result jsonb:=jsonb_build_object('status','unlisted_material','size_status','unlisted_material','category',null,'matched_size',null,'option',null,'grades','[]'::jsonb);
begin
  if length(trim(coalesce(p_material,''))) not between 1 and 80 or length(trim(coalesce(p_grade,'')))>80
    or length(trim(coalesce(p_size,''))) not between 1 and 80 or material_key='' then
    raise exception 'Enter material, grade and size (up to 80 characters each)' using errcode='22023';
  end if;
  if p_material ~ '[[:cntrl:]]' or p_grade ~ '[[:cntrl:]]' or p_size ~ '[[:cntrl:]]' then
    raise exception 'Use single-line material, grade and size entries' using errcode='22023';
  end if;
  pieces:=regexp_split_to_array(regexp_replace(lower(trim(p_size)),'\s*mm\s*','','g'),'\s*[x×*]\s*');
  if cardinality(pieces) not between 1 and 4 then raise exception 'Enter one to four dimensions in mm, for example 15 or 10 x 50' using errcode='22023'; end if;
  foreach part in array pieces loop
    if trim(part) !~ '^\d{1,9}(\.\d{1,3})?$' then raise exception 'Enter positive dimensions in mm, with up to 3 decimal places' using errcode='22023'; end if;
    if part::numeric<=0 then raise exception 'Size must be greater than zero' using errcode='22023'; end if;
    amounts:=array_append(amounts,part::numeric);
  end loop;
  -- Unknown materials can still request a quote using one of FTI's available grades.
  result:=result||jsonb_build_object('grades',coalesce((select jsonb_agg(grade order by grade) from
    (select distinct grade from internal.material_selection_available where p_product is null or product_id=p_product) g),'[]'::jsonb));
  -- A material name must match a public category or product; unknown names remain enquiries.
  if (select count(*) from catalog.categories c join catalog.category_specs s on s.category_id=c.id and s.enabled
    where c.is_active and (material_key=internal.manual_material_key(c.name) or material_key=internal.manual_material_key(c.slug)
      or exists(select 1 from catalog.products p where p.category_id=c.id and p.status='published' and p.product_kind='steel'
        and material_key=internal.manual_material_key(p.name)))
      and (p_product is null or exists(select 1 from catalog.products p where p.id=p_product and p.category_id=c.id and p.status='published' and p.product_kind='steel')))<>1 then return result; end if;
  select c.id,c.name,c.slug,s.dimension_label,s.dimension_keys into cat from catalog.categories c
    join catalog.category_specs s on s.category_id=c.id and s.enabled where c.is_active
    and (material_key=internal.manual_material_key(c.name) or material_key=internal.manual_material_key(c.slug)
      or exists(select 1 from catalog.products p where p.category_id=c.id and p.status='published' and p.product_kind='steel'
        and material_key=internal.manual_material_key(p.name)))
    and (p_product is null or exists(select 1 from catalog.products p where p.id=p_product and p.category_id=c.id and p.status='published' and p.product_kind='steel'));
  result:=result||jsonb_build_object('category',to_jsonb(cat),'status','out_of_range','size_status','out_of_range');
  result:=result||jsonb_build_object('grades',coalesce((select jsonb_agg(grade order by grade) from
    (select distinct a.grade from internal.material_selection_available a where a.category_id=cat.id
      and (p_product is null or a.product_id=p_product)
      and (material_key=internal.manual_material_key(cat.name) or material_key=internal.manual_material_key(cat.slug)
        or material_key=internal.manual_material_key(a.product_name))) g),'[]'::jsonb));
  if cardinality(amounts)<>cardinality(cat.dimension_keys) then
    return result||jsonb_build_object('status','dimensions_required','size_status','dimensions_required');
  end if;
  -- Never fabricate a size from a pricing range. Rank explicit public sizes only.
  select z.*,d.delta into candidate from catalog.category_sizes z
    cross join lateral(select max(abs((z.dimensions->>k)::numeric-amounts[n])) as max_delta,
      sum(abs((z.dimensions->>k)::numeric-amounts[n])) as delta,
      array_agg((z.dimensions->>k)::numeric order by n) as ordered_dimensions
      from unnest(cat.dimension_keys) with ordinality keys(k,n)) d
    where z.category_id=cat.id and z.enabled and z.dimensions ?& cat.dimension_keys
      and (select count(*) from jsonb_object_keys(z.dimensions))=cardinality(amounts) and d.max_delta<=2
      and exists(select 1 from internal.material_selection_available a where a.size_id=z.id
        and (p_product is null or a.product_id=p_product)
        and (material_key=internal.manual_material_key(cat.name) or material_key=internal.manual_material_key(cat.slug)
          or material_key=internal.manual_material_key(a.product_name)))
    order by exists(select 1 from internal.material_selection_available a where a.size_id=z.id and a.grade=upper(trim(p_grade))
      and (p_product is null or a.product_id=p_product)
      and (material_key=internal.manual_material_key(cat.name) or material_key=internal.manual_material_key(cat.slug)
        or material_key=internal.manual_material_key(a.product_name))) desc,d.delta,d.ordered_dimensions,z.id limit 1;
  if not found then return result; end if;
  distance:=candidate.delta;
  result:=result||jsonb_build_object('size_status',case when distance=0 then 'exact' else 'rounded' end,
    'matched_size',jsonb_build_object('id',candidate.id,'label',candidate.label,'dimensions',candidate.dimensions));
  select count(*) into count_options from internal.material_selection_available a where a.size_id=candidate.id and a.grade=upper(trim(p_grade))
    and (p_product is null or a.product_id=p_product)
    and (material_key=internal.manual_material_key(cat.name) or material_key=internal.manual_material_key(cat.slug)
      or material_key=internal.manual_material_key(a.product_name));
  if count_options<>1 then return result||jsonb_build_object('status',case when count_options=0 then 'unlisted_grade' else 'ambiguous_product' end); end if;
  select * into opt from internal.material_selection_available a where a.size_id=candidate.id and a.grade=upper(trim(p_grade))
    and (p_product is null or a.product_id=p_product)
    and (material_key=internal.manual_material_key(cat.name) or material_key=internal.manual_material_key(cat.slug)
      or material_key=internal.manual_material_key(a.product_name));
  return result||jsonb_build_object('status','available','option',jsonb_build_object('id',opt.id,'product_id',opt.product_id,'product_name',opt.product_name,
    'grade',opt.grade,'variant_id',opt.variant_id,'attributes',opt.attributes,'uom',opt.uom,'min_order_qty',opt.min_order_qty));
end $$;

create or replace function public.fti_catalog_manual_request_submit(p_id uuid,p_request jsonb,p_quantity text,p_buyer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); old sales.raw_material_requests; preview jsonb; details jsonb; phone text; ref text; recipient record;
  nm text:=trim(coalesce(p_buyer->>'name','')); company text:=trim(coalesce(p_buyer->>'business','')); location text:=trim(coalesce(p_buyer->>'location',''));
  material text:=trim(coalesce(p_request->>'material','')); grade text:=trim(coalesce(p_request->>'grade','')); size text:=trim(coalesce(p_request->>'size',''));
  unit text:=p_request->>'uom'; product uuid:=nullif(p_request->>'product_id','')::uuid; match_option uuid;
  attrs jsonb; rate_text text; estimated_rate numeric; estimated_total numeric; pricing_uom text;
begin
  if p_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into old from sales.raw_material_requests where id=p_id;
  if found then
    if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
    if not old.manual_entry or old.details->'manual_input' is distinct from p_request
      or old.quantity::text is distinct from (case when coalesce(p_quantity,'') ~ '^\d{1,12}(\.\d{1,3})?$' then p_quantity::numeric(18,3)::text else null end)
      or old.details->>'name' is distinct from nm or old.details->>'business' is distinct from company or old.details->>'location' is distinct from location
      or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then raise exception 'This request ID was already used for different details' using errcode='22023'; end if;
    return jsonb_build_object('id',old.id,'reference',old.details->>'reference','replayed',true);
  end if;
  select '+'||regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
  if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering' using errcode='22023'; end if;
  if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
    or nm ~ '[[:cntrl:]]' or company ~ '[[:cntrl:]]' or location ~ '[[:cntrl:]]'
    or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then raise exception 'Enter buyer name, business and delivery location, and agree to WhatsApp updates' using errcode='22023'; end if;
  if coalesce(p_quantity,'') !~ '^\d{1,12}(\.\d{1,3})?$' then raise exception 'Enter a positive quantity with up to 3 decimal places' using errcode='22023'; end if;
  if p_quantity::numeric<=0 or unit is null or unit not in ('kg','MT','piece','box','bundle') then raise exception 'Enter quantity and unit' using errcode='22023'; end if;
  -- Lock only the matching category and its products; recheck after the locks.
  preview:=public.fti_catalog_manual_preview(material,size,grade,product);
  perform 1 from catalog.categories c join catalog.category_specs s on s.category_id=c.id
    where c.id=(preview->'category'->>'id')::uuid for share of c,s;
  perform 1 from catalog.products p where p.category_id=(preview->'category'->>'id')::uuid and p.product_kind='steel' order by p.id for share;
  preview:=public.fti_catalog_manual_preview(material,size,grade,product);
  if preview is distinct from p_request->'expected_match' then raise exception 'Available sizes or grades changed. Review the request again' using errcode='22023'; end if;
  if coalesce(p_request->>'grade_entry','list')<>'manual' and not (preview->'grades') ? upper(grade) then
    raise exception 'Choose a grade from the available list or enter it manually' using errcode='22023'; end if;
  if preview->>'status'='dimensions_required' then raise exception 'Enter all dimensions in the displayed order' using errcode='22023'; end if;
  if preview->>'status'='available' then
    if unit<>preview->'option'->>'uom' or p_quantity::numeric<(preview->'option'->>'min_order_qty')::numeric then raise exception 'Check the available unit and minimum quantity' using errcode='22023'; end if;
    match_option:=(preview->'option'->>'id')::uuid;
    attrs:=preview->'option'->'attributes';
    rate_text:=coalesce(attrs->>'sheet_flat_net_prate',attrs->>'grade_list_price');
    pricing_uom:=case when attrs ? 'sheet_flat_net_prate' or unit='MT' then 'MT' else unit end;
    if coalesce(attrs->>'quote_only','false')<>'true' and rate_text ~ '^\d+(\.\d+)?$'
      and (pricing_uom=unit or (pricing_uom='MT' and unit='kg')) then
      estimated_rate:=rate_text::numeric;
      estimated_total:=round(estimated_rate*p_quantity::numeric*case when pricing_uom='MT' and unit='kg' then 0.001 else 1 end,4);
    end if;
  end if;
  if (select count(*) from sales.raw_material_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many requests. Please try again later' using errcode='22023'; end if;
  ref:='FTI-RM-'||upper(replace(p_id::text,'-',''));
  details:=jsonb_build_object('reference',ref,'material',material,'grade',grade,
    'size',size,
    'quantity',p_quantity::numeric::text||' '||unit,'uom',unit,'name',nm,'business',company,'location',location,'phone',phone,
    'manual_input',p_request,'requested_size',size,'pricing_size',preview->'matched_size','match_status',preview->>'status','size_status',preview->>'size_status',
    'price_state',case when estimated_rate is null then 'request_quote' else 'estimated' end,
    'estimated_unit_price',estimated_rate,'estimated_total',estimated_total,'pricing_uom',pricing_uom,
    'gst_included',case when attrs ? 'sheet_flat_net_prate' then 'true'::jsonb else attrs->'grade_list_gst_included' end,
    'contact','9780830333');
  insert into sales.raw_material_requests(id,buyer_id,option_id,quantity,details,manual_entry) values(p_id,actor,match_option,p_quantity::numeric,details,true);
  insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_raw_material_received_v1',
    jsonb_build_array(nm,ref,material,details->>'size',grade,details->>'quantity'));
  for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
    insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_raw_material_admin_v1',
      jsonb_build_array(ref,material,details->>'size',grade,details->>'quantity',nm,company,phone,location));
  end loop;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'raw_material.submitted','raw_material_request',p_id);
  return jsonb_build_object('id',p_id,'reference',ref,'replayed',false);
end $$;
revoke all on function internal.manual_material_key(text) from public,anon,authenticated;
revoke all on function public.fti_catalog_manual_preview(text,text,text,uuid),public.fti_catalog_manual_request_submit(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.fti_catalog_manual_preview(text,text,text,uuid) to anon,authenticated;
grant execute on function public.fti_catalog_manual_request_submit(uuid,jsonb,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
