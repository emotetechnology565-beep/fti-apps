begin;
create or replace function internal.valid_drawing_dimensions(p_shape text,p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; a jsonb; item jsonb;
begin
 if p_shape not in ('j-i','j-ii','u-square','u-round','l','coach') or jsonb_typeof(p_data) is distinct from 'object' then return false; end if;
 if not(p_data ? 'diameter' and p_data ? 'widths' and p_data ? 'lengths') then return false; end if;
 for k,v in select * from jsonb_each(p_data) loop
  if k not in ('diameter','widths','lengths','depth','radius','pitch','thread_base','head_width','head_height','diameter_min','diameter_max','head_width_min','head_width_max','head_height_min','head_height_max','across_corners_min','fillet_radius_max') then return false; end if;
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
 for k in select unnest(array['diameter','head_width','head_height']) loop
  if p_data ? (k||'_min') and p_data ? (k||'_max') and (p_data->>(k||'_min'))::numeric>(p_data->>(k||'_max'))::numeric then return false; end if;
 end loop;
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

commit;
