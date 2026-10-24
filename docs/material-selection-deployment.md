# Material selection deployment

Apply `supabase/migrations/202610240002_material_selection.sql` after migrations through `202610240001_round_bar_availability.sql`, then deploy the updated `catalog` Edge Function and application. Run the whole SQL file as one transaction. It is safe to rerun and preserves explicit staff availability overrides.

The user chose to keep existing published stock and maintain availability in admin. The migration imports exact variant dimensions, exact labels such as `2.5MM`, and explicit `available_sizes` arrays. It does not generate TMT or Sheet stock from the example screenshot or expand arbitrary pricing ranges. Round Bar and Bright Bar inherit the approved 36 sizes and latest 34 grades from the preceding migration.

New tables, all protected by RLS and inaccessible directly to anonymous/authenticated clients:

- `catalog.category_specs`: customer dimension label and allowed dimension keys.
- `catalog.category_sizes`: stable size IDs, labels, numeric dimensions, enabled status and sort order.
- `catalog.availability_options`: explicit product/size/grade combinations, optional pricing variant, unit, MOQ, availability and import source.

The first dimension key is required; subsequent configured keys are optional. This preserves existing Flat thickness-only stock while allowing staff to add full thickness × width options. Dimensions must be positive JSON numbers, with at most 9 integer digits and 3 decimal places. Supported keys are `diameter_mm`, `thickness_mm`, `width_mm`, `height_mm`, `length_mm`, `side_mm` and `size_mm`. Size identity is immutable: create a new size rather than changing dimensions associated with historical requests.

Public read RPC:

```text
fti_catalog_selection_options(p_category text = null, p_size_id uuid = null, p_product uuid = null)
→ {categories, category, sizes, options}
```

When `p_category` is null and `p_product` identifies a published steel product, the category is inferred. Category lists contain configured active steel categories. The client supplies separate Fastener and Tractor Parts adapters. `sizes` contains only enabled sizes with a valid published option. `options` is empty until a size is selected, then contains size-specific entries with `id`, `product_id`, `product_name`, `grade`, `uom`, `min_order_qty`, `variant_id` and current published `attributes`. This endpoint does not download all product variants to build selectors.

Staff RPCs require the existing `catalog.manage` permission and staff MFA:

```text
fti_catalog_selection_admin(p_category uuid)
→ {spec, sizes, options, products}

fti_catalog_selection_spec_save(p_category uuid, p_dimension_label text, p_dimension_keys text[])
→ void

fti_catalog_selection_size_save(p_category uuid, p_size jsonb)
→ uuid
p_size = {id?, label, dimensions, enabled, sort_order?}

fti_catalog_selection_option_save(p_category uuid, p_option jsonb)
→ uuid
p_option = {id?, product_id, size_id, grade, uom, min_order_qty, enabled, variant_id?}
```

An omitted/null pricing variant means Request quote and does not manufacture a variant. A linked variant must match product, grade, size and unit, and the configured MOQ cannot undercut its minimum. Existing imported entries become `source=manual` when staff saves them; subsequent publishing and rerunning the migration cannot overwrite those settings. Disable sizes/options to remove them from sale while preserving reference IDs.

General catalogue product saves refresh imported availability after their existing audit-log event, once variants and attributes have been written. Grade-sheet publication refreshes imported availability after the existing round-bar refresh trigger. Changing product/category or variant active status also takes effect immediately through public availability validation. Staff-edited mappings remain manual; if a linked pricing variant becomes unavailable, the option is hidden until staff chooses an appropriate active mapping or removes its pricing link for a quote.

Customer submit RPC:

```text
fti_catalog_selection_request_submit(p_id uuid, p_option_id uuid, p_quantity text, p_buyer jsonb)
→ {id, reference, replayed}
p_buyer = {name, business, location, whatsapp_consent: true}
```

The transaction validates verified identity, current active option/product/category/size, quantity and MOQ, and buyer consent. It stores a specification and price-state snapshot and uses the existing buyer/staff WhatsApp job queue. Repeating the same request ID and payload returns the original reference without creating another request or notification. An ID reused with different details is rejected.

`sales.raw_material_requests.option_id` is additive. Legacy integer `size_mm` and `variant_id` remain populated where applicable and remain unchanged for historical requests; they are nullable for fractional, multidimensional or unpriced selections. At least a new option ID or both legacy selection fields is required. The existing integer-size submit RPC remains available.

Published price snapshots recognize both `grade_list_price` and `sheet_flat_net_prate`. Existing price-sheet values, surcharges, GST attributes and price variant IDs are retained. Missing pricing remains Request quote. A request does not confirm a sale or reserve stock.

Verification:

```powershell
node --import tsx --test tests/material-selection-db.test.ts tests/round-bar-availability-db.test.ts tests/raw-material-orders-db.test.ts
npm run lint
npm run typecheck
```

The new PGlite test builds the dependency chain, runs the migration repeatedly, checks anonymous/staff permissions, round-bar counts and prices, sub-8mm decimal Sheet stock, multidimensional Flat requests, cross-category rejection, MOQ, deduplication, request privacy, source refresh and preservation of manual disables. Hosted execution and notification delivery require deployment-specific verification; this repository change does not apply the migration to a hosted database.
