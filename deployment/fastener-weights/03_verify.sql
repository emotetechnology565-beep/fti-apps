-- Expected: 4925 rows, 26 charts,
-- 4924 numeric weights, 1 review row.
select count(*) as total_rows, count(distinct chart) as charts,
 count(*) filter(where not review_required) as numeric_weights,
 count(*) filter(where review_required) as review_rows,
 count(*) = 4925 and count(distinct chart) = 26
 and count(*) filter(where review_required) = 1 as import_complete
from public.fastener_weight_reference where source_key = 'approximate-weight';
