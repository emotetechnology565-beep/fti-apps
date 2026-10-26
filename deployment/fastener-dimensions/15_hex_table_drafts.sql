-- Legacy filename: this now DIRECTLY PUBLISHES as requested.
-- DIRECT PUBLISH: includes the hex schema/validator fix before importing and publishing.
-- Existing matching entries publish immediately; manually changed dimensions are preserved.
begin;
ALTER table catalog.drawing_definitions drop constraint if exists drawing_definitions_shape_check;
ALTER table catalog.drawing_definitions add constraint drawing_definitions_shape_check check(shape in ('j-i','j-ii','u-square','u-round','l','coach','hex-bolt','hex-screw','hex-nut','lock-nut'));
ALTER table catalog.drawing_definitions drop constraint if exists drawing_definitions_family_check;
ALTER table catalog.drawing_definitions add constraint drawing_definitions_family_check check(
 family in ('foundation','roofing','coach','hex') and (family='coach')=(shape='coach')
 and (family='hex')=(shape in ('hex-bolt','hex-screw','hex-nut','lock-nut')) and not(family='foundation' and standard='IS 730'));
create or replace function internal.valid_drawing_dimensions(p_shape text,p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; a jsonb; item jsonb;
begin
 if p_shape not in ('j-i','j-ii','u-square','u-round','l','coach','hex-bolt','hex-screw','hex-nut','lock-nut') or jsonb_typeof(p_data) is distinct from 'object' then return false; end if;
 if not(p_data ? 'diameter' and p_data ? 'widths' and p_data ? 'lengths') then return false; end if;
 for k,v in select * from jsonb_each(p_data) loop
  if k not in ('diameter','widths','lengths','depth','radius','pitch','thread_base','head_width','head_height','diameter_min','diameter_max','head_width_min','head_width_max','head_height_min','head_height_max','across_corners_min','fillet_radius_max','pitch_diameter_min','pitch_diameter_max','minor_diameter_min','minor_diameter_max','thread_add_short','thread_add_medium','thread_add_long','thread_end_allowance') then return false; end if;
  if k in ('widths','lengths') then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>300 then return false; end if;
   for item in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(item)<>'number' then return false; end if;
    if (item#>>'{}')::numeric<=0 or (item#>>'{}')::numeric>10000 then return false; end if;
   end loop;
   if (select count(*)<>count(distinct e) from jsonb_array_elements(v) e) then return false; end if;
  else
   if jsonb_typeof(v)<>'number' then return false; end if;
   if (v#>>'{}')::numeric<=0 or (v#>>'{}')::numeric>10000 then return false; end if;
  end if;
 end loop;
 for k in select unnest(array['diameter','head_width','head_height','pitch_diameter','minor_diameter']) loop
  if p_data ? (k||'_min') and p_data ? (k||'_max') and (p_data->>(k||'_min'))::numeric>(p_data->>(k||'_max'))::numeric then return false; end if;
 end loop;
 if p_shape in ('hex-bolt','hex-screw','hex-nut','lock-nut') then
  if not(p_data ?& array['head_width','head_height','pitch']) or (p_data->>'head_width')::numeric<=(p_data->>'diameter')::numeric then return false; end if;
  if p_shape in ('hex-nut','lock-nut') then return p_data ?& array['minor_diameter_min','minor_diameter_max']; end if;
  if p_shape='hex-screw' then return p_data ? 'thread_end_allowance'; end if;
  return p_data ?& array['thread_add_short','thread_add_medium','thread_add_long'];
 end if;
 if p_shape='coach' then
  return p_data ?& array['head_width','head_height','pitch'] and (p_data->>'head_width')::numeric>(p_data->>'diameter')::numeric;
 end if;
 if not p_data ? 'thread_base' then return false; end if;
 if p_shape in ('j-i','u-square','l') then
  if not p_data ? 'radius' or jsonb_array_length(p_data->'widths')=0 or jsonb_array_length(p_data->'lengths')=0 then return false; end if;
 end if;
 if p_shape in ('j-i','l') and not p_data ? 'depth' then return false; end if;
 return true;
end $$;

-- Refresh the original dimensional check after replacing the validator.
alter table catalog.drawing_definitions drop constraint if exists drawing_definitions_check;
alter table catalog.drawing_definitions add constraint drawing_definitions_check
 check(internal.valid_drawing_dimensions(shape,dimensions));

create or replace function internal.drawing_shape_matches(p_subcategory text,p_shape text) returns boolean
language sql immutable set search_path='' as $$
 select case p_subcategory
 when 'hex-bolt' then p_shape in ('hex-bolt','hex-screw')
 when 'hex-nut' then p_shape in ('hex-nut','lock-nut')
 when 'u-bolt' then p_shape in ('u-square','u-round')
 when 'j-type-bolt' then p_shape in ('j-i','j-ii')
 when 'j-hook' then p_shape in ('j-i','j-ii')
 when 'l-bolt' then p_shape='l'
 when 'coach-screw' then p_shape='coach'
 else false end;
$$;
create or replace function public.fti_catalog_drawing_save(p_id uuid,p_revision integer,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); d catalog.drawing_definitions; before_data jsonb;
 fam text:=coalesce(p_definition->>'family',case when p_definition->>'shape' in ('hex-bolt','hex-screw','hex-nut','lock-nut') then 'hex' when p_definition->>'shape'='coach' then 'coach' else 'roofing' end);
begin
 if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>65536 then raise exception 'Invalid dimension definition' using errcode='22023'; end if;
 if p_id is null then
  if p_revision is not null then raise exception 'A new definition cannot have a revision' using errcode='22023'; end if;
  insert into catalog.drawing_definitions(subcategory,family,standard,edition,shape,size,source,notes,dimensions)
   values(coalesce(p_definition->>'subcategory',case when p_definition->>'shape' in ('hex-bolt','hex-screw') then 'hex-bolt' when p_definition->>'shape' in ('hex-nut','lock-nut') then 'hex-nut' when p_definition->>'shape' like 'u-%' then 'u-bolt' when p_definition->>'shape' like 'j-%' then 'j-type-bolt' when p_definition->>'shape'='l' then 'l-bolt' else 'coach-screw' end),fam,trim(p_definition->>'standard'),p_definition->>'edition',p_definition->>'shape',trim(p_definition->>'size'),trim(p_definition->>'source'),coalesce(p_definition->>'notes',''),p_definition->'dimensions') returning * into d;
 else
  select * into d from catalog.drawing_definitions where id=p_id for update;
  if not found then raise exception 'Dimension definition not found' using errcode='P0002'; end if;
  if p_revision is distinct from d.revision then raise exception 'Dimensions changed. Reload before saving.' using errcode='40001'; end if;
  before_data:=to_jsonb(d)-'published_data';
  update catalog.drawing_definitions set subcategory=coalesce(p_definition->>'subcategory',subcategory),family=fam,standard=trim(p_definition->>'standard'),edition=p_definition->>'edition',
   shape=p_definition->>'shape',size=trim(p_definition->>'size'),source=trim(p_definition->>'source'),notes=coalesce(p_definition->>'notes',''),
   dimensions=p_definition->'dimensions',revision=revision+1,updated_at=now() where id=p_id returning * into d;
 end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
 values(actor,'catalog.drawing.save','drawing_definition',d.id,before_data,to_jsonb(d)-'published_data');
 return to_jsonb(d)-'published_data';
end $$;


create temporary table fti_hex_publish_import on commit drop as
 select * from jsonb_to_recordset($hex$[
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M6",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 10.89,
      "diameter_min": 5.694,
      "diameter_max": 5.974,
      "pitch_diameter_min": 5.144,
      "pitch_diameter_max": 5.324,
      "head_height": 4.38,
      "head_height_min": 3.62,
      "head_height_max": 4.38,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M6",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 10.89,
      "diameter_min": 5.694,
      "diameter_max": 5.974,
      "pitch_diameter_min": 5.144,
      "pitch_diameter_max": 5.324,
      "head_height": 4.38,
      "head_height_min": 3.62,
      "head_height_max": 4.38,
      "thread_end_allowance": 4
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M6",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 10.89,
      "head_height": 5.38,
      "head_height_min": 4.62,
      "head_height_max": 5.38,
      "minor_diameter_min": 4.917,
      "minor_diameter_max": 5.217
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M6",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 10.89,
      "head_height": 3.3,
      "head_height_min": 2.7,
      "head_height_max": 3.3,
      "minor_diameter_min": 4.917,
      "minor_diameter_max": 5.217
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M8",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.2,
      "diameter_min": 7.637,
      "diameter_max": 7.972,
      "pitch_diameter_min": 6.97,
      "pitch_diameter_max": 7.16,
      "head_height": 5.88,
      "head_height_min": 5.12,
      "head_height_max": 5.88,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M8",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.2,
      "diameter_min": 7.637,
      "diameter_max": 7.972,
      "pitch_diameter_min": 6.97,
      "pitch_diameter_max": 7.16,
      "head_height": 5.88,
      "head_height_min": 5.12,
      "head_height_max": 5.88,
      "thread_end_allowance": 4.5
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M8",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.2,
      "head_height": 6.95,
      "head_height_min": 6.05,
      "head_height_max": 6.95,
      "minor_diameter_min": 6.647,
      "minor_diameter_max": 6.982
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M8",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.2,
      "head_height": 4.38,
      "head_height_min": 3.62,
      "head_height_max": 4.38,
      "minor_diameter_min": 6.647,
      "minor_diameter_max": 6.982
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M10",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 17,
      "head_width_min": 16.57,
      "head_width_max": 17,
      "across_corners_min": 18.72,
      "diameter_min": 9.593,
      "diameter_max": 9.968,
      "pitch_diameter_min": 8.782,
      "pitch_diameter_max": 8.994,
      "head_height": 7.45,
      "head_height_min": 6.55,
      "head_height_max": 7.45,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M10",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 17,
      "head_width_min": 16.57,
      "head_width_max": 17,
      "across_corners_min": 18.72,
      "diameter_min": 9.593,
      "diameter_max": 9.968,
      "pitch_diameter_min": 8.782,
      "pitch_diameter_max": 8.994,
      "head_height": 7.45,
      "head_height_min": 6.55,
      "head_height_max": 7.45,
      "thread_end_allowance": 5
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M10",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 17,
      "head_width_min": 16.57,
      "head_width_max": 17,
      "across_corners_min": 18.72,
      "head_height": 8.45,
      "head_height_min": 7.55,
      "head_height_max": 8.45,
      "minor_diameter_min": 8.376,
      "minor_diameter_max": 8.751
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M10",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 17,
      "head_width_min": 16.57,
      "head_width_max": 17,
      "across_corners_min": 18.72,
      "head_height": 5.38,
      "head_height_min": 4.62,
      "head_height_max": 5.38,
      "minor_diameter_min": 8.376,
      "minor_diameter_max": 8.751
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M12",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 19,
      "head_width_min": 18.48,
      "head_width_max": 19,
      "across_corners_min": 20.88,
      "diameter_min": 11.541,
      "diameter_max": 11.966,
      "pitch_diameter_min": 10.593,
      "pitch_diameter_max": 10.829,
      "head_height": 8.45,
      "head_height_min": 7.55,
      "head_height_max": 8.45,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M12",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 19,
      "head_width_min": 18.48,
      "head_width_max": 19,
      "across_corners_min": 20.88,
      "diameter_min": 11.541,
      "diameter_max": 11.966,
      "pitch_diameter_min": 10.593,
      "pitch_diameter_max": 10.829,
      "head_height": 8.45,
      "head_height_min": 7.55,
      "head_height_max": 8.45,
      "thread_end_allowance": 6
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M12",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 19,
      "head_width_min": 18.48,
      "head_width_max": 19,
      "across_corners_min": 20.88,
      "head_height": 10.45,
      "head_height_min": 9.55,
      "head_height_max": 10.45,
      "minor_diameter_min": 10.106,
      "minor_diameter_max": 10.531
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M12",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 19,
      "head_width_min": 18.48,
      "head_width_max": 19,
      "across_corners_min": 20.88,
      "head_height": 7.45,
      "head_height_min": 6.55,
      "head_height_max": 7.45,
      "minor_diameter_min": 10.106,
      "minor_diameter_max": 10.531
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M14",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.91,
      "diameter_min": 13.512,
      "diameter_max": 13.962,
      "pitch_diameter_min": 12.413,
      "pitch_diameter_max": 12.663,
      "head_height": 9.45,
      "head_height_min": 8.55,
      "head_height_max": 9.45,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M14",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.91,
      "diameter_min": 13.512,
      "diameter_max": 13.962,
      "pitch_diameter_min": 12.413,
      "pitch_diameter_max": 12.663,
      "head_height": 9.45,
      "head_height_min": 8.55,
      "head_height_max": 9.45,
      "thread_end_allowance": 7.5
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M14",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.91,
      "head_height": 11.55,
      "head_height_min": 10.45,
      "head_height_max": 11.55,
      "minor_diameter_min": 11.835,
      "minor_diameter_max": 12.31
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M14",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.91,
      "head_height": 8.45,
      "head_height_min": 7.55,
      "head_height_max": 8.45,
      "minor_diameter_min": 11.835,
      "minor_diameter_max": 12.31
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M16",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.17,
      "diameter_min": 15.512,
      "diameter_max": 15.962,
      "pitch_diameter_min": 14.413,
      "pitch_diameter_max": 14.663,
      "head_height": 10.45,
      "head_height_min": 9.55,
      "head_height_max": 10.45,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M16",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.17,
      "diameter_min": 15.512,
      "diameter_max": 15.962,
      "pitch_diameter_min": 14.413,
      "pitch_diameter_max": 14.663,
      "head_height": 10.45,
      "head_height_min": 9.55,
      "head_height_max": 10.45,
      "thread_end_allowance": 7.5
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M16",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.17,
      "head_height": 13.55,
      "head_height_min": 12.45,
      "head_height_max": 13.55,
      "minor_diameter_min": 13.835,
      "minor_diameter_max": 14.31
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M16",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.17,
      "head_height": 8.45,
      "head_height_min": 7.55,
      "head_height_max": 8.45,
      "minor_diameter_min": 13.835,
      "minor_diameter_max": 14.31
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M18",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 29.56,
      "diameter_min": 17.512,
      "diameter_max": 17.962,
      "pitch_diameter_min": 16.069,
      "pitch_diameter_max": 16.334,
      "head_height": 12.55,
      "head_height_min": 11.45,
      "head_height_max": 12.55,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M18",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 29.56,
      "diameter_min": 17.512,
      "diameter_max": 17.962,
      "pitch_diameter_min": 16.069,
      "pitch_diameter_max": 16.334,
      "head_height": 12.55,
      "head_height_min": 11.45,
      "head_height_max": 12.55,
      "thread_end_allowance": 9
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M18",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 29.56,
      "head_height": 15.55,
      "head_height_min": 14.45,
      "head_height_max": 15.55,
      "minor_diameter_min": 15.294,
      "minor_diameter_max": 15.854
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M18",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 29.56,
      "head_height": 9.45,
      "head_height_min": 8.55,
      "head_height_max": 9.45,
      "minor_diameter_min": 15.294,
      "minor_diameter_max": 15.854
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M20",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 32.95,
      "diameter_min": 19.428,
      "diameter_max": 19.958,
      "pitch_diameter_min": 18.069,
      "pitch_diameter_max": 18.334,
      "head_height": 13.55,
      "head_height_min": 12.45,
      "head_height_max": 13.55,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M20",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 32.95,
      "diameter_min": 19.428,
      "diameter_max": 19.958,
      "pitch_diameter_min": 18.069,
      "pitch_diameter_max": 18.334,
      "head_height": 13.55,
      "head_height_min": 12.45,
      "head_height_max": 13.55,
      "thread_end_allowance": 9
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M20",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 32.95,
      "head_height": 16.55,
      "head_height_min": 15.45,
      "head_height_max": 16.55,
      "minor_diameter_min": 17.294,
      "minor_diameter_max": 17.854
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M20",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 32.95,
      "head_height": 9.45,
      "head_height_min": 8.55,
      "head_height_max": 9.45,
      "minor_diameter_min": 17.294,
      "minor_diameter_max": 17.854
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M22",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 35.03,
      "diameter_min": 21.428,
      "diameter_max": 21.958,
      "pitch_diameter_min": 20.069,
      "pitch_diameter_max": 20.334,
      "head_height": 14.55,
      "head_height_min": 13.45,
      "head_height_max": 14.55,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M22",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 35.03,
      "diameter_min": 21.428,
      "diameter_max": 21.958,
      "pitch_diameter_min": 20.069,
      "pitch_diameter_max": 20.334,
      "head_height": 14.55,
      "head_height_min": 13.45,
      "head_height_max": 14.55,
      "thread_end_allowance": 9
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M22",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 35.03,
      "head_height": 18.55,
      "head_height_min": 17.45,
      "head_height_max": 18.55,
      "minor_diameter_min": 19.274,
      "minor_diameter_max": 19.854
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M22",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 35.03,
      "head_height": 10.45,
      "head_height_min": 9.55,
      "head_height_max": 10.45,
      "minor_diameter_min": 19.274,
      "minor_diameter_max": 19.854
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M24",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.55,
      "diameter_min": 23.352,
      "diameter_max": 23.952,
      "pitch_diameter_min": 21.688,
      "pitch_diameter_max": 22.003,
      "head_height": 15.55,
      "head_height_min": 15.45,
      "head_height_max": 15.55,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-screw",
    "size": "M24",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.55,
      "diameter_min": 23.352,
      "diameter_max": 23.952,
      "pitch_diameter_min": 21.688,
      "pitch_diameter_max": 22.003,
      "head_height": 15.55,
      "head_height_min": 15.45,
      "head_height_max": 15.55,
      "thread_end_allowance": 11
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M24",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.55,
      "head_height": 19.65,
      "head_height_min": 18.35,
      "head_height_max": 19.65,
      "minor_diameter_min": 20.752,
      "minor_diameter_max": 21.382
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M24",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.55,
      "head_height": 10.45,
      "head_height_min": 9.55,
      "head_height_max": 10.45,
      "minor_diameter_min": 20.752,
      "minor_diameter_max": 21.382
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M27",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "diameter_min": 26.352,
      "diameter_max": 26.952,
      "pitch_diameter_min": 24.688,
      "pitch_diameter_max": 25.003,
      "head_height": 17.55,
      "head_height_min": 16.45,
      "head_height_max": 17.55,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M27",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "head_height": 22.65,
      "head_height_min": 21.35,
      "head_height_max": 22.65,
      "minor_diameter_min": 23.752,
      "minor_diameter_max": 24.382
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M27",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "head_height": 12.55,
      "head_height_min": 11.45,
      "head_height_max": 12.55,
      "minor_diameter_min": 23.752,
      "minor_diameter_max": 24.382
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M30",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "diameter_min": 29.277,
      "diameter_max": 29.947,
      "pitch_diameter_min": 27.339,
      "pitch_diameter_max": 27.674,
      "head_height": 19.65,
      "head_height_min": 18.35,
      "head_height_max": 19.65,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M30",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "head_height": 24.65,
      "head_height_min": 23.35,
      "head_height_max": 24.65,
      "minor_diameter_min": 26.211,
      "minor_diameter_max": 26.921
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M30",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "head_height": 12.55,
      "head_height_min": 11.45,
      "head_height_max": 12.55,
      "minor_diameter_min": 26.211,
      "minor_diameter_max": 26.921
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M33",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "diameter_min": 32.277,
      "diameter_max": 32.947,
      "pitch_diameter_min": 30.339,
      "pitch_diameter_max": 30.674,
      "head_height": 21.65,
      "head_height_min": 20.35,
      "head_height_max": 21.65,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M33",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "head_height": 26.65,
      "head_height_min": 25.35,
      "head_height_max": 26.65,
      "minor_diameter_min": 29.211,
      "minor_diameter_max": 29.921
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M33",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "head_height": 14.55,
      "head_height_min": 13.45,
      "head_height_max": 14.55,
      "minor_diameter_min": 29.211,
      "minor_diameter_max": 29.921
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M36",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "diameter_min": 35.19,
      "diameter_max": 35.94,
      "pitch_diameter_min": 32.987,
      "pitch_diameter_max": 33.342,
      "head_height": 23.65,
      "head_height_min": 22.35,
      "head_height_max": 23.65,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M36",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "head_height": 29.65,
      "head_height_min": 28.35,
      "head_height_max": 29.65,
      "minor_diameter_min": 31.67,
      "minor_diameter_max": 32.42
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M36",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "head_height": 14.55,
      "head_height_min": 13.45,
      "head_height_max": 14.55,
      "minor_diameter_min": 31.67,
      "minor_diameter_max": 32.42
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-bolt",
    "size": "M39",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 39,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 60,
      "head_width_min": 58.8,
      "head_width_max": 60,
      "across_corners_min": 66.44,
      "diameter_min": 38.19,
      "diameter_max": 38.94,
      "pitch_diameter_min": 35.987,
      "pitch_diameter_max": 36.342,
      "head_height": 25.65,
      "head_height_min": 24.35,
      "head_height_max": 25.65,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "hex-nut",
    "size": "M39",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 39,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 60,
      "head_width_min": 58.8,
      "head_width_max": 60,
      "across_corners_min": 66.44,
      "head_height": 31.8,
      "head_height_min": 30.2,
      "head_height_max": 31.8,
      "minor_diameter_min": 34.67,
      "minor_diameter_max": 35.42
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1967",
    "shape": "lock-nut",
    "size": "M39",
    "source": "Client-supplied IS 1363:1967 Table 2 image",
    "notes": "Values retained as printed. Drawing uses maximum table limits; no nominal head dimensions or overall lengths are inferred. External thread tolerance class 8g; nut thread class 7H. Shank tolerances and chamfers require manufacturing review.",
    "dimensions": {
      "diameter": 39,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 60,
      "head_width_min": 58.8,
      "head_width_max": 60,
      "across_corners_min": 66.44,
      "head_height": 16.55,
      "head_height_min": 15.45,
      "head_height_max": 16.55,
      "minor_diameter_min": 34.67,
      "minor_diameter_max": 35.42
    }
  }
]$hex$::jsonb)
 as r(subcategory text,family text,standard text,edition text,shape text,size text,source text,notes text,dimensions jsonb);

do $$ begin
 if exists(select 1 from fti_hex_publish_import where not internal.valid_drawing_dimensions(shape,dimensions)) then
  raise exception 'Hex dimension import failed validation';
 end if;
end $$;

with added as (
 insert into catalog.drawing_definitions(subcategory,family,standard,edition,shape,size,source,notes,dimensions)
 select subcategory,family,standard,edition,shape,size,source,notes,dimensions from fti_hex_publish_import
 on conflict(subcategory,family,standard,edition,shape,size) do nothing returning id,size,shape
)
insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
select auth.uid(),'catalog.hex_dimensions.import','drawing_definition',id,jsonb_build_object('size',size,'shape',shape) from added;

with approved as materialized (
 select d.* from catalog.drawing_definitions d join fti_hex_publish_import r
 on (d.subcategory,d.family,d.standard,d.edition,d.shape,d.size)=(r.subcategory,r.family,r.standard,r.edition,r.shape,r.size)
 where d.dimensions=r.dimensions and (d.published_revision is distinct from d.revision or d.published_data is null)
 for update of d
), published as (
 update catalog.drawing_definitions d
 set published_data=(to_jsonb(a)-'published_data')||jsonb_build_object('published_revision',a.revision+1,'revision',a.revision+1),
     published_revision=a.revision+1,revision=a.revision+1,updated_at=now()
 from approved a where d.id=a.id returning d.id,d.revision
)
insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
select auth.uid(),'catalog.drawing.publish','drawing_definition',id,jsonb_build_object('revision',revision) from published;
commit;

-- Results appear after commit: expected published totals are 15, 10, 15 and 15.
select shape,count(*) as total,
 count(*) filter(where published_revision=revision and published_data is not null) as published,
 count(*) filter(where published_revision is distinct from revision or published_data is null) as unchanged_manual_drafts
from catalog.drawing_definitions
where family='hex' and standard='IS 1363' and edition='1967'
group by shape order by shape;
