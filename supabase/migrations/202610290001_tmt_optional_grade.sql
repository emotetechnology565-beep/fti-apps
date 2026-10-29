-- Preserve TMT brand/size option pricing while recording a separate optional buyer grade.
create or replace function public.fti_catalog_selection_request_submit(p_id uuid,p_option_id uuid,p_quantity text,p_buyer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); chosen record; old sales.raw_material_requests; details jsonb;
  phone text; nm text:=trim(coalesce(p_buyer->>'name','')); company text:=trim(coalesce(p_buyer->>'business',''));
  location text:=trim(coalesce(p_buyer->>'location','')); ref text; recipient record; legacy_size integer;
  requested_grade text:=trim(coalesce(p_buyer->>'requested_grade','')); is_tmt boolean;
begin
  if length(requested_grade)>80 or requested_grade ~ '[[:cntrl:]]' then
    raise exception 'Use a single-line grade of up to 80 characters' using errcode='22023';
  end if;
  if p_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into old from sales.raw_material_requests where id=p_id;
  if found then
    if old.buyer_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
    if old.option_id is distinct from p_option_id or old.quantity::text is distinct from
      (case when coalesce(p_quantity,'') ~ '^\d{1,12}(\.\d{1,3})?$' then p_quantity::numeric(18,3)::text else null end)
      or old.details->>'name' is distinct from nm or old.details->>'business' is distinct from company
      or coalesce(old.details->>'requested_grade','') is distinct from requested_grade
      or old.details->>'location' is distinct from location or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
      raise exception 'This request ID was already used for different details' using errcode='22023';
    end if;
    return jsonb_build_object('id',old.id,'reference',old.details->>'reference','replayed',true);
  end if;
  select '+'||regexp_replace(u.phone,'^\+','') into phone from auth.users u where u.id=actor and u.phone_confirmed_at is not null;
  if phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Verify your WhatsApp phone before ordering' using errcode='22023'; end if;
  if length(nm) not between 2 and 80 or length(company) not between 1 and 80 or length(location) not between 5 and 100
    or coalesce(p_buyer->>'whatsapp_consent','false')<>'true' then
    raise exception 'Enter buyer name, business and delivery location, and agree to WhatsApp order updates' using errcode='22023';
  end if;
  if coalesce(p_quantity,'') !~ '^\d{1,12}(\.\d{1,3})?$' then raise exception 'Enter a valid quantity with up to 3 decimal places' using errcode='22023'; end if;
  -- All selection writers and grade publication lock category first. Acquire its
  -- shared lock before subordinate rows so concurrent admin edits cannot invert
  -- the category/spec/size/option lock hierarchy.
  perform 1 from catalog.categories c join catalog.availability_options o on o.category_id=c.id
    where o.id=p_option_id for share of c;
  perform 1 from catalog.products p join catalog.availability_options o on o.product_id=p.id
    where o.id=p_option_id for share of p;
  perform 1 from catalog.product_variants v join catalog.availability_options o on o.variant_id=v.id where o.id=p_option_id for share of v;
  -- Lock every editable availability row before reading the current public option.
  perform 1 from catalog.availability_options o join catalog.category_sizes s on s.id=o.size_id
    join catalog.category_specs spec on spec.category_id=o.category_id join catalog.products p on p.id=o.product_id
    join catalog.categories c on c.id=o.category_id where o.id=p_option_id for share of o,s,spec,p,c;
  select * into chosen from internal.material_selection_available where id=p_option_id;
  if not found then raise exception 'This size and grade are no longer available; choose again' using errcode='22023'; end if;
  is_tmt:=chosen.category_slug in ('tmt','tmt-bar','tmt-bars');
  if not is_tmt and requested_grade<>'' then
    raise exception 'Optional grade is only supported for TMT bars' using errcode='22023';
  end if;
  if p_quantity::numeric<=0 or p_quantity::numeric<chosen.min_order_qty then raise exception 'Quantity is below the minimum order' using errcode='22023'; end if;
  if (select count(*) from sales.raw_material_requests where buyer_id=actor and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Too many requests. Please try again later' using errcode='22023'; end if;
  ref:='FTI-RM-'||upper(replace(p_id::text,'-',''));
  if (select count(*) from jsonb_object_keys(chosen.dimensions))=1 then
    select case when value::text::numeric=trunc(value::text::numeric) and value::text::numeric<=2147483647 then value::text::numeric::integer else null end
      into legacy_size from jsonb_each(chosen.dimensions);
  end if;
  details:=jsonb_build_object('reference',ref,'material',left(chosen.product_name,100),'category',chosen.category_name,
    'size',chosen.size_label,'dimensions',chosen.dimensions,'grade',chosen.grade,'quantity',p_quantity::numeric::text||' '||chosen.uom,
    'uom',chosen.uom,'option_id',chosen.id,'price_state',case when chosen.attributes ? 'grade_list_price' or chosen.attributes ? 'sheet_flat_net_prate' then 'published' else 'request_quote' end,
    'published_price',coalesce(chosen.attributes->'grade_list_price',chosen.attributes->'sheet_flat_net_prate'),
    'name',nm,'business',company,'phone',phone,'location',location);
  if is_tmt then
    details:=details || jsonb_build_object('brand',chosen.grade,'grade',requested_grade,'requested_grade',requested_grade);
  end if;
  insert into sales.raw_material_requests(id,buyer_id,option_id,variant_id,size_mm,quantity,details)
    values(p_id,actor,chosen.id,chosen.variant_id,legacy_size,p_quantity::numeric,details);
  insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,phone,'fti_raw_material_received_v1',
    jsonb_build_array(nm,ref,details->>'material',details->>'size',case when is_tmt then 'Brand: '||chosen.grade||case when requested_grade<>'' then ' / Grade: '||requested_grade else '' end else details->>'grade' end,details->>'quantity'));
  for recipient in select r.phone from sales.raw_material_recipients r where r.enabled loop
    insert into sales.raw_material_jobs(request_id,phone,template,parameters) values(p_id,recipient.phone,'fti_raw_material_admin_v1',
      jsonb_build_array(ref,details->>'material',details->>'size',case when is_tmt then 'Brand: '||chosen.grade||case when requested_grade<>'' then ' / Grade: '||requested_grade else '' end else details->>'grade' end,details->>'quantity',nm,company,phone,location));
  end loop;
  insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'raw_material.submitted','raw_material_request',p_id);
  return jsonb_build_object('id',p_id,'reference',ref,'replayed',false);
end $$;
