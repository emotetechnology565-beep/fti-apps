-- Phase 3 media completion: product photos only. No sample assets inserted.
begin;

alter table platform.media_assets add column if not exists cdn_url text;
alter table platform.media_assets add column if not exists storage_zone text;
alter table platform.media_assets add column if not exists sha256_hex text;
create index if not exists idx_media_product_visible on platform.media_assets(entity_id,created_at,id)
 where entity_type='product' and visibility='public' and upload_status='verified';

create or replace function public.fti_catalog_media_public(p_product_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_product_ids is null or cardinality(p_product_ids)>50 then
   raise exception using errcode='22023',message='Supply at most 50 product IDs.';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'product_id',a.entity_id,'url',a.cdn_url,'mime_type',a.mime_type
 ) order by a.created_at,a.id)
 from platform.media_assets a
 join catalog.products p on p.id=a.entity_id and p.status='published'
 join catalog.categories c on c.id=p.category_id and c.is_active
 where a.entity_type='product' and a.visibility='public' and a.upload_status='verified'
   and a.cdn_url is not null and a.entity_id=any(p_product_ids)),'[]'::jsonb);
end $$;

create or replace function public.fti_catalog_media_admin(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.identity_staff('catalog.manage');
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'product_id',a.entity_id,'url',a.cdn_url,'mime_type',a.mime_type
 ) order by a.created_at,a.id)
 from platform.media_assets a where a.entity_type='product' and a.entity_id=p_product_id
   and a.visibility='public' and a.upload_status='verified' and a.cdn_url is not null),'[]'::jsonb);
end $$;

create or replace function public.fti_catalog_media_prepare(
 p_product_id uuid,p_size_bytes bigint,p_sha256_hex text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; asset_id uuid := gen_random_uuid(); object_path text;
begin
 actor:=internal.identity_staff('catalog.manage');
 if p_size_bytes not between 1 and 3145728 or p_sha256_hex !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='Only JPEG images up to 3 MB are supported.';
 end if;
 perform 1 from catalog.products where id=p_product_id for update;
 if not found then raise exception using errcode='P0002',message='Product not found.'; end if;
 if (select count(*) from platform.media_assets a where a.entity_type='product'
   and a.entity_id=p_product_id and a.upload_status in ('pending','verified'))>=8 then
   raise exception using errcode='22023',message='This product already has eight images.';
 end if;
 object_path:='product-images/'||p_product_id::text||'/'||asset_id::text||'.jpg';
 insert into platform.media_assets(id,owner_user_id,entity_type,entity_id,object_key,mime_type,
   size_bytes,visibility,upload_status,sha256_hex)
 values(asset_id,actor,'product',p_product_id,object_path,'image/jpeg',p_size_bytes,'public','pending',p_sha256_hex);
 return jsonb_build_object('id',asset_id,'object_key',object_path);
end $$;

create or replace function public.fti_catalog_media_complete(
 p_id uuid,p_status text,p_cdn_url text,p_storage_zone text
) returns void language plpgsql security definer set search_path='' as $$
declare row_data platform.media_assets;
begin
 if p_status not in ('verified','rejected') then
   raise exception using errcode='22023',message='Invalid media completion status.';
 end if;
 select * into row_data from platform.media_assets where id=p_id and entity_type='product' for update;
 if not found or row_data.upload_status<>'pending' then
   raise exception using errcode='22023',message='Media upload is no longer pending.';
 end if;
 if p_status='verified' and (
   p_cdn_url !~ '^https://[^/?#]+/product-images/[0-9a-f-]+/[0-9a-f-]+\.jpg$'
   or row_data.object_key <> substring(p_cdn_url from '/(product-images/.*)$')
   or trim(coalesce(p_storage_zone,''))=''
 ) then raise exception using errcode='22023',message='Invalid image URL.'; end if;
 update platform.media_assets set upload_status=p_status,
   cdn_url=case when p_status='verified' then p_cdn_url else null end,
   storage_zone=case when p_status='verified' then p_storage_zone else null end where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(row_data.owner_user_id,'catalog.media.'||p_status,'media_asset',p_id,
   jsonb_build_object('product_id',row_data.entity_id,'size_bytes',row_data.size_bytes));
end $$;

create or replace function public.fti_catalog_media_remove(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid; row_data platform.media_assets;
begin
 actor:=internal.identity_staff('catalog.manage');
 select * into row_data from platform.media_assets where id=p_id and entity_type='product' for update;
 if not found or row_data.upload_status<>'verified' then
   raise exception using errcode='P0002',message='Product image not found.';
 end if;
 update platform.media_assets set upload_status='rejected' where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'catalog.media.remove','media_asset',p_id,jsonb_build_object('product_id',row_data.entity_id));
 return row_data.object_key;
end $$;

revoke all on function public.fti_catalog_media_public(uuid[]),public.fti_catalog_media_admin(uuid),
 public.fti_catalog_media_prepare(uuid,bigint,text),public.fti_catalog_media_complete(uuid,text,text,text),
 public.fti_catalog_media_remove(uuid) from public,anon,authenticated;
grant execute on function public.fti_catalog_media_public(uuid[]) to anon,authenticated;
grant execute on function public.fti_catalog_media_admin(uuid),
 public.fti_catalog_media_prepare(uuid,bigint,text),public.fti_catalog_media_remove(uuid) to authenticated;
grant execute on function public.fti_catalog_media_complete(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
