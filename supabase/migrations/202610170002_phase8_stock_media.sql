-- All stock uploads are encrypted in the existing Bunny zone, including photos.
begin;
create index idx_stock_media on platform.media_assets(entity_id,created_at,id)
 where entity_type in ('stock_photo','stock_certificate') and upload_status in ('pending','verified');
create function internal.stock_media_allowed(p_listing uuid,p_kind text,p_write boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); item marketplace.listings;
begin
 if p_kind is null or p_kind not in ('stock_photo','stock_certificate') then raise exception 'Invalid stock attachment type' using errcode='22023'; end if;
 select * into item from marketplace.listings where id=p_listing;
 if item.id is null then raise exception 'Attachment unavailable' using errcode='42501'; end if;
 if p_write then
  if item.seller_id<>actor then raise exception 'Permission denied' using errcode='42501'; end if;
  perform internal.stock_seller(item.business_id);
  if item.status not in ('draft','rejected','withdrawn') then raise exception 'Edit the listing as a draft before changing attachments' using errcode='22023'; end if;
 elsif item.seller_id<>actor then
  if p_kind='stock_photo' and internal.stock_visible(item.id) then return; end if;
  if exists(select 1 from marketplace.enquiries where listing_id=item.id and buyer_id=actor) then return; end if;
  perform internal.identity_staff('stock.review');
 end if;
end $$;
create function public.fti_stock_media_prepare(p_kind text,p_entity uuid,p_size_bytes bigint,p_mime text,p_sha256_hex text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); asset uuid:=gen_random_uuid(); extension text; object_key text;
begin
 perform 1 from marketplace.listings where id=p_entity for update;
 perform internal.stock_media_allowed(p_entity,p_kind,true);
 if p_size_bytes is null or p_size_bytes not between 1 and 3145728 or p_mime is null or
  p_mime not in ('application/pdf','image/jpeg','image/png') or p_kind='stock_photo' and p_mime='application/pdf' or
  p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-f]{64}$' then raise exception 'Choose a photo (JPEG/PNG) or certificate (PDF/JPEG/PNG), up to 3 MB' using errcode='22023'; end if;
 if (select count(*) from platform.media_assets where entity_id=p_entity and entity_type in ('stock_photo','stock_certificate') and upload_status in ('pending','verified'))>=10 then
  raise exception 'A listing supports at most 10 attachments' using errcode='22023'; end if;
 extension:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
 object_key:='business-stock-files/'||p_kind||'/'||p_entity::text||'/'||asset::text||'.'||extension;
 insert into platform.media_assets(id,owner_user_id,entity_type,entity_id,object_key,mime_type,size_bytes,visibility,upload_status,sha256_hex)
 values(asset,actor,p_kind,p_entity,object_key,p_mime,p_size_bytes,'private','pending',p_sha256_hex);
 return jsonb_build_object('id',asset,'object_key',object_key);
end $$;
create function public.fti_stock_media_complete(p_id uuid,p_status text,p_storage_zone text) returns void
language plpgsql security definer set search_path='' as $$
declare asset platform.media_assets; item marketplace.listings;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type in ('stock_photo','stock_certificate');
 select * into item from marketplace.listings where id=asset.entity_id for update;
 select * into asset from platform.media_assets where id=p_id for update;
 if asset.id is null or item.id is null or asset.upload_status<>'pending' or p_status is null or p_status not in ('verified','rejected') or
  p_status='verified' and (p_storage_zone is null or length(trim(p_storage_zone))<2 or item.status not in ('draft','rejected','withdrawn')) then
  raise exception 'Attachment cannot be completed' using errcode='22023'; end if;
 update platform.media_assets set upload_status=p_status,storage_zone=case when p_status='verified' then p_storage_zone else null end where id=p_id;
 if p_status='verified' then update marketplace.listings set version=version+1,updated_at=now() where id=item.id; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(asset.owner_user_id,'stock.media.'||p_status,'media_asset',p_id);
end $$;
create function public.fti_stock_media_access(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare asset platform.media_assets;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type in ('stock_photo','stock_certificate') and visibility='private' and upload_status='verified';
 if asset.id is null then raise exception 'Attachment unavailable' using errcode='P0002'; end if;
 perform internal.stock_media_allowed(asset.entity_id,asset.entity_type,false);
 return jsonb_build_object('object_key',asset.object_key,'mime_type',asset.mime_type,'size_bytes',asset.size_bytes,'storage_zone',asset.storage_zone);
end $$;
create function public.fti_stock_media_list(p_kind text,p_entity uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.stock_media_allowed(p_entity,p_kind,false);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]') into result from
 (select id,mime_type,size_bytes,created_at from platform.media_assets where entity_id=p_entity and entity_type=p_kind and visibility='private' and upload_status='verified' order by created_at,id limit 10) a;
 return result;
end $$;
create function public.fti_stock_media_remove(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare asset platform.media_assets; item marketplace.listings;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type in ('stock_photo','stock_certificate');
 select * into item from marketplace.listings where id=asset.entity_id for update;
 perform internal.stock_media_allowed(item.id,asset.entity_type,true);
 if item.version is distinct from p_version then raise exception 'Listing changed; refresh before removing attachments' using errcode='40001'; end if;
 if asset.upload_status<>'verified' then raise exception 'Attachment unavailable' using errcode='22023'; end if;
 update platform.media_assets set upload_status='rejected' where id=p_id;
 update marketplace.listings set version=version+1,updated_at=now() where id=item.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(auth.uid(),'stock.media.removed','media_asset',p_id);
end $$;
revoke all on function internal.stock_media_allowed(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.fti_stock_media_prepare(text,uuid,bigint,text,text),public.fti_stock_media_complete(uuid,text,text),public.fti_stock_media_access(uuid),public.fti_stock_media_list(text,uuid),public.fti_stock_media_remove(uuid,integer) from public,anon,authenticated;
grant execute on function public.fti_stock_media_prepare(text,uuid,bigint,text,text),public.fti_stock_media_access(uuid),public.fti_stock_media_list(text,uuid),public.fti_stock_media_remove(uuid,integer) to authenticated;
grant execute on function public.fti_stock_media_complete(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
