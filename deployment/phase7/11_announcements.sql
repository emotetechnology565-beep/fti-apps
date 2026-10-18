-- Staff-authored operational announcements; no demo content or automated campaigns.
begin;
insert into identity.role_permissions(role_code,permission) values ('super_admin','content.manage') on conflict do nothing;
create table platform.announcements (
 id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 5 and 120),
 body text not null check(length(body) between 10 and 2000),status text not null default 'draft'
 check(status in ('draft','published','archived')),author_id uuid not null references identity.profiles(id),
 created_at timestamptz not null default now(),published_at timestamptz,archived_at timestamptz
);
create index idx_announcements_public on platform.announcements(published_at desc,id) where status='published';
alter table platform.announcements enable row level security;
revoke all on platform.announcements from public,anon,authenticated;
create function public.fti_operations_announcements() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_actor();
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into result from
 (select id,title,body,published_at from platform.announcements where status='published'
  order by published_at desc,id limit 10) a;
 return result;
end $$;
create function public.fti_operations_content_queue(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.identity_staff('content.manage');
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into result from
 (select id,title,body,status,created_at,published_at from platform.announcements
  order by created_at desc,id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) a;
 return result;
end $$;
create function public.fti_operations_content_save(p_title text,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('content.manage'); result uuid;
begin
 if p_title is null or length(trim(p_title)) not between 5 and 120 or p_body is null or length(trim(p_body)) not between 10 and 2000 then
  raise exception 'Enter a title (5-120) and body (10-2000 characters)' using errcode='22023'; end if;
 insert into platform.announcements(title,body,author_id) values(trim(p_title),trim(p_body),actor) returning id into result;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'content.drafted','announcement',result);
 return result;
end $$;
create function public.fti_operations_content_publish(p_id uuid,p_publish boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('content.manage'); announcement platform.announcements;
begin
 select * into announcement from platform.announcements where id=p_id for update;
 if announcement.id is null or (p_publish and announcement.status<>'draft') or (not p_publish and announcement.status<>'published') or p_publish is null then
  raise exception 'Announcement cannot change state' using errcode='22023'; end if;
 update platform.announcements set status=case when p_publish then 'published' else 'archived' end,
  published_at=case when p_publish then now() else published_at end,
  archived_at=case when p_publish then null else now() end where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,case when p_publish then 'content.published' else 'content.archived' end,'announcement',p_id);
end $$;
revoke all on function public.fti_operations_announcements(),public.fti_operations_content_queue(integer),
 public.fti_operations_content_save(text,text),public.fti_operations_content_publish(uuid,boolean) from public,anon,authenticated;
grant execute on function public.fti_operations_announcements(),public.fti_operations_content_queue(integer),
 public.fti_operations_content_save(text,text),public.fti_operations_content_publish(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
