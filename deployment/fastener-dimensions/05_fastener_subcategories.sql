begin;
alter table catalog.drawing_definitions add column if not exists subcategory text;
update catalog.drawing_definitions set subcategory=case
 when shape like 'u-%' then 'u-bolt' when shape like 'j-%' then 'j-type-bolt'
 when shape='l' then 'l-bolt' else 'coach-screw' end where subcategory is null;
alter table catalog.drawing_definitions alter column subcategory set not null;
alter table catalog.drawing_definitions drop constraint if exists drawing_subcategory_check;
alter table catalog.drawing_definitions add constraint drawing_subcategory_check check(subcategory in (
 'hex-bolt','heavy-hex-bolt','hex-nut','heavy-hex-nut','u-bolt','j-type-bolt','j-hook','square-j-bolt',
 'plain-washer','machined-washer','spring-washer','square-washer','dti-washer','square-nut','square-plate','l-bolt','coach-screw'));
update catalog.drawing_definitions set published_data=published_data||jsonb_build_object('subcategory',subcategory)
 where published_data is not null and not published_data ? 'subcategory';
drop index if exists catalog.drawing_family_standard_size_key;
create unique index if not exists drawing_subcategory_standard_size_key on catalog.drawing_definitions(subcategory,family,standard,edition,shape,size);

-- Retain existing save/MFA/revision/audit behavior and attach the chosen subcategory in the same transaction.
-- A default keeps the original save RPC and optional import compatible.
create or replace function internal.drawing_default_subcategory() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.subcategory is null then new.subcategory:=case when new.shape like 'u-%' then 'u-bolt'
  when new.shape like 'j-%' then 'j-type-bolt' when new.shape='l' then 'l-bolt' else 'coach-screw' end; end if;
 return new;
end $$;
drop trigger if exists drawing_default_subcategory on catalog.drawing_definitions;
create trigger drawing_default_subcategory before insert on catalog.drawing_definitions
 for each row execute function internal.drawing_default_subcategory();
create or replace function public.fti_catalog_drawing_save(p_id uuid,p_revision integer,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); d catalog.drawing_definitions; before_data jsonb;
 fam text:=coalesce(p_definition->>'family',case when p_definition->>'shape'='coach' then 'coach' else 'roofing' end);
begin
 if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>65536 then raise exception 'Invalid dimension definition' using errcode='22023'; end if;
 if p_id is null then
  if p_revision is not null then raise exception 'A new definition cannot have a revision' using errcode='22023'; end if;
  insert into catalog.drawing_definitions(subcategory,family,standard,edition,shape,size,source,notes,dimensions)
   values(coalesce(p_definition->>'subcategory',case when p_definition->>'shape' like 'u-%' then 'u-bolt' when p_definition->>'shape' like 'j-%' then 'j-type-bolt' when p_definition->>'shape'='l' then 'l-bolt' else 'coach-screw' end),fam,trim(p_definition->>'standard'),p_definition->>'edition',p_definition->>'shape',trim(p_definition->>'size'),trim(p_definition->>'source'),coalesce(p_definition->>'notes',''),p_definition->'dimensions') returning * into d;
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

create or replace function public.fti_catalog_drawing_subcategory_save(p_id uuid,p_revision integer,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); saved jsonb; category text:=p_definition->>'subcategory';
begin
 if category is null or category not in ('hex-bolt','heavy-hex-bolt','hex-nut','heavy-hex-nut','u-bolt','j-type-bolt','j-hook','square-j-bolt',
 'plain-washer','machined-washer','spring-washer','square-washer','dti-washer','square-nut','square-plate','l-bolt','coach-screw') then
 raise exception 'Choose a valid fastener subcategory' using errcode='22023'; end if;
 saved:=public.fti_catalog_drawing_save(p_id,p_revision,p_definition);
 update catalog.drawing_definitions set subcategory=category where id=(saved->>'id')::uuid;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'catalog.drawing.subcategory','drawing_definition',(saved->>'id')::uuid,jsonb_build_object('subcategory',category));
 return saved||jsonb_build_object('subcategory',category);
end $$;
revoke all on function internal.drawing_default_subcategory(),public.fti_catalog_drawing_subcategory_save(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.fti_catalog_drawing_subcategory_save(uuid,integer,jsonb) to authenticated;
commit;
