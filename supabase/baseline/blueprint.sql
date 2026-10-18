-- FTI initial production schema blueprint, PostgreSQL 15+ / Supabase
-- Review and apply in staging before production. Requires pgcrypto and pgmq configured.
create extension if not exists pgcrypto;
create schema if not exists identity;
create schema if not exists catalog;
create schema if not exists pricing;
create schema if not exists sales;
create schema if not exists commerce;
create schema if not exists platform;

create table identity.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', phone text, email text,
 account_status text not null default 'active' check(account_status in ('active','blocked','pending')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table identity.businesses (
 id uuid primary key default gen_random_uuid(), legal_name text not null,
 gstin text, verification_status text not null default 'pending'
 check (verification_status in ('pending','verified','rejected')),
 price_tier_id uuid, created_at timestamptz not null default now()
);
create unique index uq_verified_gstin on identity.businesses(upper(gstin)) where gstin is not null;
create table identity.business_members (
 business_id uuid not null references identity.businesses(id),
 user_id uuid not null references identity.profiles(id),
 membership_role text not null default 'member' check(membership_role in ('owner','buyer','member')),
 status text not null default 'active' check(status in ('active','invited','revoked')),
 primary key(business_id,user_id)
);
create table identity.addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid references identity.profiles(id),
 business_id uuid references identity.businesses(id), label text,
 line1 text not null, line2 text, city text not null, state text not null,
 pincode text not null, country_code char(2) not null default 'IN',
 created_at timestamptz not null default now(),
 check (user_id is not null or business_id is not null)
);
create table identity.roles (code text primary key);
insert into identity.roles(code) values
 ('super_admin'),('price_manager'),('sales_executive'),('order_manager'),('accounts'),('buyer'),('dealer')
on conflict do nothing;
create table identity.user_roles (
 user_id uuid not null references identity.profiles(id),
 role_code text not null references identity.roles(code),
 primary key(user_id,role_code)
);
create table identity.role_permissions (
 role_code text not null references identity.roles(code), permission text not null,
 primary key(role_code,permission)
);

create table catalog.categories (
 id uuid primary key default gen_random_uuid(), parent_id uuid references catalog.categories(id),
 slug text not null unique, name text not null, sort_order int not null default 0,
 is_active boolean not null default true
);
create table catalog.materials (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null, description text, is_active boolean not null default true
);
create table catalog.grades (
 id uuid primary key default gen_random_uuid(), material_id uuid references catalog.materials(id),
 code text not null, specification text, is_active boolean not null default true,
 unique(material_id,code)
);
create table catalog.brands (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 is_active boolean not null default true
);
create table catalog.products (
 id uuid primary key default gen_random_uuid(), category_id uuid not null references catalog.categories(id),
 slug text not null unique, name text not null, description text, product_kind text not null default 'steel'
 check(product_kind in ('steel','fastener','tractor_part','other')),
 purchase_mode text not null default 'rfq' check(purchase_mode in ('rfq','direct','both')),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table catalog.product_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references catalog.products(id),
 sku text not null unique, material_id uuid references catalog.materials(id),
 grade_id uuid references catalog.grades(id), brand_id uuid references catalog.brands(id),
 size_label text, diameter_mm numeric(12,3), length_mm numeric(12,3),
 uom text not null check(uom in ('kg','MT','piece','box','bundle')),
 min_order_qty numeric(18,3) not null default 1 check(min_order_qty>0),
 pack_qty numeric(18,3), is_active boolean not null default true,
 created_at timestamptz not null default now(),
 check (diameter_mm is null or diameter_mm>0),
 check (length_mm is null or length_mm>0)
);
create table catalog.variant_attributes (
 variant_id uuid not null references catalog.product_variants(id) on delete cascade,
 attribute_key text not null, value_json jsonb not null,
 primary key(variant_id,attribute_key)
);

create table pricing.markets (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null, state text not null, is_active boolean not null default true
);
create table pricing.customer_price_tiers (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null, is_active boolean not null default true
);
alter table identity.businesses add constraint businesses_price_tier_fk
 foreign key(price_tier_id) references pricing.customer_price_tiers(id);
create table pricing.price_lists (
 id uuid primary key default gen_random_uuid(), market_id uuid not null references pricing.markets(id),
 title text not null, status text not null default 'draft'
 check(status in ('draft','published','archived')),
 effective_at timestamptz, expires_at timestamptz, created_by uuid references identity.profiles(id),
 published_by uuid references identity.profiles(id), published_at timestamptz,
 created_at timestamptz not null default now(),
 check(expires_at is null or effective_at is null or expires_at>effective_at)
);
create table pricing.price_versions (
 id uuid primary key default gen_random_uuid(), price_list_id uuid references pricing.price_lists(id),
 variant_id uuid not null references catalog.product_variants(id),
 market_id uuid not null references pricing.markets(id),
 tier_id uuid references pricing.customer_price_tiers(id),
 amount numeric(20,4) not null check(amount>0), currency_code char(3) not null default 'INR',
 uom text not null, rate_status text not null check(rate_status in ('indicative','confirmed','quote_only')),
 effective_at timestamptz not null, expires_at timestamptz,
 supersedes_id uuid references pricing.price_versions(id),
 created_by uuid references identity.profiles(id), created_at timestamptz not null default now(),
 check(expires_at is null or expires_at>effective_at)
);
create table pricing.current_prices (
 variant_id uuid not null references catalog.product_variants(id),
 market_id uuid not null references pricing.markets(id),
 tier_key text not null default 'public', -- 'public' or price tier UUID as text
 price_version_id uuid not null references pricing.price_versions(id),
 revision bigint not null default 1, updated_at timestamptz not null default now(),
 primary key(variant_id,market_id,tier_key)
);
create table pricing.price_adjustments (
 id uuid primary key default gen_random_uuid(), variant_id uuid not null references catalog.product_variants(id),
 market_id uuid not null references pricing.markets(id),
 adjustment_kind text not null check(adjustment_kind in ('base','increase','rolling','margin','discount')),
 amount numeric(20,4) not null, note text, created_by uuid references identity.profiles(id),
 created_at timestamptz not null default now()
);

create table sales.rfqs (
 id uuid primary key default gen_random_uuid(), rfq_no text not null unique,
 buyer_id uuid not null references identity.profiles(id), business_id uuid references identity.businesses(id),
 delivery_address_id uuid references identity.addresses(id), preferred_delivery_at timestamptz,
 status text not null default 'submitted' check(status in ('draft','submitted','reviewing','quoted','accepted','rejected','expired','converted','cancelled')),
 notes text, assigned_to uuid references identity.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table sales.rfq_items (
 id uuid primary key default gen_random_uuid(), rfq_id uuid not null references sales.rfqs(id) on delete cascade,
 variant_id uuid not null references catalog.product_variants(id),
 qty numeric(18,3) not null check(qty>0), uom text not null, requirements text
);
create table sales.quotations (
 id uuid primary key default gen_random_uuid(), quote_no text not null unique,
 rfq_id uuid not null references sales.rfqs(id), created_by uuid references identity.profiles(id),
 current_revision int not null default 0, status text not null default 'draft'
 check(status in ('draft','sent','accepted','rejected','expired','superseded','converted')),
 created_at timestamptz not null default now(), unique(rfq_id,id)
);
create table sales.quotation_revisions (
 id uuid primary key default gen_random_uuid(), quotation_id uuid not null references sales.quotations(id),
 revision_no int not null check(revision_no>0), valid_until timestamptz not null,
 subtotal numeric(20,2) not null check(subtotal>=0), discount_total numeric(20,2) not null default 0,
 gst_total numeric(20,2) not null default 0, freight_total numeric(20,2) not null default 0,
 grand_total numeric(20,2) not null check(grand_total>=0),
 payment_terms jsonb not null default '{}'::jsonb, notes text,
 status text not null default 'draft' check(status in ('draft','sent','accepted','rejected','expired','superseded')),
 accepted_at timestamptz, created_at timestamptz not null default now(),
 unique(quotation_id,revision_no)
);
create table sales.quotation_items (
 id uuid primary key default gen_random_uuid(), revision_id uuid not null references sales.quotation_revisions(id),
 variant_id uuid not null references catalog.product_variants(id),
 qty numeric(18,3) not null check(qty>0), uom text not null,
 rate numeric(20,4) not null check(rate>=0), tax_rate numeric(7,4) not null default 0,
 line_total numeric(20,2) not null check(line_total>=0)
);

create table commerce.carts (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null unique references identity.profiles(id),
 market_id uuid references pricing.markets(id), updated_at timestamptz not null default now()
);
create table commerce.cart_items (
 cart_id uuid not null references commerce.carts(id) on delete cascade,
 variant_id uuid not null references catalog.product_variants(id),
 qty numeric(18,3) not null check(qty>0), primary key(cart_id,variant_id)
);
create table commerce.stock_locations (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 city text, is_active boolean not null default true
);
create table commerce.inventory (
 variant_id uuid not null references catalog.product_variants(id),
 stock_location_id uuid not null references commerce.stock_locations(id),
 on_hand numeric(18,3) not null default 0 check(on_hand>=0),
 reserved numeric(18,3) not null default 0 check(reserved>=0 and reserved<=on_hand),
 updated_at timestamptz not null default now(),
 primary key(variant_id,stock_location_id)
);
create table commerce.inventory_movements (
 id uuid primary key default gen_random_uuid(), variant_id uuid not null references catalog.product_variants(id),
 stock_location_id uuid not null references commerce.stock_locations(id),
 qty_delta numeric(18,3) not null check(qty_delta<>0), reason text not null,
 external_ref text, performed_by uuid references identity.profiles(id),
 created_at timestamptz not null default now()
);
create table commerce.orders (
 id uuid primary key default gen_random_uuid(), order_no text not null unique,
 buyer_id uuid not null references identity.profiles(id), business_id uuid references identity.businesses(id),
 market_id uuid references pricing.markets(id), quotation_revision_id uuid references sales.quotation_revisions(id),
 delivery_address_snapshot jsonb not null, status text not null default 'pending_payment'
 check(status in ('pending_payment','confirmed','processing','partially_shipped','shipped','delivered','cancelled','refunded')),
 currency_code char(3) not null default 'INR', subtotal numeric(20,2) not null,
 discount_total numeric(20,2) not null default 0, gst_total numeric(20,2) not null default 0,
 freight_total numeric(20,2) not null default 0, loading_total numeric(20,2) not null default 0,
 grand_total numeric(20,2) not null check(grand_total>=0),
 amount_due numeric(20,2) not null check(amount_due>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index uq_order_quote_revision on commerce.orders(quotation_revision_id) where quotation_revision_id is not null;
create table commerce.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references commerce.orders(id),
 variant_id uuid not null references catalog.product_variants(id),
 price_version_id uuid references pricing.price_versions(id), sku_snapshot text not null,
 qty numeric(18,3) not null check(qty>0), uom text not null,
 unit_price numeric(20,4) not null check(unit_price>=0), tax_rate numeric(7,4) not null default 0,
 line_total numeric(20,2) not null check(line_total>=0)
);
create table commerce.stock_reservations (
 id uuid primary key default gen_random_uuid(), order_item_id uuid not null references commerce.order_items(id),
 variant_id uuid not null references catalog.product_variants(id),
 stock_location_id uuid not null references commerce.stock_locations(id),
 qty numeric(18,3) not null check(qty>0), status text not null default 'active'
 check(status in ('active','released','consumed')),
 expires_at timestamptz, created_at timestamptz not null default now()
);
create table commerce.payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references commerce.orders(id),
 gateway text not null, gateway_payment_id text, gateway_order_id text,
 amount numeric(20,2) not null check(amount>0), currency_code char(3) not null default 'INR',
 status text not null default 'pending'
 check(status in ('pending','processing','successful','failed','partially_refunded','refunded','review')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(gateway,gateway_payment_id)
);
create table commerce.payment_events (
 id uuid primary key default gen_random_uuid(), payment_id uuid references commerce.payments(id),
 gateway text not null, event_id text not null, event_type text not null,
 payload_hash text not null, received_at timestamptz not null default now(),
 unique(gateway,event_id)
);
create table commerce.refunds (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references commerce.payments(id),
 gateway_refund_id text unique, amount numeric(20,2) not null check(amount>0),
 status text not null default 'pending' check(status in ('pending','successful','failed')),
 created_at timestamptz not null default now()
);
create table commerce.shipments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references commerce.orders(id),
 carrier text, tracking_number text, status text not null default 'pending',
 dispatched_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default now()
);

create table platform.media_assets (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid references identity.profiles(id),
 entity_type text not null, entity_id uuid not null, object_key text not null unique,
 mime_type text not null, size_bytes bigint not null check(size_bytes>=0),
 visibility text not null check(visibility in ('public','private')),
 upload_status text not null default 'pending' check(upload_status in ('pending','verified','rejected')),
 created_at timestamptz not null default now()
);
create table platform.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references identity.profiles(id),
 channel text not null check(channel in ('in_app','push','whatsapp','email','sms')),
 template_code text, payload jsonb not null default '{}'::jsonb,
 status text not null default 'pending', provider_message_id text,
 created_at timestamptz not null default now(), delivered_at timestamptz
);
create table platform.outbox_events (
 id uuid primary key default gen_random_uuid(), event_type text not null,
 aggregate_type text not null, aggregate_id uuid not null,
 payload jsonb not null, status text not null default 'pending'
 check(status in ('pending','enqueued','failed')),
 attempts int not null default 0, next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(), enqueued_at timestamptz
);
create table platform.webhook_events (
 id uuid primary key default gen_random_uuid(), provider text not null,
 provider_event_id text not null, payload_hash text not null,
 processed_at timestamptz, created_at timestamptz not null default now(),
 unique(provider,provider_event_id)
);
create table platform.idempotency_keys (
 actor_id uuid not null, operation text not null, key text not null,
 request_hash text not null, response_json jsonb, resource_id uuid,
 status text not null default 'processing' check(status in ('processing','completed','failed')),
 expires_at timestamptz not null, created_at timestamptz not null default now(),
 primary key(actor_id,operation,key)
);
create table platform.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid,
 action text not null, resource_type text not null, resource_id uuid,
 before_data jsonb, after_data jsonb, request_id text, created_at timestamptz not null default now()
);
create table platform.app_settings (
 key text primary key, value jsonb not null, updated_by uuid references identity.profiles(id),
 updated_at timestamptz not null default now()
);

-- Read-path / workflow indexes
create index idx_products_category_public on catalog.products(category_id,created_at desc) where status='published';
create index idx_variants_product_active on catalog.product_variants(product_id) where is_active;
create index idx_variants_material_grade on catalog.product_variants(material_id,grade_id,diameter_mm);
create index idx_attributes_key_value on catalog.variant_attributes using gin(value_json jsonb_path_ops);
create index idx_prices_history_lookup on pricing.price_versions(variant_id,market_id,effective_at desc);
create index idx_prices_list on pricing.price_versions(price_list_id);
create index idx_price_current_revision on pricing.current_prices(market_id,updated_at desc);
create index idx_rfqs_buyer_time on sales.rfqs(buyer_id,created_at desc);
create index idx_rfqs_queue on sales.rfqs(status,created_at) where status in ('submitted','reviewing');
create index idx_quotes_rfq on sales.quotations(rfq_id,created_at desc);
create index idx_order_buyer_time on commerce.orders(buyer_id,created_at desc);
create index idx_order_staff_queue on commerce.orders(status,created_at desc);
create index idx_reservations_expiry on commerce.stock_reservations(expires_at) where status='active';
create index idx_payment_order on commerce.payments(order_id,created_at desc);
create index idx_notification_user on platform.notifications(user_id,created_at desc);
create index idx_outbox_pending on platform.outbox_events(next_attempt_at,created_at) where status in ('pending','failed');
create index idx_audit_resource on platform.audit_logs(resource_type,resource_id,created_at desc);

-- RLS defaults: deny all through Data API until explicit policies exist.
-- Grant usage on schemas/tables only as required by the final API exposure model.
do $$ declare r record; begin
 for r in select schemaname,tablename from pg_tables
 where schemaname in ('identity','catalog','pricing','sales','commerce','platform') loop
  execute format('alter table %I.%I enable row level security',r.schemaname,r.tablename);
 end loop;
end $$;

-- Security helper: create it in a non-exposed schema. Function owner is a privileged DB role.
create schema if not exists internal;
create or replace function internal.has_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from identity.user_roles r
 where r.user_id = (select auth.uid()) and r.role_code = p_role)
$$;
revoke all on function internal.has_role(text) from public;
grant usage on schema internal to authenticated;
grant execute on function internal.has_role(text) to authenticated;

-- Sample end-user policies. Other tables stay inaccessible directly (Edge Functions / audited RPC only).
create policy profile_select_own on identity.profiles for select to authenticated
 using(id=(select auth.uid()) or internal.has_role('super_admin'));
-- Profile changes must go through a restricted RPC / Edge Function so account_status cannot be self-edited.
create policy public_categories_read on catalog.categories for select to anon,authenticated using(is_active);
create policy published_products_read on catalog.products for select to anon,authenticated using(status='published');
create policy public_materials_read on catalog.materials for select to anon,authenticated using(is_active);
create policy public_grades_read on catalog.grades for select to anon,authenticated using(is_active);
create policy public_brands_read on catalog.brands for select to anon,authenticated using(is_active);
create policy published_variants_read on catalog.product_variants for select to anon,authenticated
 using(is_active and exists(select 1 from catalog.products p where p.id=product_id and p.status='published'));
create policy own_rfqs_read on sales.rfqs for select to authenticated
 using(buyer_id=(select auth.uid()) or internal.has_role('sales_executive') or internal.has_role('super_admin'));
create policy own_orders_read on commerce.orders for select to authenticated
 using(buyer_id=(select auth.uid()) or internal.has_role('order_manager') or internal.has_role('super_admin'));
create policy own_notifications_read on platform.notifications for select to authenticated
 using(user_id=(select auth.uid()));
-- Never expose current_prices directly to anonymous users until dealer tier leakage is addressed.
-- Use a curated public view/Edge Function to apply market/tier, validity and status filtering.
