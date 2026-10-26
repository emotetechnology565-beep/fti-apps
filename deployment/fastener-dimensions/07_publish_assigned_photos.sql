-- Publish only subcategories with a photo explicitly assigned by staff.
-- No product publication, stock, SKU, or dimensions are created here.
begin;
with published as (
 update catalog.fastener_photo_cards c set published=true,revision=c.revision+1,updated_at=now()
 where not c.published and exists (
  select 1 from platform.media_assets m join catalog.products p on p.id=m.entity_id
  where m.id=c.asset_id and m.entity_type='product' and m.visibility='public'
   and m.upload_status='verified' and m.cdn_url like 'https://%' and p.product_kind='fastener'
 ) returning c.slug,c.label,c.asset_id,c.revision
), logged as (
 insert into platform.audit_logs(actor_id,action,resource_type,after_data)
 select auth.uid(),'catalog.fastener.photo.publish.sql_editor','fastener_photo_card',to_jsonb(published)
 from published returning after_data
)
select after_data->>'label' as published_photo_card from logged;
commit;
