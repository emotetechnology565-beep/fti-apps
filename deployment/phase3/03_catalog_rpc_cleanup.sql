-- Remove the superseded four-argument overload. Keep the current five-argument
-- function, including its optional saved-product filter. No records are changed.
begin;
drop function if exists public.fti_catalog_list(text, text, integer, integer);
notify pgrst, 'reload schema';
commit;
