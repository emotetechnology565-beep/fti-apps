-- Create the material categories used by the shared grade-list publisher.
-- No products or price data are seeded by these rows.
begin;

insert into catalog.categories(slug,name,sort_order,is_active)
values
  ('round-bar-as-rolled','Round Bar — As Rolled',30,true),
  ('tmt','TMT',40,true),
  ('bright-bar','Bright Bar',50,true)
on conflict(slug) do update set
  name=excluded.name,
  sort_order=excluded.sort_order,
  is_active=true;

notify pgrst,'reload schema';
commit;
