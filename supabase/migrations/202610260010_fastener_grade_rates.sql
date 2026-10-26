begin;
create table if not exists public.fastener_grade_rates (
 grade text primary key check (grade in ('MS','SPL 8.8','SPL 10.9','SPL 12.9')),
 bolt_rate numeric(12,2) not null check (bolt_rate > 0),
 nut_rate numeric(12,2) not null check (nut_rate > 0),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table public.fastener_grade_rates enable row level security;
revoke all on public.fastener_grade_rates from anon, authenticated;
grant select on public.fastener_grade_rates to anon, authenticated;
drop policy if exists grade_rates_read on public.fastener_grade_rates;
create policy grade_rates_read on public.fastener_grade_rates for select to anon, authenticated using (true);
insert into public.fastener_grade_rates(grade,bolt_rate,nut_rate) values
 ('MS',105,110),('SPL 8.8',125,125),('SPL 10.9',135,140),('SPL 12.9',155,160)
on conflict (grade) do nothing;
create or replace function public.fti_fastener_grade_save(p_grade text,p_bolt numeric,p_nut numeric,p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := internal.identity_staff('catalog.manage');
begin
 if p_bolt is null or p_nut is null or p_bolt <= 0 or p_nut <= 0
 or p_bolt > 9999999999.99 or p_nut > 9999999999.99
 or p_bolt <> round(p_bolt,2) or p_nut <> round(p_nut,2) then
 raise exception 'Enter positive rates with at most two decimal places'; end if;
 update public.fastener_grade_rates set bolt_rate=p_bolt,nut_rate=p_nut,
 revision=revision+1,updated_at=now(),updated_by=actor
 where grade=p_grade and revision=p_revision;
 if not found then raise exception 'Rates changed. Reload and try again.'; end if;
end $$;
revoke all on function public.fti_fastener_grade_save(text,numeric,numeric,integer) from public,anon;
grant execute on function public.fti_fastener_grade_save(text,numeric,numeric,integer) to authenticated;
commit;
