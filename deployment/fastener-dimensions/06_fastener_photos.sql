begin;
create table if not exists catalog.fastener_photo_cards (
 slug text primary key,
 label text not null,
 asset_id uuid references platform.media_assets(id),
 published boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 check(not published or asset_id is not null)
);
alter table catalog.fastener_photo_cards enable row level security;
revoke all on catalog.fastener_photo_cards from public,anon,authenticated;
insert into catalog.fastener_photo_cards(slug,label) values
 ('hex-bolt','Hex bolt'),('heavy-hex-bolt','Heavy Hex bolt'),('hex-nut','Hex nut'),('heavy-hex-nut','Heavy Hex nut'),
 ('u-bolt','U bolt'),('j-type-bolt','J type bolt'),('j-hook','J hook'),('square-j-bolt','Sq type J bolt'),
 ('plain-washer','Plain washer'),('machined-washer','Machined washer'),('spring-washer','Spring washer'),
 ('square-washer','Square washer'),('dti-washer','DTI washer'),('square-nut','Square nut'),('square-plate','Sq.plate'),
 ('l-bolt','L type bolt'),('coach-screw','Coach screw') on conflict(slug) do nothing;

create or replace function public.fti_catalog_fastener_photos() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label,'image_url',m.cdn_url) order by c.label),'[]'::jsonb)
 from catalog.fastener_photo_cards c join platform.media_assets m on m.id=c.asset_id
 where c.published and m.entity_type='product' and m.visibility='public' and m.upload_status='verified'
 and m.cdn_url like 'https://%';
$$;
create or replace function public.fti_catalog_fastener_photo_admin() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform internal.identity_staff('catalog.manage');
 return jsonb_build_object(
 'cards',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('image_url',m.cdn_url) order by c.label),'[]'::jsonb)
  from catalog.fastener_photo_cards c left join platform.media_assets m on m.id=c.asset_id),
 'photos',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'product_name',p.name,'image_url',m.cdn_url) order by p.name,m.id),'[]'::jsonb)
  from platform.media_assets m join catalog.products p on p.id=m.entity_id
  where m.entity_type='product' and p.product_kind='fastener' and m.visibility='public'
  and m.upload_status='verified' and m.cdn_url like 'https://%'));
end $$;
create or replace function public.fti_catalog_fastener_photo_save(p_slug text,p_revision integer,p_asset_id uuid,p_published boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('catalog.manage'); card catalog.fastener_photo_cards; old_data jsonb;
begin
 select * into card from catalog.fastener_photo_cards where slug=p_slug for update;
 if not found then raise exception 'Unknown fastener subcategory' using errcode='22023'; end if;
 if p_revision is distinct from card.revision then raise exception 'Photo selection changed. Reload before saving.' using errcode='40001'; end if;
 if p_published is null or (p_published and p_asset_id is null) then raise exception 'Choose a photo before publishing' using errcode='22023'; end if;
 if p_asset_id is not null and not exists(select 1 from platform.media_assets m join catalog.products p on p.id=m.entity_id
  where m.id=p_asset_id and m.entity_type='product' and m.visibility='public' and m.upload_status='verified'
   and m.cdn_url like 'https://%' and p.product_kind='fastener') then
  raise exception 'Choose a verified fastener product photo' using errcode='22023'; end if;
 old_data:=to_jsonb(card);
 update catalog.fastener_photo_cards set asset_id=p_asset_id,published=p_published,revision=revision+1,updated_at=now()
  where slug=p_slug returning * into card;
 insert into platform.audit_logs(actor_id,action,resource_type,before_data,after_data)
 values(actor,'catalog.fastener.photo.save','fastener_photo_card',old_data,to_jsonb(card));
 return to_jsonb(card);
end $$;
revoke all on function public.fti_catalog_fastener_photos(),public.fti_catalog_fastener_photo_admin(),public.fti_catalog_fastener_photo_save(text,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.fti_catalog_fastener_photos() to anon,authenticated;
grant execute on function public.fti_catalog_fastener_photo_admin(),public.fti_catalog_fastener_photo_save(text,integer,uuid,boolean) to authenticated;
commit;
