-- Phase 2 identity: additive to the supplied 14_PostgreSQL_Schema_Blueprint.sql.
-- Also works on a clean project. No customer, company or catalogue seed records.
begin;
create schema if not exists identity;
create schema if not exists internal;
create table if not exists identity.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', phone text, email text,
 account_status text not null default 'active' check(account_status in ('active','blocked','pending')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists identity.businesses (
 id uuid primary key default gen_random_uuid(), legal_name text not null,
 gstin text, verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
 price_tier_id uuid, created_at timestamptz not null default now()
);
alter table identity.businesses add column if not exists pan text;
alter table identity.businesses add column if not exists customer_type text not null default 'industrial_buyer';
alter table identity.businesses add column if not exists submitted_by uuid references identity.profiles(id);
alter table identity.businesses add column if not exists revision integer not null default 1;
alter table identity.businesses add column if not exists reviewed_by uuid references identity.profiles(id);
alter table identity.businesses add column if not exists review_note text;
alter table identity.businesses add column if not exists updated_at timestamptz not null default now();
create unique index if not exists uq_verified_gstin on identity.businesses(upper(gstin)) where gstin is not null;
create unique index if not exists uq_business_application_owner on identity.businesses(submitted_by) where submitted_by is not null;
create table if not exists identity.business_members (
 business_id uuid not null references identity.businesses(id), user_id uuid not null references identity.profiles(id),
 membership_role text not null default 'member' check(membership_role in ('owner','buyer','member')),
 status text not null default 'active' check(status in ('active','invited','revoked')),
 primary key(business_id,user_id)
);
create index if not exists idx_business_members_user on identity.business_members(user_id,status);
create table if not exists identity.addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid references identity.profiles(id),
 business_id uuid references identity.businesses(id), label text, line1 text not null, line2 text,
 city text not null, state text not null, pincode text not null, country_code char(2) not null default 'IN',
 created_at timestamptz not null default now(), check(user_id is not null or business_id is not null)
);
create index if not exists idx_addresses_business on identity.addresses(business_id);
create table if not exists identity.roles(code text primary key);
insert into identity.roles(code) values ('buyer'),('dealer'),('super_admin'),('sales_executive'),('price_manager'),('order_manager'),('accounts') on conflict do nothing;
create table if not exists identity.user_roles (
 user_id uuid not null references identity.profiles(id), role_code text not null references identity.roles(code), primary key(user_id,role_code)
);
create table if not exists identity.role_permissions (
 role_code text not null references identity.roles(code), permission text not null, primary key(role_code,permission)
);
-- Authorization configuration only, never sample users or business data.
insert into identity.role_permissions values
 ('super_admin','staff.access'),('super_admin','business.review'),
 ('sales_executive','staff.access'),('price_manager','staff.access'),
 ('order_manager','staff.access'),('accounts','staff.access') on conflict do nothing;
create table if not exists identity.review_events (
 id bigint generated always as identity primary key, business_id uuid not null references identity.businesses(id),
 actor_id uuid not null references identity.profiles(id), decision text not null, note text not null,
 revision integer not null, created_at timestamptz not null default now()
);
create table if not exists identity.deletion_requests (
 user_id uuid primary key references identity.profiles(id), requested_at timestamptz not null default now(),
 status text not null default 'requested' check(status in ('requested','processing','completed'))
);

-- No direct client writes. RLS is defense in depth if schema exposure changes.
revoke all on all tables in schema identity from anon, authenticated;
revoke all on all sequences in schema identity from anon, authenticated;
alter table identity.profiles enable row level security;
alter table identity.businesses enable row level security;
alter table identity.business_members enable row level security;
alter table identity.addresses enable row level security;
alter table identity.roles enable row level security;
alter table identity.user_roles enable row level security;
alter table identity.role_permissions enable row level security;
alter table identity.review_events enable row level security;
alter table identity.deletion_requests enable row level security;

create or replace function internal.identity_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and phone_confirmed_at is not null)
 then raise exception 'Verified phone sign-in required' using errcode='42501'; end if;
 if exists(select 1 from identity.profiles where id=actor and account_status <> 'active')
 then raise exception 'Account access restricted' using errcode='42501'; end if;
 return actor;
end $$;
create or replace function internal.identity_permission(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from identity.user_roles r join identity.role_permissions p on p.role_code=r.role_code
 join identity.profiles u on u.id=r.user_id where r.user_id=auth.uid() and u.account_status='active' and p.permission=wanted)
$$;
create or replace function internal.identity_staff(wanted text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_actor();
begin
 if not internal.identity_permission(wanted) then raise exception 'Permission denied' using errcode='42501'; end if;
 if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception 'Staff MFA verification required' using errcode='42501'; end if;
 return actor;
end $$;
revoke all on function internal.identity_actor(), internal.identity_permission(text), internal.identity_staff(text) from public, anon, authenticated;

create or replace function public.fti_identity_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_actor(); result jsonb;
begin
 insert into identity.profiles(id,phone) select id,phone from auth.users where id=actor on conflict(id) do nothing;
 select jsonb_build_object(
 'profile',(select to_jsonb(p) from identity.profiles p where p.id=actor),
 'roles',coalesce((select jsonb_agg(role_code order by role_code) from identity.user_roles where user_id=actor),'[]'::jsonb),
 'permissions',coalesce((select jsonb_agg(distinct p.permission) from identity.user_roles r join identity.role_permissions p on p.role_code=r.role_code where r.user_id=actor),'[]'::jsonb),
 'businesses',coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('addresses',coalesce((select jsonb_agg(a) from identity.addresses a where a.business_id=b.id),'[]'::jsonb))) from identity.businesses b join identity.business_members m on m.business_id=b.id where m.user_id=actor and m.status='active'),'[]'::jsonb),
 'deletion_requested',exists(select 1 from identity.deletion_requests where user_id=actor)
 ) into result;
 return result;
end $$;
create or replace function public.fti_save_profile(p_full_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_actor();
begin
 if length(btrim(p_full_name)) not between 2 and 120 or p_full_name is null then raise exception 'Name must be 2 to 120 characters' using errcode='22023'; end if;
 insert into identity.profiles(id,full_name,phone) select id,btrim(p_full_name),phone from auth.users where id=actor
 on conflict(id) do update set full_name=excluded.full_name, phone=excluded.phone,updated_at=now();
end $$;
create or replace function public.fti_apply_business(p_application jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_actor(); business uuid; old_status text; expected integer;
 legal text := btrim(p_application->>'legal_name'); tax text := nullif(upper(btrim(p_application->>'gstin')),'');
 pan_number text := nullif(upper(btrim(p_application->>'pan')),''); kind text := p_application->>'customer_type'; addr jsonb;
begin
 if p_application is null or legal is null or length(legal) not between 3 and 200 then raise exception 'Legal business name required' using errcode='22023'; end if;
 if kind is null or kind not in ('retailer','dealer','distributor','manufacturer','industrial_buyer') then raise exception 'Invalid customer type' using errcode='22023'; end if;
 if tax is not null and tax !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then raise exception 'Invalid GSTIN' using errcode='22023'; end if;
 if pan_number is not null and pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'Invalid PAN' using errcode='22023'; end if;
 if p_application->>'consent' is distinct from 'true' then raise exception 'Application confirmation required' using errcode='22023'; end if;
 foreach addr in array array[p_application->'billing',p_application->'shipping'] loop
  if addr is null or coalesce(length(btrim(addr->>'line1')),0) not between 5 and 300
   or coalesce(length(btrim(addr->>'city')),0) not between 2 and 100 or coalesce(length(btrim(addr->>'state')),0) not between 2 and 100
   or coalesce(addr->>'pincode','') !~ '^[1-9][0-9]{5}$' then raise exception 'Complete billing and shipping addresses required' using errcode='22023'; end if;
 end loop;
 if not exists(select 1 from identity.profiles where id=actor and length(full_name)>=2) then raise exception 'Save your personal profile first' using errcode='22023'; end if;
 -- Serialize repeated submissions by the same applicant, including first insert.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select id,verification_status,revision into business,old_status,expected from identity.businesses where submitted_by=actor for update;
 if business is not null then
  if old_status='verified' then raise exception 'Verified details require staff review to change' using errcode='42501'; end if;
  if coalesce((p_application->>'revision')::integer,0) <> expected then raise exception 'Application changed; reload before saving' using errcode='40001'; end if;
  update identity.businesses set legal_name=legal,gstin=tax,pan=pan_number,customer_type=kind,verification_status='pending',
   revision=revision+1,reviewed_by=null,review_note=null,updated_at=now() where id=business;
 else
  insert into identity.businesses(legal_name,gstin,pan,customer_type,submitted_by) values(legal,tax,pan_number,kind,actor) returning id into business;
  insert into identity.business_members(business_id,user_id,membership_role) values(business,actor,'owner');
 end if;
 delete from identity.addresses where business_id=business and label in ('billing','shipping');
 insert into identity.addresses(user_id,business_id,label,line1,city,state,pincode)
 select actor,business,label,btrim(value->>'line1'),btrim(value->>'city'),btrim(value->>'state'),value->>'pincode'
 from (values ('billing',p_application->'billing'),('shipping',p_application->'shipping')) as input(label,value);
 return business;
end $$;
create or replace function public.fti_review_queue() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform internal.identity_staff('business.review');
 return coalesce((select jsonb_agg(row) from (select id,legal_name,gstin,pan,customer_type,revision,created_at from identity.businesses where verification_status='pending' order by created_at limit 100) row),'[]'::jsonb);
end $$;
create or replace function public.fti_review_business(p_id uuid,p_revision integer,p_decision text,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('business.review'); applicant uuid; current_revision integer; current_status text;
begin
 if p_decision is null or p_decision not in ('verified','rejected') or coalesce(length(btrim(p_note)),0) not between 3 and 1000 then raise exception 'Decision and review note required' using errcode='22023'; end if;
 select submitted_by,revision,verification_status into applicant,current_revision,current_status from identity.businesses where id=p_id for update;
 if not found then raise exception 'Application not found' using errcode='22023'; end if;
 if applicant=actor or exists(select 1 from identity.business_members where business_id=p_id and user_id=actor and status='active') then raise exception 'Cannot review your own business' using errcode='42501'; end if;
 if current_status <> 'pending' or p_revision is distinct from current_revision then raise exception 'Application changed; reload before reviewing' using errcode='40001'; end if;
 update identity.businesses set verification_status=p_decision,reviewed_by=actor,review_note=btrim(p_note),revision=revision+1,updated_at=now() where id=p_id;
 insert into identity.review_events(business_id,actor_id,decision,note,revision) values(p_id,actor,p_decision,btrim(p_note),current_revision);
 -- Approval verifies this business only. It never grants global staff roles or credit.
end $$;
create or replace function public.fti_request_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_actor();
begin
 insert into identity.deletion_requests(user_id) values(actor) on conflict(user_id) do nothing;
end $$;
revoke all on function public.fti_identity_me(),public.fti_save_profile(text),public.fti_apply_business(jsonb),public.fti_review_queue(),public.fti_review_business(uuid,integer,text,text),public.fti_request_account_deletion() from public, anon;
grant execute on function public.fti_identity_me(),public.fti_save_profile(text),public.fti_apply_business(jsonb),public.fti_review_queue(),public.fti_review_business(uuid,integer,text,text),public.fti_request_account_deletion() to authenticated;
notify pgrst, 'reload schema';
commit;
