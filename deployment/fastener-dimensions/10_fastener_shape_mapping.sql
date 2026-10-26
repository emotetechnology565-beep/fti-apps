begin;
create or replace function internal.drawing_shape_matches(p_subcategory text,p_shape text) returns boolean
language sql immutable set search_path='' as $$
 select case p_subcategory
 when 'u-bolt' then p_shape in ('u-square','u-round')
 when 'j-type-bolt' then p_shape in ('j-i','j-ii')
 when 'j-hook' then p_shape in ('j-i','j-ii')
 when 'l-bolt' then p_shape='l'
 when 'coach-screw' then p_shape='coach'
 else false end;
$$;
-- Keep historical rows for staff correction; enforce correct mappings on every new save/publication.
alter table catalog.drawing_definitions drop constraint if exists drawing_shape_subcategory_matches;
alter table catalog.drawing_definitions add constraint drawing_shape_subcategory_matches
 check(internal.drawing_shape_matches(subcategory,shape)) not valid;
revoke all on function internal.drawing_shape_matches(text,text) from public,anon,authenticated;
commit;
