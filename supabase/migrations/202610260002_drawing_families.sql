begin;
alter table catalog.drawing_definitions add column if not exists family text not null default 'roofing';
update catalog.drawing_definitions set family='coach' where shape='coach' and family='roofing';
alter table catalog.drawing_definitions drop constraint if exists drawing_definitions_family_check;
alter table catalog.drawing_definitions add constraint drawing_definitions_family_check
 check(family in ('foundation','roofing','coach') and (family='coach')=(shape='coach') and not(family='foundation' and standard='IS 730'));
alter table catalog.drawing_definitions drop constraint if exists drawing_definitions_standard_edition_shape_size_key;
create unique index if not exists drawing_family_standard_size_key on catalog.drawing_definitions(family,standard,edition,shape,size);
-- Preserve visibility/revisions while adding the correct family to previously published snapshots.
update catalog.drawing_definitions set published_data=published_data||jsonb_build_object('family',case when published_data->>'shape'='coach' then 'coach' else family end)
where published_data is not null and not published_data ? 'family';

create or replace function public.fti_catalog_drawing_save(p_id uuid,p_revision integer,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); d catalog.drawing_definitions; before_data jsonb;
 fam text:=coalesce(p_definition->>'family',case when p_definition->>'shape'='coach' then 'coach' else 'roofing' end);
begin
 if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>65536 then raise exception 'Invalid dimension definition' using errcode='22023'; end if;
 if p_id is null then
  if p_revision is not null then raise exception 'A new definition cannot have a revision' using errcode='22023'; end if;
  insert into catalog.drawing_definitions(family,standard,edition,shape,size,source,notes,dimensions)
   values(fam,trim(p_definition->>'standard'),p_definition->>'edition',p_definition->>'shape',trim(p_definition->>'size'),trim(p_definition->>'source'),coalesce(p_definition->>'notes',''),p_definition->'dimensions') returning * into d;
 else
  select * into d from catalog.drawing_definitions where id=p_id for update;
  if not found then raise exception 'Dimension definition not found' using errcode='P0002'; end if;
  if p_revision is distinct from d.revision then raise exception 'Dimensions changed. Reload before saving.' using errcode='40001'; end if;
  before_data:=to_jsonb(d)-'published_data';
  update catalog.drawing_definitions set family=fam,standard=trim(p_definition->>'standard'),edition=p_definition->>'edition',
   shape=p_definition->>'shape',size=trim(p_definition->>'size'),source=trim(p_definition->>'source'),notes=coalesce(p_definition->>'notes',''),
   dimensions=p_definition->'dimensions',revision=revision+1,updated_at=now() where id=p_id returning * into d;
 end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
 values(actor,'catalog.drawing.save','drawing_definition',d.id,before_data,to_jsonb(d)-'published_data');
 return to_jsonb(d)-'published_data';
end $$;
commit;
