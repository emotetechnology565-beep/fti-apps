-- Private POD, MTC and support documents on the existing encrypted Bunny zone.
begin;
create index if not exists idx_operations_media_entity on platform.media_assets(entity_type,entity_id,created_at,id)
 where entity_type in ('order_pod','order_mtc','support_ticket') and upload_status='verified';

create function internal.operations_media_owner(p_kind text,p_entity uuid,p_write boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); owner_id uuid; order_status text;
begin
 if p_kind in ('order_pod','order_mtc') then
  select buyer_id,status into owner_id,order_status from commerce.orders where id=p_entity;
  if owner_id is null then raise exception 'Order unavailable' using errcode='42501'; end if;
  if p_write then
   perform internal.identity_staff('operations.manage');
   if (p_kind='order_pod' and order_status not in ('shipped','delivered')) or
      (p_kind='order_mtc' and order_status not in ('confirmed','processing','shipped','delivered')) then
    raise exception 'Order status does not permit this document' using errcode='22023'; end if;
  elsif owner_id<>actor then perform internal.identity_staff('operations.manage'); end if;
 elsif p_kind='support_ticket' then
  select buyer_id into owner_id from platform.support_tickets where id=p_entity;
  if owner_id is null then raise exception 'Ticket unavailable' using errcode='42501'; end if;
  if owner_id<>actor then perform internal.identity_staff('support.manage'); end if;
 else raise exception 'Invalid document type' using errcode='22023'; end if;
 return owner_id;
end $$;
revoke all on function internal.operations_media_owner(text,uuid,boolean) from public,anon,authenticated;

create function public.fti_operations_media_prepare(p_kind text,p_entity uuid,p_size_bytes bigint,p_mime text,p_sha256_hex text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); asset uuid:=gen_random_uuid(); extension text; object_key text;
begin
 perform internal.operations_media_owner(p_kind,p_entity,true);
 if p_size_bytes not between 1 and 3145728 or p_mime not in ('application/pdf','image/jpeg','image/png')
  or p_sha256_hex !~ '^[0-9a-f]{64}$' then
  raise exception 'Only PDF, JPEG or PNG files up to 3 MB are allowed' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||p_entity::text,72));
 if (select count(*) from platform.media_assets where entity_type=p_kind and entity_id=p_entity and upload_status in ('pending','verified'))>=10 then
  raise exception 'Document limit reached for this record' using errcode='22023'; end if;
 extension:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
 object_key:='operations-files/'||p_kind||'/'||p_entity::text||'/'||asset::text||'.'||extension;
 insert into platform.media_assets(id,owner_user_id,entity_type,entity_id,object_key,mime_type,size_bytes,visibility,upload_status,sha256_hex)
 values(asset,actor,p_kind,p_entity,object_key,p_mime,p_size_bytes,'private','pending',p_sha256_hex);
 return jsonb_build_object('id',asset,'object_key',object_key);
end $$;
create function public.fti_operations_media_complete(p_id uuid,p_status text,p_storage_zone text) returns void
language plpgsql security definer set search_path='' as $$
declare asset platform.media_assets;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type in ('order_pod','order_mtc','support_ticket') for update;
 if asset.id is null or asset.upload_status<>'pending' or p_status not in ('verified','rejected') or
 (p_status='verified' and (p_storage_zone is null or length(trim(p_storage_zone))<2)) then
  raise exception 'Document cannot be completed' using errcode='22023'; end if;
 update platform.media_assets set upload_status=p_status,storage_zone=case when p_status='verified' then p_storage_zone else null end where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(asset.owner_user_id,'operations.media.'||p_status,'media_asset',p_id,jsonb_build_object('kind',asset.entity_type,'entity_id',asset.entity_id));
end $$;
create function public.fti_operations_media_access(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare asset platform.media_assets;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type in ('order_pod','order_mtc','support_ticket')
  and visibility='private' and upload_status='verified';
 if asset.id is null then raise exception 'Document unavailable' using errcode='P0002'; end if;
 perform internal.operations_media_owner(asset.entity_type,asset.entity_id,false);
 return jsonb_build_object('object_key',asset.object_key,'mime_type',asset.mime_type,'size_bytes',asset.size_bytes,'storage_zone',asset.storage_zone);
end $$;
create function public.fti_operations_media_list(p_kind text,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.operations_media_owner(p_kind,p_entity,false);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]') into result from
 (select id,mime_type,size_bytes,created_at from platform.media_assets where entity_type=p_kind and entity_id=p_entity
  and visibility='private' and upload_status='verified' order by created_at,id limit 10) a;
 return result;
end $$;
revoke all on function public.fti_operations_media_prepare(text,uuid,bigint,text,text),
 public.fti_operations_media_complete(uuid,text,text),public.fti_operations_media_access(uuid),
 public.fti_operations_media_list(text,uuid) from public,anon,authenticated;
grant execute on function public.fti_operations_media_prepare(text,uuid,bigint,text,text),
 public.fti_operations_media_access(uuid),public.fti_operations_media_list(text,uuid) to authenticated;
grant execute on function public.fti_operations_media_complete(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
