-- Tractor cart orders await admin pricing/charges before stock reservation/payment.
begin;

alter table commerce.orders drop constraint orders_status_check;
alter table commerce.orders add constraint orders_status_check check(status in (
 'pending_confirmation','pending_payment','confirmed','processing','partially_shipped',
 'shipped','delivered','cancelled','refunded'));

create or replace function public.fti_commerce_cart_order(p_request_id uuid,p_address uuid,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_actor(); address identity.addresses; fingerprint text;
 previous commerce.orders; result uuid := gen_random_uuid(); line jsonb; variant record;
 quantity numeric; price numeric; base numeric; sale numeric; total numeric := 0;
begin
 if p_request_id is null or p_address is null or jsonb_typeof(p_lines) is distinct from 'array' then
   raise exception using errcode='22023',message='Address, request ID and cart lines are required.'; end if;
 if jsonb_array_length(p_lines) not between 1 and 50 then
   raise exception using errcode='22023',message='Submit between 1 and 50 cart items.'; end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x where
   jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'variant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(x->>'qty','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$') then
   raise exception using errcode='22023',message='Each cart item needs a valid variant and positive quantity.'; end if;
 if (select count(distinct lower(x->>'variant_id')) from jsonb_array_elements(p_lines) x) <> jsonb_array_length(p_lines) then
   raise exception using errcode='22023',message='Combine duplicate cart variants.'; end if;
 fingerprint:=md5(jsonb_build_object('address',p_address,'lines',(
   select jsonb_agg(jsonb_build_object('variant_id',(x->>'variant_id')::uuid,'qty',(x->>'qty')::numeric)
     order by (x->>'variant_id')::uuid) from jsonb_array_elements(p_lines) x))::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select * into previous from commerce.orders where buyer_id=actor and client_request_id=p_request_id;
 if found then
   if previous.request_hash is distinct from fingerprint then
     raise exception using errcode='23505',message='Request ID was already used with different details.'; end if;
   return jsonb_build_object('id',previous.id,'replayed',true); end if;
 select * into address from identity.addresses where id=p_address and user_id=actor and business_id is null;
 if not found then raise exception using errcode='42501',message='Choose your personal delivery address.'; end if;
 insert into commerce.orders(id,order_no,buyer_id,delivery_address_snapshot,status,subtotal,grand_total,amount_due,client_request_id,request_hash)
 values(result,'FTI-O-'||upper(substr(replace(result::text,'-',''),1,12)),actor,
   jsonb_build_object('line1',address.line1,'line2',address.line2,'city',address.city,'state',address.state,'pincode',address.pincode),
   'pending_confirmation',0,0,0,p_request_id,fingerprint);
 for line in select value from jsonb_array_elements(p_lines) order by value->>'variant_id' loop
   select v.id,v.sku,v.uom,v.min_order_qty,
     (select value_json #>> '{}' from catalog.variant_attributes where variant_id=v.id and attribute_key='base_price') as base,
     (select value_json #>> '{}' from catalog.variant_attributes where variant_id=v.id and attribute_key='discounted_price') as sale
   into variant from catalog.product_variants v join catalog.products p on p.id=v.product_id
   join catalog.categories c on c.id=p.category_id
   where v.id=(line->>'variant_id')::uuid and v.is_active and p.status='published'
     and p.product_kind='tractor_part' and c.is_active for share of v,p,c;
   if not found then raise exception using errcode='22023',message='A tractor part is no longer available.'; end if;
   quantity:=(line->>'qty')::numeric;
   if quantity<variant.min_order_qty or quantity<=0 then
     raise exception using errcode='22023',message='A cart quantity is below the minimum order.'; end if;
   base:=null; sale:=null;
   if variant.base ~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then base:=nullif(variant.base::numeric,0); end if;
   if variant.sale ~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then sale:=nullif(variant.sale::numeric,0); end if;
   price:=coalesce(case when sale>0 and sale<base then sale else base end,0);
   insert into commerce.order_items(order_id,variant_id,sku_snapshot,qty,uom,unit_price,line_total)
   values(result,variant.id,variant.sku,quantity,variant.uom,price,round(price*quantity,2));
   total:=total+round(price*quantity,2);
 end loop;
 update commerce.orders set subtotal=total,grand_total=total where id=result;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id)
 values(actor,'commerce.cart.submit','order',result);
 return jsonb_build_object('id',result,'replayed',false);
end $$;

create or replace function public.fti_commerce_cart_queue()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage');
begin
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
   select o.id,o.order_no,o.created_at,o.subtotal::text,o.delivery_address_snapshot,
     (select jsonb_agg(jsonb_build_object('id',i.id,'sku',i.sku_snapshot,'qty',i.qty::text,
       'uom',i.uom,'unit_price',i.unit_price::text,'name',p.name) order by i.variant_id)
       from commerce.order_items i join catalog.product_variants v on v.id=i.variant_id
       join catalog.products p on p.id=v.product_id where i.order_id=o.id) as items
   from commerce.orders o where o.status='pending_confirmation' and o.quotation_revision_id is null
   order by o.created_at,o.id limit 100
 ) q),'[]'::jsonb);
end $$;

create or replace function public.fti_commerce_cart_confirm(p_order uuid,p_items jsonb,p_gst numeric,p_delivery numeric)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := internal.identity_staff('order.manage'); o commerce.orders; line record;
 stock commerce.inventory; total numeric := 0; hours integer; expires timestamptz; price numeric;
begin
 if p_gst is null or p_delivery is null or p_gst::text !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$'
   or p_delivery::text !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or jsonb_typeof(p_items) is distinct from 'array' then
   raise exception using errcode='22023',message='Enter non-negative GST and delivery amounts with up to two decimal places.'; end if;
 select * into o from commerce.orders where id=p_order for update;
 if not found or o.status<>'pending_confirmation' or o.quotation_revision_id is not null then
   raise exception using errcode='22023',message='Order is no longer awaiting admin confirmation.'; end if;
 if jsonb_array_length(p_items) <> (select count(*) from commerce.order_items where order_id=o.id)
   or (select count(distinct lower(x->>'id')) from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items)
   or exists(select 1 from jsonb_array_elements(p_items) x where
     coalesce(x->>'unit_price','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$'
     or coalesce(x->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
   raise exception using errcode='22023',message='Confirm every order item with a positive unit price.'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where not exists(
   select 1 from commerce.order_items i where i.id=(x->>'id')::uuid and i.order_id=o.id)) then
   raise exception using errcode='22023',message='Order items do not match.'; end if;
 select reservation_hours into hours from commerce.order_policy where id=true;
 if hours is null then raise exception using errcode='22023',message='Order reservation policy has not been approved.'; end if;
 expires:=now()+make_interval(hours=>hours);
 for line in select i.*,x->>'unit_price' as proposed_price from commerce.order_items i
   join jsonb_array_elements(p_items) x on (x->>'id')::uuid=i.id where i.order_id=o.id order by i.variant_id loop
   price:=line.proposed_price::numeric;
   if price<=0 then raise exception using errcode='22023',message='Every item needs a positive unit price.'; end if;
   select i.* into stock from commerce.inventory i join commerce.stock_locations l on l.id=i.stock_location_id
   where i.variant_id=line.variant_id and l.is_active and i.on_hand-i.reserved>=line.qty
   order by i.stock_location_id limit 1 for update of i;
   if not found then raise exception using errcode='22023',message='Tracked stock is unavailable for an order item.'; end if;
   update commerce.order_items set unit_price=price,line_total=round(price*qty,2) where id=line.id;
   total:=total+round(price*line.qty,2);
   update commerce.inventory set reserved=reserved+line.qty,updated_at=now()
   where variant_id=stock.variant_id and stock_location_id=stock.stock_location_id;
   insert into commerce.stock_reservations(order_item_id,variant_id,stock_location_id,qty,expires_at)
   values(line.id,line.variant_id,stock.stock_location_id,line.qty,expires);
 end loop;
 update commerce.orders set status='pending_payment',subtotal=total,gst_total=p_gst,freight_total=p_delivery,
   grand_total=total+p_gst+p_delivery,amount_due=total+p_gst+p_delivery,updated_at=now() where id=o.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(actor,'commerce.cart.confirm','order',o.id,jsonb_build_object('gst',p_gst,'delivery',p_delivery,'items',p_items));
 insert into platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
 values('commerce.order.created','order',o.id,jsonb_build_object('order_id',o.id));
end $$;

revoke all on function public.fti_commerce_cart_order(uuid,uuid,jsonb),public.fti_commerce_cart_queue(),
 public.fti_commerce_cart_confirm(uuid,jsonb,numeric,numeric) from public,anon,authenticated;
grant execute on function public.fti_commerce_cart_order(uuid,uuid,jsonb),public.fti_commerce_cart_queue(),
 public.fti_commerce_cart_confirm(uuid,jsonb,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
