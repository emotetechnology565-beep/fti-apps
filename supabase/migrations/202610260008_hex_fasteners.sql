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

commit;
