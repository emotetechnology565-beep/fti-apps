-- Approximate weight: retain chart boundaries, size labels and units.
create table if not exists public.fastener_weight_reference (
  source_key text not null,
  workbook_row integer not null check (workbook_row > 1),
  chart text not null,
  product text not null,
  specification text not null,
  published_unit text not null,
  row_label text not null,
  column_label text not null,
  published_text text not null,
  published_weight numeric check (published_weight > 0),
  weight_basis text not null check (weight_basis in ('100_pieces', 'piece', 'metre')),
  source_url text not null,
  source_line integer not null,
  review_required boolean not null,
  weight_kg_per_piece numeric generated always as
    (case weight_basis when '100_pieces' then published_weight / 100 when 'piece' then published_weight end) stored,
  weight_kg_per_metre numeric generated always as
    (case when weight_basis = 'metre' then published_weight end) stored,
  primary key (source_key, workbook_row),
  check (review_required = (published_weight is null))
);

create index if not exists fastener_weight_reference_lookup_idx
  on public.fastener_weight_reference (source_key, chart, row_label, column_label)
  where not review_required;

alter table public.fastener_weight_reference enable row level security;
drop policy if exists fastener_weight_reference_read on public.fastener_weight_reference;
create policy fastener_weight_reference_read on public.fastener_weight_reference
  for select to anon, authenticated using (true);
revoke all on public.fastener_weight_reference from anon, authenticated;
grant select on public.fastener_weight_reference to anon, authenticated;
grant all on public.fastener_weight_reference to service_role;

-- Exact chart and axis matches only. No interpolation or arbitrary first result.
create or replace function public.fti_fastener_weight_lookup(
  p_chart text, p_row_label text, p_column_label text,
  p_source_key text default 'approximate-weight'
) returns setof public.fastener_weight_reference
language sql stable security invoker set search_path = '' as $$
  select r.* from public.fastener_weight_reference r
  where r.source_key = p_source_key and r.chart = p_chart
    and r.row_label = p_row_label and r.column_label = p_column_label
    and not r.review_required
  order by r.workbook_row;
$$;
revoke all on function public.fti_fastener_weight_lookup(text,text,text,text) from public;
grant execute on function public.fti_fastener_weight_lookup(text,text,text,text) to anon, authenticated, service_role;
