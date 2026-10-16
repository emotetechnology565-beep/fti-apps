-- RFQ attachments: metadata only. File bytes belong in a separate private Bunny Storage Zone.
begin;

create or replace function public.fti_sales_media_prepare(p_rfq uuid,p_size_bytes bigint,p_mime text,p_sha256_hex text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); r sales.rfqs; asset uuid := gen_random_uuid(); extension text;
begin
 select * into r from sales.rfqs where id=p_rfq for update;
 if not found then raise exception using errcode='P0002',message='Request not found.'; end if;
 if r.buyer_id<>actor then
   perform internal.identity_staff('sales.manage');
   if r.assigned_to is distinct from actor and not internal.identity_permission('business.review') then
     raise exception using errcode='42501',message='Request access denied.'; end if;
 end if;
 if r.status not in ('submitted','reviewing','quoted') or p_size_bytes not between 1 and 3145728
   or p_mime not in ('application/pdf','image/jpeg','image/png') or p_sha256_hex !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='Only PDF, JPEG or PNG files up to 3 MB can be attached to an open request.'; end if;
 if (select count(*) from platform.media_assets where entity_type='rfq' and entity_id=p_rfq
   and upload_status in ('pending','verified'))>=10 then
   raise exception using errcode='22023',message='This request already has ten attachments.'; end if;
 extension:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
 insert into platform.media_assets(id,owner_user_id,entity_type,entity_id,object_key,mime_type,size_bytes,
   visibility,upload_status,sha256_hex)
 values(asset,actor,'rfq',p_rfq,'rfq-files/'||p_rfq::text||'/'||asset::text||'.'||extension,p_mime,p_size_bytes,
   'private','pending',p_sha256_hex);
 return jsonb_build_object('id',asset,'object_key','rfq-files/'||p_rfq::text||'/'||asset::text||'.'||extension);
end $$;

create or replace function public.fti_sales_media_complete(p_id uuid,p_status text,p_storage_zone text)
returns void language plpgsql security definer set search_path='' as $$
declare asset platform.media_assets;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type='rfq' for update;
 if not found or asset.upload_status<>'pending' or p_status not in ('verified','rejected')
   or (p_status='verified' and (p_storage_zone is null or length(btrim(p_storage_zone))<2)) then
   raise exception using errcode='22023',message='Attachment cannot be completed.'; end if;
 update platform.media_assets set upload_status=p_status,
   storage_zone=case when p_status='verified' then p_storage_zone else null end where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(asset.owner_user_id,'sales.media.'||p_status,'media_asset',p_id,
   jsonb_build_object('rfq_id',asset.entity_id,'size_bytes',asset.size_bytes));
end $$;

create or replace function public.fti_sales_media_access(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); asset platform.media_assets; r sales.rfqs;
begin
 select * into asset from platform.media_assets where id=p_id and entity_type='rfq'
   and visibility='private' and upload_status='verified';
 if not found then raise exception using errcode='P0002',message='Attachment not found.'; end if;
 select * into r from sales.rfqs where id=asset.entity_id;
 if r.buyer_id<>actor then
   perform internal.identity_staff('sales.manage');
   if r.assigned_to is distinct from actor and not internal.identity_permission('business.review') then
     raise exception using errcode='42501',message='Attachment access denied.'; end if;
 end if;
 return jsonb_build_object('object_key',asset.object_key,'mime_type',asset.mime_type,
   'size_bytes',asset.size_bytes,'storage_zone',asset.storage_zone);
end $$;

revoke all on function public.fti_sales_media_prepare(uuid,bigint,text,text),
 public.fti_sales_media_complete(uuid,text,text),public.fti_sales_media_access(uuid) from public,anon,authenticated;
grant execute on function public.fti_sales_media_prepare(uuid,bigint,text,text),
 public.fti_sales_media_access(uuid) to authenticated;
grant execute on function public.fti_sales_media_complete(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
