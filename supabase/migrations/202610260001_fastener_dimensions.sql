begin;

create or replace function internal.valid_drawing_dimensions(p_shape text,p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; a jsonb; item jsonb;
begin
 if p_shape not in ('j-i','j-ii','u-square','u-round','l','coach') or jsonb_typeof(p_data) is distinct from 'object' then return false; end if;
 if not(p_data ? 'diameter' and p_data ? 'widths' and p_data ? 'lengths') then return false; end if;
 for k,v in select * from jsonb_each(p_data) loop
  if k not in ('diameter','widths','lengths','depth','radius','pitch','thread_base','head_width','head_height') then return false; end if;
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

create table if not exists catalog.drawing_definitions (
 id uuid primary key default gen_random_uuid(),
 standard text not null check(standard ~ '^IS [1-9][0-9]{0,5}$'),
 edition text not null check(edition ~ '^[0-9]{4}$'),
 shape text not null check(shape in ('j-i','j-ii','u-square','u-round','l','coach')),
 size text not null check(length(trim(size)) between 1 and 60),
 source text not null check(length(trim(source)) between 3 and 500),
 notes text not null default '' check(length(notes)<=2000),
 dimensions jsonb not null,
 revision integer not null default 1 check(revision>0),
 published_revision integer,
 published_data jsonb,
 updated_at timestamptz not null default now(),
 unique(standard,edition,shape,size),
 check(internal.valid_drawing_dimensions(shape,dimensions)),
 check((published_data is null)=(published_revision is null))
);
alter table catalog.drawing_definitions enable row level security;
revoke all on catalog.drawing_definitions from public,anon,authenticated;

create or replace function public.fti_catalog_drawing_list() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(published_data order by standard,edition,shape,size),'[]'::jsonb)
 from catalog.drawing_definitions where published_data is not null;
$$;
create or replace function public.fti_catalog_drawing_admin() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('catalog.manage');
 return (select coalesce(jsonb_agg(to_jsonb(d)-'published_data' order by standard,edition,shape,size),'[]'::jsonb) from catalog.drawing_definitions d);
end $$;
create or replace function public.fti_catalog_drawing_save(p_id uuid,p_revision integer,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); d catalog.drawing_definitions; before_data jsonb;
begin
 if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>65536 then raise exception 'Invalid dimension definition' using errcode='22023'; end if;
 if p_id is null then
  if p_revision is not null then raise exception 'A new definition cannot have a revision' using errcode='22023'; end if;
  insert into catalog.drawing_definitions(standard,edition,shape,size,source,notes,dimensions)
   values(trim(p_definition->>'standard'),p_definition->>'edition',p_definition->>'shape',trim(p_definition->>'size'),trim(p_definition->>'source'),coalesce(p_definition->>'notes',''),p_definition->'dimensions') returning * into d;
 else
  select * into d from catalog.drawing_definitions where id=p_id for update;
  if not found then raise exception 'Dimension definition not found' using errcode='P0002'; end if;
  if p_revision is distinct from d.revision then raise exception 'Dimensions changed. Reload before saving.' using errcode='40001'; end if;
  before_data:=to_jsonb(d)-'published_data';
  update catalog.drawing_definitions set standard=trim(p_definition->>'standard'),edition=p_definition->>'edition',
   shape=p_definition->>'shape',size=trim(p_definition->>'size'),source=trim(p_definition->>'source'),notes=coalesce(p_definition->>'notes',''),
   dimensions=p_definition->'dimensions',revision=revision+1,updated_at=now() where id=p_id returning * into d;
 end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
 values(actor,'catalog.drawing.save','drawing_definition',d.id,before_data,to_jsonb(d)-'published_data');
 return to_jsonb(d)-'published_data';
end $$;
create or replace function public.fti_catalog_drawing_publish(p_id uuid,p_revision integer,p_visible boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); d catalog.drawing_definitions;
begin
 if p_visible is null then raise exception 'Visibility required' using errcode='22023'; end if;
 select * into d from catalog.drawing_definitions where id=p_id for update;
 if not found then raise exception 'Dimension definition not found' using errcode='P0002'; end if;
 if p_revision is distinct from d.revision then raise exception 'Dimensions changed. Reload before publishing.' using errcode='40001'; end if;
 update catalog.drawing_definitions set
  published_data=case when p_visible then (to_jsonb(d)-'published_data')||jsonb_build_object('published_revision',d.revision+1,'revision',d.revision+1) else null end,
  published_revision=case when p_visible then d.revision+1 else null end,
  revision=d.revision+1,updated_at=now() where id=p_id returning * into d;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,case when p_visible then 'catalog.drawing.publish' else 'catalog.drawing.withdraw' end,'drawing_definition',d.id,jsonb_build_object('revision',d.revision));
 return to_jsonb(d)-'published_data';
end $$;
revoke all on function internal.valid_drawing_dimensions(text,jsonb) from public,anon,authenticated;
revoke all on function public.fti_catalog_drawing_list(),public.fti_catalog_drawing_admin(),public.fti_catalog_drawing_save(uuid,integer,jsonb),public.fti_catalog_drawing_publish(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.fti_catalog_drawing_list() to anon,authenticated;
grant execute on function public.fti_catalog_drawing_admin(),public.fti_catalog_drawing_save(uuid,integer,jsonb),public.fti_catalog_drawing_publish(uuid,integer,boolean) to authenticated;
commit;
