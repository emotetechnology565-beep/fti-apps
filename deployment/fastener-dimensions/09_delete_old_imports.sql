-- Supabase SQL Editor: delete ONLY the 17 original imported fastener products.
-- Exact imported IDs AND slugs are required; the new 15 entries are not targeted.
-- Referenced records are skipped. No CASCADE, category deletion or media-file deletion.
begin;
create temporary table old_fastener_delete_result(name text,result text) on commit drop;

do $$
declare item record; product catalog.products; used_photo boolean; snapshot jsonb;
begin
 for item in select * from (values
 ('f39ad479-311e-5e5c-8ae2-89462c76b339'::uuid,'all-type-of-foundation-bolts'),
 ('cee125e9-02dd-57f0-b58c-07d45a5e1b08'::uuid,'csk-screw'),
 ('72245c9c-bc71-526e-af72-54804f833ec5'::uuid,'foundation-bolts'),
 ('7cfac738-4792-58d2-8891-0bf58271c35f'::uuid,'full-thread-hex-screw'),
 ('14fb97c7-4d75-5eb7-88e5-528706b8a31c'::uuid,'full-thread-shcs'),
 ('f7c37f6c-24e1-5cb8-8d8b-a928a611e060'::uuid,'half-thread-hex-bolt'),
 ('03876448-ad18-559a-ad14-5a4479a71b49'::uuid,'half-thread-stud'),
 ('28831dad-1776-593b-b974-16005885d1a6'::uuid,'hdg-full-thread-hex-bolt-nut'),
 ('07fd434a-d7d9-502d-a95f-cce3e54ad924'::uuid,'hdg-pack-washers'),
 ('4c613a8d-0a23-5094-98c6-9d7e5be0fb3b'::uuid,'hsfg-hex-nut'),
 ('548c721f-9912-5eed-b450-c4a18d287e1a'::uuid,'hv-washer'),
 ('68ead84c-3ef7-5265-bcff-b2df96a3d340'::uuid,'plain-washers'),
 ('edf3eac1-108e-5dcc-b333-f43c1703e791'::uuid,'socket-head-cap-screw'),
 ('14629be7-28ec-582e-b7e7-1bdaadd5e260'::uuid,'spring-washers'),
 ('b913c869-e195-5776-ad5f-c464733d39b8'::uuid,'ss-hex-screw'),
 ('e95b150c-b2ce-56b4-8836-ce8a333a5074'::uuid,'stud'),
 ('8d210202-3442-5317-a388-cbb6e57ebdeb'::uuid,'thread-rods')
 ) as targets(id,slug) loop
  select * into product from catalog.products where id=item.id and slug=item.slug and product_kind='fastener' for update;
  if not found then
   insert into old_fastener_delete_result values(item.slug,'Not found / already removed');
   continue;
  end if;
  used_photo:=false;
  if to_regclass('catalog.fastener_photo_cards') is not null then
   execute 'select exists(select 1 from catalog.fastener_photo_cards c join platform.media_assets m on m.id=c.asset_id where m.entity_type=''product'' and m.entity_id=$1)'
    into used_photo using product.id;
  end if;
  if used_photo then
   insert into old_fastener_delete_result values(product.name,'Skipped: photo assigned to a subcategory');
   continue;
  end if;
  begin
   snapshot:=jsonb_build_object('product',to_jsonb(product),'variants',(
    select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('attributes',(
     select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from catalog.variant_attributes a where a.variant_id=v.id
    ))),'[]'::jsonb) from catalog.product_variants v where v.product_id=product.id));
   delete from catalog.product_variants where product_id=product.id;
   delete from catalog.products where id=product.id;
   insert into platform.audit_logs(actor_id,action,resource_type,resource_id,before_data)
    values(auth.uid(),'catalog.old_import.delete','product',product.id,snapshot);
   insert into old_fastener_delete_result values(product.name,'Deleted');
  exception when foreign_key_violation then
   -- This block rolls back both deletes if any product/variant is in use.
   insert into old_fastener_delete_result values(product.name,'Skipped: linked history or dependent records');
  end;
 end loop;
end $$;

select name,result from old_fastener_delete_result order by result,name;
commit;
