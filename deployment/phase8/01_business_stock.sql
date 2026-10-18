-- Phase 8: business-owned stock and private enquiries; no business seed data.
begin;
create schema if not exists marketplace;
revoke all on schema marketplace from public,anon,authenticated;
insert into identity.role_permissions values ('super_admin','stock.review'),('sales_executive','stock.review') on conflict do nothing;

create table marketplace.listings (
 id uuid primary key, seller_id uuid not null references identity.profiles(id),
 business_id uuid not null references identity.businesses(id),
 material text not null check(length(material) between 3 and 120),
 grade text not null check(length(grade) between 1 and 80),
 specification text not null check(length(specification) between 1 and 500),
 condition text not null check(condition in ('new','surplus','used')),
 quantity numeric(18,3) not null check(quantity>0), uom text not null check(uom in ('kg','tonne','piece','metre')),
 asking_price numeric(18,2) not null check(asking_price>0), price_unit text not null check(price_unit in ('kg','tonne','piece','metre')),
 city text not null check(length(city) between 2 and 100), state text not null check(length(state) between 2 and 100),
 pincode text not null check(pincode ~ '^[1-9][0-9]{5}$'), notes text not null default '' check(length(notes)<=2000),
 available_until timestamptz not null,
 status text not null default 'draft' check(status in ('draft','submitted','published','rejected','withdrawn','sold')),
 version integer not null default 1, review_note text, reviewed_by uuid references identity.profiles(id),
 reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_stock_seller on marketplace.listings(seller_id,updated_at desc,id);
create index idx_stock_business on marketplace.listings(business_id);
create index idx_stock_browse on marketplace.listings(updated_at desc,id) where status='published';
create index idx_stock_review on marketplace.listings(updated_at,id) where status='submitted';
create table marketplace.enquiries (
 id uuid primary key, listing_id uuid not null references marketplace.listings(id),
 buyer_id uuid not null references identity.profiles(id), quantity numeric(18,3) not null check(quantity>0),
 listing_snapshot jsonb not null, status text not null default 'open' check(status in ('open','closed')),
 version integer not null default 1, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index idx_stock_enquiry_buyer on marketplace.enquiries(buyer_id,updated_at desc,id);
create index idx_stock_enquiry_listing on marketplace.enquiries(listing_id,updated_at desc,id);
create unique index uq_stock_open_enquiry on marketplace.enquiries(listing_id,buyer_id) where status='open';
create table marketplace.messages (
 id uuid primary key, enquiry_id uuid not null references marketplace.enquiries(id),
 author_id uuid not null references identity.profiles(id), body text not null check(length(body) between 1 and 2000),
 closed_enquiry boolean not null default false,
 created_at timestamptz not null default now()
);
create index idx_stock_messages on marketplace.messages(enquiry_id,created_at,id);
alter table marketplace.listings enable row level security;
alter table marketplace.enquiries enable row level security;
alter table marketplace.messages enable row level security;
revoke all on all tables in schema marketplace from public,anon,authenticated;

create function internal.stock_seller(p_business uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor();
begin
 if not exists(select 1 from identity.businesses b join identity.business_members m on m.business_id=b.id
  where b.id=p_business and b.verification_status='verified' and m.user_id=actor and m.status='active') then
  raise exception 'An active membership in a verified business is required' using errcode='42501'; end if;
 return actor;
end $$;
create function internal.stock_visible(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from marketplace.listings l join identity.businesses b on b.id=l.business_id
 join identity.profiles p on p.id=l.seller_id join identity.business_members m on m.business_id=b.id and m.user_id=l.seller_id
 where l.id=p_id and l.status='published' and l.available_until>now() and l.quantity>0
 and b.verification_status='verified' and p.account_status='active' and m.status='active')
$$;
create function internal.stock_read(p_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor();
begin
 if exists(select 1 from marketplace.listings where id=p_id and seller_id=actor) or internal.stock_visible(p_id) then return; end if;
 perform internal.identity_staff('stock.review');
 if not exists(select 1 from marketplace.listings where id=p_id) then raise exception 'Listing unavailable' using errcode='P0002'; end if;
end $$;
create function internal.stock_card(p_id uuid,p_private boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'business_id',l.business_id,'business_name',b.legal_name,
 'material',l.material,'grade',l.grade,'specification',l.specification,'condition',l.condition,
 'quantity',l.quantity::text,'uom',l.uom,'asking_price',l.asking_price::text,'price_unit',l.price_unit,
 'city',l.city,'state',l.state,'pincode',l.pincode,'notes',l.notes,'available_until',l.available_until,
 'status',l.status,'version',l.version,'updated_at',l.updated_at,'available',internal.stock_visible(l.id),
 'is_seller',l.seller_id=auth.uid()) || case when p_private then jsonb_build_object('review_note',l.review_note,'reviewed_at',l.reviewed_at) else '{}'::jsonb end
 from marketplace.listings l join identity.businesses b on b.id=l.business_id where l.id=p_id
$$;

create function public.fti_stock_list(p_scope text default 'browse',p_search text default '',p_city text default '',p_condition text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); result jsonb;
begin
 if p_scope not in ('browse','mine','review') or p_scope is null then raise exception 'Invalid stock view' using errcode='22023'; end if;
 if p_scope='review' then perform internal.identity_staff('stock.review'); end if;
 select coalesce(jsonb_agg(internal.stock_card(a.id,p_scope<>'browse') order by a.updated_at desc,a.id),'[]') into result
 from (select l.id,l.updated_at from marketplace.listings l
 join identity.businesses b on b.id=l.business_id join identity.profiles p on p.id=l.seller_id
 left join identity.business_members m on m.business_id=l.business_id and m.user_id=l.seller_id
 where ((p_scope='browse' and l.status='published' and l.available_until>now() and b.verification_status='verified' and p.account_status='active' and m.status='active') or (p_scope='mine' and l.seller_id=actor) or (p_scope='review' and l.status='submitted'))
 and (coalesce(p_search,'')='' or l.material||' '||l.grade||' '||l.specification ilike '%'||left(p_search,120)||'%')
 and (coalesce(p_city,'')='' or l.city ilike '%'||left(p_city,100)||'%')
 and (coalesce(p_condition,'')='' or l.condition=p_condition)
 order by l.updated_at desc,l.id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) a;
 return result;
end $$;
create function public.fti_stock_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform internal.stock_read(p_id);
 return internal.stock_card(p_id,exists(select 1 from marketplace.listings where id=p_id and seller_id=auth.uid()) or internal.identity_permission('stock.review') and coalesce(auth.jwt()->>'aal','aal1')='aal2') ||
 jsonb_build_object('can_certificates',exists(select 1 from marketplace.listings where id=p_id and seller_id=auth.uid()) or
 exists(select 1 from marketplace.enquiries where listing_id=p_id and buyer_id=auth.uid()) or
 internal.identity_permission('stock.review') and coalesce(auth.jwt()->>'aal','aal1')='aal2');
end $$;
create function public.fti_stock_save(p_id uuid,p_version integer,p_business uuid,p_fields jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.stock_seller(p_business); old marketplace.listings; qty numeric; price numeric; until_date timestamptz;
begin
 if p_id is null or p_version is null or p_fields is null or jsonb_typeof(p_fields)<>'object' or
  coalesce(p_fields->>'quantity','') !~ '^[0-9]{1,15}(\.[0-9]{1,3})?$' or
  coalesce(p_fields->>'asking_price','') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then
  raise exception 'Enter valid stock quantity and asking price' using errcode='22023'; end if;
 qty:=(p_fields->>'quantity')::numeric; price:=(p_fields->>'asking_price')::numeric;
 begin until_date:=(p_fields->>'available_until')::timestamptz; exception when others then raise exception 'Enter a valid availability expiry with timezone' using errcode='22023'; end;
 if qty<=0 or price<=0 or until_date is null or not isfinite(until_date) or until_date<=now() or
  coalesce(p_fields->>'available_until','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
  raise exception 'Quantity and price must be positive; expiry must be in the future with timezone' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,81));
 select * into old from marketplace.listings where id=p_id for update;
 if old.id is not null then
  if old.seller_id<>actor or old.business_id<>p_business then raise exception 'Permission denied' using errcode='42501'; end if;
  if old.version<>p_version then raise exception 'Listing changed; refresh before saving' using errcode='40001'; end if;
  if old.status not in ('draft','rejected','withdrawn','published') then raise exception 'Withdraw a submitted listing before editing; sold listings are final' using errcode='22023'; end if;
 elsif p_version<>0 then raise exception 'Listing unavailable' using errcode='P0002'; end if;
 insert into marketplace.listings(id,seller_id,business_id,material,grade,specification,condition,quantity,uom,asking_price,price_unit,city,state,pincode,notes,available_until)
 values(p_id,actor,p_business,trim(p_fields->>'material'),trim(p_fields->>'grade'),trim(p_fields->>'specification'),p_fields->>'condition',qty,p_fields->>'uom',price,p_fields->>'price_unit',trim(p_fields->>'city'),trim(p_fields->>'state'),p_fields->>'pincode',trim(coalesce(p_fields->>'notes','')),until_date)
 on conflict(id) do update set material=excluded.material,grade=excluded.grade,specification=excluded.specification,
 condition=excluded.condition,quantity=excluded.quantity,uom=excluded.uom,asking_price=excluded.asking_price,price_unit=excluded.price_unit,
 city=excluded.city,state=excluded.state,pincode=excluded.pincode,notes=excluded.notes,available_until=excluded.available_until,
 status='draft',version=marketplace.listings.version+1,review_note=null,reviewed_by=null,reviewed_at=null,updated_at=now();
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'stock.saved','business_stock',p_id);
 return p_id;
end $$;
create function public.fti_stock_transition(p_id uuid,p_version integer,p_action text,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); item marketplace.listings; next_status text;
begin
 select * into item from marketplace.listings where id=p_id for update;
 if item.id is null then raise exception 'Listing unavailable' using errcode='P0002'; end if;
 if p_action in ('approve','reject') then
  perform internal.identity_staff('stock.review');
  if item.seller_id=actor then raise exception 'Another reviewer must review your listing' using errcode='42501'; end if;
 else
  if item.seller_id<>actor then raise exception 'Permission denied' using errcode='42501'; end if;
  -- A seller may always withdraw their own listing, even after verification is revoked.
  if p_action<>'withdraw' then perform internal.stock_seller(item.business_id); end if;
 end if;
 if item.version is distinct from p_version then raise exception 'Listing changed; refresh before acting' using errcode='40001'; end if;
 next_status:=case
  when p_action='submit' and item.status in ('draft','rejected') then 'submitted'
  when p_action='approve' and item.status='submitted' then 'published'
  when p_action='reject' and item.status='submitted' then 'rejected'
  when p_action='withdraw' and item.status in ('draft','submitted','published','rejected') then 'withdrawn'
  when p_action='sold' and item.status='published' then 'sold' else null end;
 if next_status is null then raise exception 'This listing cannot change state' using errcode='22023'; end if;
 if p_action in ('submit','approve') then
  if item.available_until<=now() then raise exception 'Extend the availability expiry before submission or approval' using errcode='22023'; end if;
  if not exists(select 1 from identity.businesses b join identity.business_members m on m.business_id=b.id join identity.profiles p on p.id=m.user_id
   where b.id=item.business_id and b.verification_status='verified' and m.user_id=item.seller_id and m.status='active' and p.account_status='active') then
   raise exception 'Seller business is no longer eligible' using errcode='42501'; end if;
  if exists(select 1 from platform.media_assets where entity_id=p_id and entity_type in ('stock_photo','stock_certificate') and upload_status='pending') then
   raise exception 'Wait for uploads to finish before submitting' using errcode='22023'; end if;
 end if;
 if p_action in ('approve','reject') and (p_note is null or length(trim(p_note)) not between 5 and 1000) then raise exception 'Enter a review note (5-1000 characters)' using errcode='22023'; end if;
 update marketplace.listings set status=next_status,version=version+1,updated_at=now(),
 review_note=case when p_action in ('approve','reject') then trim(p_note) else review_note end,
 reviewed_by=case when p_action in ('approve','reject') then actor else reviewed_by end,
 reviewed_at=case when p_action in ('approve','reject') then now() else reviewed_at end where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data) values(actor,'stock.'||next_status,'business_stock',p_id,jsonb_build_object('version',p_version+1,'note',case when p_action in ('approve','reject') then trim(p_note) else null end));
end $$;

create function internal.stock_enquiry_actor(p_id uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); item marketplace.enquiries; seller uuid;
begin
 select * into item from marketplace.enquiries where id=p_id;
 select seller_id into seller from marketplace.listings where id=item.listing_id;
 if item.id is null then raise exception 'Enquiry unavailable' using errcode='42501'; end if;
 if actor<>item.buyer_id and actor<>seller then perform internal.identity_staff('stock.review'); end if;
 return actor;
end $$;
create function public.fti_stock_enquire(p_id uuid,p_listing uuid,p_quantity text,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); item marketplace.listings; existing marketplace.enquiries; qty numeric;
begin
 if p_id is null or coalesce(p_quantity,'') !~ '^[0-9]{1,15}(\.[0-9]{1,3})?$' or p_message is null or length(trim(p_message)) not between 5 and 2000 then raise exception 'Enter a positive quantity and enquiry (5-2000 characters)' using errcode='22023'; end if;
 qty:=p_quantity::numeric;
 select * into item from marketplace.listings where id=p_listing for update;
 select * into existing from marketplace.enquiries where id=p_id;
 if existing.id is not null then
  if existing.buyer_id=actor and existing.listing_id=p_listing and existing.quantity=qty and exists(select 1 from marketplace.messages where id=p_id and body=trim(p_message)) then return existing.id; end if;
  raise exception 'Request ID already used' using errcode='40001'; end if;
 if not internal.stock_visible(p_listing) then raise exception 'Listing is unavailable or expired' using errcode='22023'; end if;
 if item.seller_id=actor or exists(select 1 from identity.business_members where business_id=item.business_id and user_id=actor and status='active') then raise exception 'You cannot enquire on your own business stock' using errcode='22023'; end if;
 if qty<=0 or qty>item.quantity then raise exception 'Requested quantity exceeds available stock' using errcode='22023'; end if;
 if exists(select 1 from marketplace.enquiries where listing_id=p_listing and buyer_id=actor and status='open') then raise exception 'You already have an open enquiry for this listing' using errcode='22023'; end if;
 insert into marketplace.enquiries(id,listing_id,buyer_id,quantity,listing_snapshot) values(p_id,p_listing,actor,qty,internal.stock_card(p_listing));
 insert into marketplace.messages(id,enquiry_id,author_id,body) values(p_id,p_id,actor,trim(p_message));
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,'stock.enquired','stock_enquiry',p_id);
 return p_id;
end $$;
create function public.fti_stock_enquiries(p_scope text default 'buyer',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=internal.identity_actor(); result jsonb;
begin
 if p_scope is null or p_scope not in ('buyer','seller','staff') then raise exception 'Invalid enquiry view' using errcode='22023'; end if;
 if p_scope='staff' then perform internal.identity_staff('stock.review'); end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id),'[]') into result from
 (select e.id,e.listing_id,e.quantity::text,e.listing_snapshot->>'uom' as uom,e.status,e.version,e.updated_at,e.listing_snapshot,
 e.buyer_id=actor as is_buyer,l.seller_id=actor as is_seller,
 p.full_name as buyer_name,e.listing_snapshot->>'business_name' as business_name,e.listing_snapshot->>'material' as material
 from marketplace.enquiries e join marketplace.listings l on l.id=e.listing_id join identity.profiles p on p.id=e.buyer_id join identity.businesses b on b.id=l.business_id
 where (p_scope='buyer' and e.buyer_id=actor) or (p_scope='seller' and l.seller_id=actor) or p_scope='staff'
 order by e.updated_at desc,e.id limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) a;
 return result;
end $$;
create function public.fti_stock_thread(p_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform internal.stock_enquiry_actor(p_id);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]') into result from
 (select m.id,m.body,m.author_id=auth.uid() as is_mine,m.created_at,p.full_name as author_name
 from marketplace.messages m join identity.profiles p on p.id=m.author_id where enquiry_id=p_id
 order by m.created_at desc,m.id desc limit 24 offset greatest(0,least(coalesce(p_offset,0),100000))) a;
 return result;
end $$;
create function public.fti_stock_reply(p_id uuid,p_message_id uuid,p_version integer,p_body text,p_close boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.stock_enquiry_actor(p_id); item marketplace.enquiries; existing marketplace.messages;
begin
 select * into item from marketplace.enquiries where id=p_id for update;
 if p_message_id is null or p_close is null or p_body is null or length(trim(p_body)) not between 1 and 2000 then raise exception 'Enter a message (1-2000 characters)' using errcode='22023'; end if;
 select * into existing from marketplace.messages where id=p_message_id;
 if existing.id is not null then
  if existing.enquiry_id=p_id and existing.author_id=actor and existing.body=trim(p_body) and existing.closed_enquiry=p_close then return; end if;
  raise exception 'Message ID already used' using errcode='40001'; end if;
 if item.version is distinct from p_version then raise exception 'Enquiry changed; refresh before replying' using errcode='40001'; end if;
 if item.status<>'open' then raise exception 'Enquiry is closed' using errcode='22023'; end if;
 insert into marketplace.messages(id,enquiry_id,author_id,body,closed_enquiry) values(p_message_id,p_id,actor,trim(p_body),p_close);
 update marketplace.enquiries set version=version+1,updated_at=now(),status=case when p_close then 'closed' else status end where id=p_id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id) values(actor,case when p_close then 'stock.enquiry.closed' else 'stock.enquiry.replied' end,'stock_enquiry',p_id);
end $$;

revoke all on function internal.stock_seller(uuid),internal.stock_visible(uuid),internal.stock_read(uuid),internal.stock_card(uuid,boolean),internal.stock_enquiry_actor(uuid) from public,anon,authenticated;
revoke all on function public.fti_stock_list(text,text,text,text,integer),public.fti_stock_detail(uuid),public.fti_stock_save(uuid,integer,uuid,jsonb),public.fti_stock_transition(uuid,integer,text,text),public.fti_stock_enquire(uuid,uuid,text,text),public.fti_stock_enquiries(text,integer),public.fti_stock_thread(uuid,integer),public.fti_stock_reply(uuid,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.fti_stock_list(text,text,text,text,integer),public.fti_stock_detail(uuid),public.fti_stock_save(uuid,integer,uuid,jsonb),public.fti_stock_transition(uuid,integer,text,text),public.fti_stock_enquire(uuid,uuid,text,text),public.fti_stock_enquiries(text,integer),public.fti_stock_thread(uuid,integer),public.fti_stock_reply(uuid,uuid,integer,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
