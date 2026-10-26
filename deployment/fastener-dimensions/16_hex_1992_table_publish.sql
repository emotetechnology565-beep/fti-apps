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
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M5",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 5,
      "pitch": 0.8,
      "widths": [],
      "lengths": [],
      "head_width": 8,
      "head_width_min": 7.64,
      "head_width_max": 8,
      "across_corners_min": 8.79,
      "head_height": 3.88,
      "head_height_min": 3.12,
      "head_height_max": 3.88,
      "diameter_min": 4.74,
      "diameter_max": 4.976,
      "pitch_diameter_min": 4.306,
      "pitch_diameter_max": 4.456,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M5",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 5,
      "pitch": 0.8,
      "widths": [],
      "lengths": [],
      "head_width": 8,
      "head_width_min": 7.64,
      "head_width_max": 8,
      "across_corners_min": 8.79,
      "head_height": 3.88,
      "head_height_min": 3.12,
      "head_height_max": 3.88,
      "diameter_min": 4.74,
      "diameter_max": 4.976,
      "pitch_diameter_min": 4.306,
      "pitch_diameter_max": 4.456,
      "thread_end_allowance": 3.2
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M5",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 5,
      "pitch": 0.8,
      "widths": [],
      "lengths": [],
      "head_width": 8,
      "head_width_min": 7.64,
      "head_width_max": 8,
      "across_corners_min": 8.79,
      "head_height": 5.6,
      "head_height_min": 4.4,
      "head_height_max": 5.6,
      "minor_diameter_min": 4.134,
      "minor_diameter_max": 4.384
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M5",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 5,
      "pitch": 0.8,
      "widths": [],
      "lengths": [],
      "head_width": 8,
      "head_width_min": 7.64,
      "head_width_max": 8,
      "across_corners_min": 8.79,
      "head_height": 2.9,
      "head_height_min": 2.2,
      "head_height_max": 2.9,
      "minor_diameter_min": 4.134,
      "minor_diameter_max": 4.384
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M6",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 11.05,
      "head_height": 4.38,
      "head_height_min": 3.62,
      "head_height_max": 4.38,
      "diameter_min": 5.694,
      "diameter_max": 5.974,
      "pitch_diameter_min": 5.144,
      "pitch_diameter_max": 5.324,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M6",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 11.05,
      "head_height": 4.38,
      "head_height_min": 3.62,
      "head_height_max": 4.38,
      "diameter_min": 5.694,
      "diameter_max": 5.974,
      "pitch_diameter_min": 5.144,
      "pitch_diameter_max": 5.324,
      "thread_end_allowance": 4
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M6",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 11.05,
      "head_height": 6.1,
      "head_height_min": 4.9,
      "head_height_max": 6.1,
      "minor_diameter_min": 4.917,
      "minor_diameter_max": 5.217
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M6",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 6,
      "pitch": 1,
      "widths": [],
      "lengths": [],
      "head_width": 10,
      "head_width_min": 9.64,
      "head_width_max": 10,
      "across_corners_min": 11.05,
      "head_height": 3.4,
      "head_height_min": 2.7,
      "head_height_max": 3.4,
      "minor_diameter_min": 4.917,
      "minor_diameter_max": 5.217
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M8",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.38,
      "head_height": 5.68,
      "head_height_min": 4.92,
      "head_height_max": 5.68,
      "diameter_min": 7.637,
      "diameter_max": 7.972,
      "pitch_diameter_min": 6.97,
      "pitch_diameter_max": 7.16,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M8",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.38,
      "head_height": 5.68,
      "head_height_min": 4.92,
      "head_height_max": 5.68,
      "diameter_min": 7.637,
      "diameter_max": 7.972,
      "pitch_diameter_min": 6.97,
      "pitch_diameter_max": 7.16,
      "thread_end_allowance": 5
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M8",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.38,
      "head_height": 7.9,
      "head_height_min": 6.4,
      "head_height_max": 7.9,
      "minor_diameter_min": 6.647,
      "minor_diameter_max": 6.982
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M8",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 8,
      "pitch": 1.25,
      "widths": [],
      "lengths": [],
      "head_width": 13,
      "head_width_min": 12.57,
      "head_width_max": 13,
      "across_corners_min": 14.38,
      "head_height": 4.25,
      "head_height_min": 3.5,
      "head_height_max": 4.25,
      "minor_diameter_min": 6.647,
      "minor_diameter_max": 6.982
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M10",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 16,
      "head_width_min": 15.57,
      "head_width_max": 16,
      "across_corners_min": 17.77,
      "head_height": 6.85,
      "head_height_min": 5.95,
      "head_height_max": 6.85,
      "diameter_min": 9.593,
      "diameter_max": 9.968,
      "pitch_diameter_min": 8.782,
      "pitch_diameter_max": 8.994,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M10",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 16,
      "head_width_min": 15.57,
      "head_width_max": 16,
      "across_corners_min": 17.77,
      "head_height": 6.85,
      "head_height_min": 5.95,
      "head_height_max": 6.85,
      "diameter_min": 9.593,
      "diameter_max": 9.968,
      "pitch_diameter_min": 8.782,
      "pitch_diameter_max": 8.994,
      "thread_end_allowance": 6
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M10",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 16,
      "head_width_min": 15.57,
      "head_width_max": 16,
      "across_corners_min": 17.77,
      "head_height": 9.5,
      "head_height_min": 8,
      "head_height_max": 9.5,
      "minor_diameter_min": 8.376,
      "minor_diameter_max": 8.751
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M10",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 10,
      "pitch": 1.5,
      "widths": [],
      "lengths": [],
      "head_width": 16,
      "head_width_min": 15.57,
      "head_width_max": 16,
      "across_corners_min": 17.77,
      "head_height": 5.25,
      "head_height_min": 4.5,
      "head_height_max": 5.25,
      "minor_diameter_min": 8.376,
      "minor_diameter_max": 8.751
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M12",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 18,
      "head_width_min": 17.57,
      "head_width_max": 18,
      "across_corners_min": 20.03,
      "head_height": 7.95,
      "head_height_min": 7.05,
      "head_height_max": 7.95,
      "diameter_min": 11.541,
      "diameter_max": 11.966,
      "pitch_diameter_min": 10.593,
      "pitch_diameter_max": 10.829,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M12",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 18,
      "head_width_min": 17.57,
      "head_width_max": 18,
      "across_corners_min": 20.03,
      "head_height": 7.95,
      "head_height_min": 7.05,
      "head_height_max": 7.95,
      "diameter_min": 11.541,
      "diameter_max": 11.966,
      "pitch_diameter_min": 10.593,
      "pitch_diameter_max": 10.829,
      "thread_end_allowance": 7
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M12",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 18,
      "head_width_min": 17.57,
      "head_width_max": 18,
      "across_corners_min": 20.03,
      "head_height": 12.2,
      "head_height_min": 10.4,
      "head_height_max": 12.2,
      "minor_diameter_min": 10.106,
      "minor_diameter_max": 10.531
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M12",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 12,
      "pitch": 1.75,
      "widths": [],
      "lengths": [],
      "head_width": 18,
      "head_width_min": 17.57,
      "head_width_max": 18,
      "across_corners_min": 20.03,
      "head_height": 6.3,
      "head_height_min": 5.5,
      "head_height_max": 6.3,
      "minor_diameter_min": 10.106,
      "minor_diameter_max": 10.531
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M14",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.36,
      "head_height": 9.75,
      "head_height_min": 8.25,
      "head_height_max": 9.75,
      "diameter_min": 13.512,
      "diameter_max": 13.962,
      "pitch_diameter_min": 12.413,
      "pitch_diameter_max": 12.663,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M14",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.36,
      "head_height": 9.75,
      "head_height_min": 8.25,
      "head_height_max": 9.75,
      "diameter_min": 13.512,
      "diameter_max": 13.962,
      "pitch_diameter_min": 12.413,
      "pitch_diameter_max": 12.663,
      "thread_end_allowance": 7.5
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M14",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.36,
      "head_height": 13.2,
      "head_height_min": 11.4,
      "head_height_max": 13.2,
      "minor_diameter_min": 11.835,
      "minor_diameter_max": 12.31
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M14",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 14,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 22,
      "head_width_min": 21.16,
      "head_width_max": 22,
      "across_corners_min": 23.36,
      "head_height": 7.4,
      "head_height_min": 6.2,
      "head_height_max": 7.4,
      "minor_diameter_min": 11.835,
      "minor_diameter_max": 12.31
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M16",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.75,
      "head_height": 10.75,
      "head_height_min": 9.25,
      "head_height_max": 10.75,
      "diameter_min": 15.512,
      "diameter_max": 15.962,
      "pitch_diameter_min": 14.413,
      "pitch_diameter_max": 14.663,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M16",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.75,
      "head_height": 10.75,
      "head_height_min": 9.25,
      "head_height_max": 10.75,
      "diameter_min": 15.512,
      "diameter_max": 15.962,
      "pitch_diameter_min": 14.413,
      "pitch_diameter_max": 14.663,
      "thread_end_allowance": 8
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M16",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.75,
      "head_height": 15.9,
      "head_height_min": 14.1,
      "head_height_max": 15.9,
      "minor_diameter_min": 13.835,
      "minor_diameter_max": 14.31
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M16",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 16,
      "pitch": 2,
      "widths": [],
      "lengths": [],
      "head_width": 24,
      "head_width_min": 23.16,
      "head_width_max": 24,
      "across_corners_min": 26.75,
      "head_height": 8.4,
      "head_height_min": 7,
      "head_height_max": 8.4,
      "minor_diameter_min": 13.835,
      "minor_diameter_max": 14.31
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M18",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 30.14,
      "head_height": 12.4,
      "head_height_min": 10.6,
      "head_height_max": 12.4,
      "diameter_min": 17.512,
      "diameter_max": 17.962,
      "pitch_diameter_min": 16.069,
      "pitch_diameter_max": 16.334,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M18",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 30.14,
      "head_height": 12.4,
      "head_height_min": 10.6,
      "head_height_max": 12.4,
      "diameter_min": 17.512,
      "diameter_max": 17.962,
      "pitch_diameter_min": 16.069,
      "pitch_diameter_max": 16.334,
      "thread_end_allowance": 9
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M18",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 30.14,
      "head_height": 16.7,
      "head_height_min": 14.9,
      "head_height_max": 16.7,
      "minor_diameter_min": 15.294,
      "minor_diameter_max": 15.854
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M18",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 18,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 27,
      "head_width_min": 26.16,
      "head_width_max": 27,
      "across_corners_min": 30.14,
      "head_height": 9.4,
      "head_height_min": 8.2,
      "head_height_max": 9.4,
      "minor_diameter_min": 15.294,
      "minor_diameter_max": 15.854
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M20",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 33.53,
      "head_height": 13.4,
      "head_height_min": 11.6,
      "head_height_max": 13.4,
      "diameter_min": 19.428,
      "diameter_max": 19.958,
      "pitch_diameter_min": 18.069,
      "pitch_diameter_max": 18.334,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M20",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 33.53,
      "head_height": 13.4,
      "head_height_min": 11.6,
      "head_height_max": 13.4,
      "diameter_min": 19.428,
      "diameter_max": 19.958,
      "pitch_diameter_min": 18.069,
      "pitch_diameter_max": 18.334,
      "thread_end_allowance": 10
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M20",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 33.53,
      "head_height": 18.7,
      "head_height_min": 16.6,
      "head_height_max": 18.7,
      "minor_diameter_min": 17.294,
      "minor_diameter_max": 17.854
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M20",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 20,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 30,
      "head_width_min": 29.16,
      "head_width_max": 30,
      "across_corners_min": 33.53,
      "head_height": 10.5,
      "head_height_min": 9,
      "head_height_max": 10.5,
      "minor_diameter_min": 17.294,
      "minor_diameter_max": 17.854
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M22",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 37.72,
      "head_height": 14.9,
      "head_height_min": 13.1,
      "head_height_max": 14.9,
      "diameter_min": 21.428,
      "diameter_max": 21.958,
      "pitch_diameter_min": 20.049,
      "pitch_diameter_max": 20.334,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M22",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 37.72,
      "head_height": 14.9,
      "head_height_min": 13.1,
      "head_height_max": 14.9,
      "diameter_min": 21.428,
      "diameter_max": 21.958,
      "pitch_diameter_min": 20.049,
      "pitch_diameter_max": 20.334,
      "thread_end_allowance": 11
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M22",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 37.72,
      "head_height": 19.5,
      "head_height_min": 17.6,
      "head_height_max": 19.5,
      "minor_diameter_min": 19.274,
      "minor_diameter_max": 19.854
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M22",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 22,
      "pitch": 2.5,
      "widths": [],
      "lengths": [],
      "head_width": 32,
      "head_width_min": 31,
      "head_width_max": 32,
      "across_corners_min": 37.72,
      "head_height": 11.3,
      "head_height_min": 9.6,
      "head_height_max": 11.3,
      "minor_diameter_min": 19.274,
      "minor_diameter_max": 19.854
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M24",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.98,
      "head_height": 15.9,
      "head_height_min": 14.1,
      "head_height_max": 15.9,
      "diameter_min": 23.352,
      "diameter_max": 23.952,
      "pitch_diameter_min": 21.688,
      "pitch_diameter_max": 22.003,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M24",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.98,
      "head_height": 15.9,
      "head_height_min": 14.1,
      "head_height_max": 15.9,
      "diameter_min": 23.352,
      "diameter_max": 23.952,
      "pitch_diameter_min": 21.688,
      "pitch_diameter_max": 22.003,
      "thread_end_allowance": 11
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M24",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.98,
      "head_height": 22.3,
      "head_height_min": 20.2,
      "head_height_max": 22.3,
      "minor_diameter_min": 20.752,
      "minor_diameter_max": 21.382
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M24",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 24,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 36,
      "head_width_min": 35,
      "head_width_max": 36,
      "across_corners_min": 39.98,
      "head_height": 12.3,
      "head_height_min": 10.6,
      "head_height_max": 12.3,
      "minor_diameter_min": 20.752,
      "minor_diameter_max": 21.382
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M27",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "head_height": 17.75,
      "head_height_min": 15.65,
      "head_height_max": 17.75,
      "diameter_min": 26.352,
      "diameter_max": 26.952,
      "pitch_diameter_min": 24.688,
      "pitch_diameter_max": 25.003,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M27",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "head_height": 17.75,
      "head_height_min": 15.65,
      "head_height_max": 17.75,
      "diameter_min": 26.352,
      "diameter_max": 26.952,
      "pitch_diameter_min": 24.688,
      "pitch_diameter_max": 25.003,
      "thread_end_allowance": 12
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M27",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "head_height": 23.5,
      "head_height_min": 21.4,
      "head_height_max": 23.5,
      "minor_diameter_min": 23.752,
      "minor_diameter_max": 24.382
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M27",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 27,
      "pitch": 3,
      "widths": [],
      "lengths": [],
      "head_width": 41,
      "head_width_min": 40,
      "head_width_max": 41,
      "across_corners_min": 45.2,
      "head_height": 13.9,
      "head_height_min": 12,
      "head_height_max": 13.9,
      "minor_diameter_min": 23.752,
      "minor_diameter_max": 24.382
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M30",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "head_height": 19.75,
      "head_height_min": 17.65,
      "head_height_max": 19.75,
      "diameter_min": 29.277,
      "diameter_max": 29.947,
      "pitch_diameter_min": 27.339,
      "pitch_diameter_max": 27.674,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M30",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "head_height": 19.75,
      "head_height_min": 17.65,
      "head_height_max": 19.75,
      "diameter_min": 29.277,
      "diameter_max": 29.947,
      "pitch_diameter_min": 27.339,
      "pitch_diameter_max": 27.674,
      "thread_end_allowance": 14
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M30",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "head_height": 26.4,
      "head_height_min": 24.3,
      "head_height_max": 26.4,
      "minor_diameter_min": 26.211,
      "minor_diameter_max": 26.921
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M30",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 30,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 46,
      "head_width_min": 45,
      "head_width_max": 46,
      "across_corners_min": 50.85,
      "head_height": 15.4,
      "head_height_min": 13.1,
      "head_height_max": 15.4,
      "minor_diameter_min": 26.211,
      "minor_diameter_max": 26.921
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M33",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "head_height": 21.55,
      "head_height_min": 19.45,
      "head_height_max": 21.55,
      "diameter_min": 32.277,
      "diameter_max": 32.947,
      "pitch_diameter_min": 30.339,
      "pitch_diameter_max": 30.674,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M33",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "head_height": 21.55,
      "head_height_min": 19.45,
      "head_height_max": 21.55,
      "diameter_min": 32.277,
      "diameter_max": 32.947,
      "pitch_diameter_min": 30.339,
      "pitch_diameter_max": 30.674,
      "thread_end_allowance": 14
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M33",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "head_height": 28.4,
      "head_height_min": 26.3,
      "head_height_max": 28.4,
      "minor_diameter_min": 29.211,
      "minor_diameter_max": 29.921
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M33",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 33,
      "pitch": 3.5,
      "widths": [],
      "lengths": [],
      "head_width": 50,
      "head_width_min": 49,
      "head_width_max": 50,
      "across_corners_min": 55.37,
      "head_height": 16.9,
      "head_height_min": 15,
      "head_height_max": 16.9,
      "minor_diameter_min": 29.211,
      "minor_diameter_max": 29.921
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-bolt",
    "size": "M36",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "head_height": 23.55,
      "head_height_min": 21.45,
      "head_height_max": 23.55,
      "diameter_min": 35.19,
      "diameter_max": 35.94,
      "pitch_diameter_min": 32.987,
      "pitch_diameter_max": 33.342,
      "thread_add_short": 6,
      "thread_add_medium": 12,
      "thread_add_long": 25
    }
  },
  {
    "subcategory": "hex-bolt",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-screw",
    "size": "M36",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "head_height": 23.55,
      "head_height_min": 21.45,
      "head_height_max": 23.55,
      "diameter_min": 35.19,
      "diameter_max": 35.94,
      "pitch_diameter_min": 32.987,
      "pitch_diameter_max": 33.342,
      "thread_end_allowance": 16
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "hex-nut",
    "size": "M36",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "head_height": 31.5,
      "head_height_min": 29.4,
      "head_height_max": 31.5,
      "minor_diameter_min": 31.67,
      "minor_diameter_max": 32.429
    }
  },
  {
    "subcategory": "hex-nut",
    "family": "hex",
    "standard": "IS 1363",
    "edition": "1992",
    "shape": "lock-nut",
    "size": "M36",
    "source": "Client-supplied IS 1363:1992 Table 3 image",
    "notes": "Table 3 values retained as printed, including unusual M18 major diameter, M22 across-corners and M36 bore limits. Parts 1/2/3 correspond to bolts/screws/nuts; product grade C. Lock nut dimensions are tabulated but no separate part is asserted. Maximum head envelope shown; overall length is selected separately. Bolt thread cutoff is 125 mm; thread length tolerance is +2P/-0. Chamfers and thread roots are schematic.",
    "dimensions": {
      "diameter": 36,
      "pitch": 4,
      "widths": [],
      "lengths": [],
      "head_width": 55,
      "head_width_min": 53.8,
      "head_width_max": 55,
      "across_corners_min": 60.79,
      "head_height": 18.4,
      "head_height_min": 16.5,
      "head_height_max": 18.4,
      "minor_diameter_min": 31.67,
      "minor_diameter_max": 32.429
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

-- Results appear after commit: expected published totals are 15 for each of the four shapes.
select shape,count(*) as total,
 count(*) filter(where published_revision=revision and published_data is not null) as published,
 count(*) filter(where published_revision is distinct from revision or published_data is null) as unchanged_manual_drafts
from catalog.drawing_definitions
where family='hex' and standard='IS 1363' and edition='1992'
group by shape order by shape;
