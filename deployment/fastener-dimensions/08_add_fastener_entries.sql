-- Add the client-requested names to the existing Fasteners admin product list.
-- These remain drafts for photo setup; no size, SKU, price or stock is invented.
begin;

insert into catalog.categories(slug,name,is_active)
values('fasteners','Industrial Fasteners',true)
on conflict(slug) do nothing;

with requested(slug,name) as (
 values
 ('hex-bolt','Hex bolt'),
 ('heavy-hex-bolt','Heavy Hex bolt'),
 ('hex-nut','Hex nut'),
 ('heavy-hex-nut','Heavy Hex nut'),
 ('u-bolt','U bolt'),
 ('j-type-bolt','J type bolt'),
 ('j-hook','J hook'),
 ('square-j-bolt','Sq type J bolt'),
 ('plain-washer','Plain washer'),
 ('machined-washer','Machined washer'),
 ('spring-washer','Spring washer'),
 ('square-washer','Square washer'),
 ('dti-washer','DTI washer'),
 ('square-nut','Square nut'),
 ('square-plate','Sq.plate'),
 ('l-bolt','L type bolt'),
 ('coach-screw','Coach screw')
), added as (
 insert into catalog.products(category_id,slug,name,product_kind,purchase_mode,status)
 select c.id,r.slug,r.name,'fastener','rfq','draft'
 from requested r join catalog.categories c on c.slug='fasteners'
 on conflict(slug) do nothing
 returning id,slug,name
)
insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
select auth.uid(),'catalog.fastener.setup','product',id,
 jsonb_build_object('name',name,'slug',slug,'status','draft') from added;

select p.name,p.slug,p.status,
 (select count(*) from catalog.product_variants v where v.product_id=p.id and v.is_active) as active_variants
from catalog.products p
where p.product_kind='fastener' and p.slug in (
 'hex-bolt','heavy-hex-bolt','hex-nut','heavy-hex-nut','u-bolt','j-type-bolt','j-hook','square-j-bolt',
 'plain-washer','machined-washer','spring-washer','square-washer','dti-washer','square-nut','square-plate',
 'l-bolt','coach-screw')
order by p.name;

commit;
