begin;

create table if not exists commerce.rate_plan (
 id boolean primary key default true check(id),
 amount_paise integer not null check(amount_paise between 100 and 100000000),
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
insert into commerce.rate_plan(id,amount_paise) values(true,120000) on conflict do nothing;
create table if not exists commerce.rate_subscriptions (
 user_id uuid primary key references identity.profiles(id),
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create table if not exists commerce.rate_purchases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references identity.profiles(id),
 amount_paise integer not null check(amount_paise>0),
 plan_revision integer not null,
 razorpay_order_id text unique,
 razorpay_payment_id text unique,
 status text not null default 'created' check(status in ('created','paid')),
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 expires_at timestamptz
);
create index if not exists rate_purchases_user_created on commerce.rate_purchases(user_id,created_at desc);
alter table commerce.rate_plan enable row level security;
alter table commerce.rate_subscriptions enable row level security;
alter table commerce.rate_purchases enable row level security;
revoke all on commerce.rate_plan,commerce.rate_subscriptions,commerce.rate_purchases from public,anon,authenticated;
insert into identity.role_permissions(role_code,permission) values ('super_admin','subscription.manage') on conflict do nothing;

create or replace function public.fti_subscription_access() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from commerce.rate_subscriptions s
 join identity.profiles p on p.id=s.user_id join auth.users u on u.id=p.id
 where s.user_id=auth.uid() and s.expires_at>now() and p.account_status='active' and u.phone_confirmed_at is not null)
$$;
create or replace function public.fti_subscription_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('amount_paise',p.amount_paise,'revision',p.revision,'currency','INR',
 'active',public.fti_subscription_access(),'expires_at',(select expires_at from commerce.rate_subscriptions where user_id=auth.uid()),
 'purchases',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,amount_paise,status,created_at,expires_at from commerce.rate_purchases where user_id=auth.uid() order by created_at desc limit 12) x),'[]'::jsonb))
 from commerce.rate_plan p where id=true
$$;
create or replace function public.fti_subscription_plan_save(p_amount integer,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal.identity_staff('subscription.manage'); result jsonb;
begin
 if p_amount is null or p_amount<100 or p_amount>100000000 then raise exception 'Enter a price between INR 1 and INR 10,00,000.' using errcode='22023'; end if;
 update commerce.rate_plan set amount_paise=p_amount,revision=revision+1,updated_at=now() where id=true and revision=p_revision returning to_jsonb(rate_plan) into result;
 if result is null then raise exception 'Price changed. Refresh and try again.' using errcode='22023'; end if;
 insert into platform.audit_logs(actor_id,action,resource_type,after_data) values(actor,'subscription.price.update','rate_plan',result);
 return result;
end $$;

-- Only the verified payment server can reserve, attach, inspect and settle orders.
create or replace function public.fti_subscription_prepare(p_user uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan commerce.rate_plan; result jsonb;
begin
 perform 1 from identity.profiles p join auth.users u on u.id=p.id where p.id=p_user and p.account_status='active' and u.phone_confirmed_at is not null for update of p;
 if not found then raise exception 'Active verified account required' using errcode='42501'; end if;
 select * into plan from commerce.rate_plan where id=true;
 if p_revision is distinct from plan.revision then raise exception 'Price changed. Refresh before paying.' using errcode='22023'; end if;
 if (select count(*) from commerce.rate_purchases where user_id=p_user and created_at>now()-interval '10 minutes')>=5 then raise exception 'Too many checkout attempts. Try again in 10 minutes.' using errcode='22023'; end if;
 insert into commerce.rate_purchases(user_id,amount_paise,plan_revision) values(p_user,plan.amount_paise,plan.revision) returning to_jsonb(rate_purchases) into result;
 return result;
end $$;
create or replace function public.fti_subscription_order_attach(p_id uuid,p_order text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update commerce.rate_purchases set razorpay_order_id=p_order where id=p_id and razorpay_order_id is null and status='created';
 if not found then raise exception 'Order already attached' using errcode='22023'; end if;
end $$;
create or replace function public.fti_subscription_order_get(p_order text) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(p) from commerce.rate_purchases p where razorpay_order_id=p_order
$$;
create or replace function public.fti_subscription_settle(p_order text,p_payment text,p_amount integer,p_currency text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare purchase commerce.rate_purchases; expiry timestamptz;
begin
 select * into purchase from commerce.rate_purchases where razorpay_order_id=p_order for update;
 if not found then raise exception 'Unknown subscription order' using errcode='22023'; end if;
 if p_amount is distinct from purchase.amount_paise or p_currency is distinct from 'INR' or nullif(p_payment,'') is null then raise exception 'Payment amount or currency mismatch' using errcode='22023'; end if;
 if purchase.status='paid' then
   if purchase.razorpay_payment_id<>p_payment then raise exception 'Payment mismatch' using errcode='22023'; end if;
   return jsonb_build_object('expires_at',purchase.expires_at,'replayed',true);
 end if;
 -- Serialize different renewals for the same user; one captured payment grants one year.
 perform 1 from identity.profiles where id=purchase.user_id for update;
 insert into commerce.rate_subscriptions(user_id,expires_at) values(purchase.user_id,now()+interval '1 year')
 on conflict(user_id) do update set expires_at=greatest(commerce.rate_subscriptions.expires_at,now())+interval '1 year',updated_at=now()
 returning expires_at into expiry;
 update commerce.rate_purchases set status='paid',razorpay_payment_id=p_payment,paid_at=now(),expires_at=expiry where id=purchase.id;
 insert into platform.audit_logs(actor_id,action,resource_type,resource_id,after_data)
 values(purchase.user_id,'subscription.payment.captured','rate_purchase',purchase.id,jsonb_build_object('payment',p_payment,'expires_at',expiry));
 return jsonb_build_object('expires_at',expiry,'replayed',false);
end $$;

revoke all on function public.fti_subscription_access(),public.fti_subscription_status(),public.fti_subscription_plan_save(integer,integer),public.fti_subscription_prepare(uuid,integer),public.fti_subscription_order_attach(uuid,text),public.fti_subscription_order_get(text),public.fti_subscription_settle(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.fti_subscription_access(),public.fti_subscription_status() to anon,authenticated;
grant execute on function public.fti_subscription_plan_save(integer,integer) to authenticated;
grant execute on function public.fti_subscription_prepare(uuid,integer),public.fti_subscription_order_attach(uuid,text),public.fti_subscription_order_get(text),public.fti_subscription_settle(text,text,integer,text) to service_role;

-- Retain the existing redacted result for guests, expired and blocked accounts.
do $$
declare fn record; call_args text; denied text;
begin
 for fn in select p.proname,p.proargnames,pg_get_function_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('fti_catalog_list','fti_catalog_filtered_list','fti_catalog_product_get','fti_catalog_selection_options','fti_catalog_manual_preview','fti_pricing_rates','fti_pricing_history') loop
 select string_agg(format('%I',name),',') into call_args from unnest(fn.proargnames) name;
 denied:=case when fn.proname='fti_pricing_rates' then 'jsonb_build_object(''items'',''[]''::jsonb,''total'',0)'
 when fn.proname='fti_pricing_history' then '''[]''::jsonb'
 else format('internal.redact_public_prices(internal.%I(%s))',fn.proname||'_unredacted',coalesce(call_args,'')) end;
 execute format('create or replace function public.%I(%s) returns jsonb language sql stable security definer set search_path='''' as %L',fn.proname,fn.args,
 format('select case when public.fti_subscription_access() then internal.%I(%s) else %s end',fn.proname||'_unredacted',coalesce(call_args,''),denied));
 end loop;
end $$;
drop policy if exists grade_rates_read on public.fastener_grade_rates;
create policy grade_rates_read on public.fastener_grade_rates for select to authenticated using(public.fti_price_admin_access() or public.fti_subscription_access());
notify pgrst,'reload schema';
commit;
