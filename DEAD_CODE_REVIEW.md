# Dead code and table review

Reviewed 2026-10-27. Application code and database objects were not changed.

## Unused source code

TypeScript import resolution traced every src/app route, including web variants. Repository searches checked consumers and tests.

Eight files are unreachable from the app:

- src/features/catalog/components/RawMaterialOrder.tsx:16 - old order form; product details use MaterialSelection.
- src/features/catalog/hooks/use-available-filters.ts:6 - unused filtering hook.
- src/features/drawings/components/ShapeChoices.tsx:11 - unused shape picker.
- src/features/pricing/services/export-rates.ts:14 - exporter has no caller.
- src/shared/lib/money.ts:1 - only used by the unused exporter.
- src/features/pricing/model/rate.ts:2 - rateFor only appears in the unused pricing index.
- src/features/pricing/index.ts:1 - unused barrel; other pricing entry points remain active.
- src/features/quotations/model/rfq-schema.ts:2 - rfqSchema is never imported.

Two unused exports in otherwise used modules:

- matchesGrade in src/features/catalog/model/catalog-filters.ts:16.
- sharedMaterialGrades in src/features/catalog/model/shared-material-options.ts:7.

Removing the unused exporter would leave expo-print without a source import. expo-sharing still has active callers. WORKSPACE_STORAGE_KEY has test consumers; route defaults and download-drawing.web.ts are framework/platform entry points, so these were excluded from unused findings.

## Database candidates

The baseline and numbered migrations declare 72 distinct tables. These twelve have no explicit application reads or writes found in canonical SQL or backend source. They are investigation candidates, not confirmed safe-to-drop tables.

| Table | Definition in supabase/baseline/blueprint.sql | Notes |
| --- | --- | --- |
| commerce.carts | 183 | Referenced by cart_items. App cart currently uses local Zustand state. |
| commerce.cart_items | 187 | References carts. |
| commerce.payment_events | 250 | No application integration found. |
| commerce.refunds | 256 | No application integration found. |
| platform.webhook_events | 291 | No application integration found. |
| platform.idempotency_keys | 297 | No application integration found; other flows can implement idempotency separately. |
| platform.app_settings | 309 | No application integration found. |
| pricing.price_adjustments | 136 | No application integration found. |
| catalog.materials | 58 | Foreign-key target of grades and variants; public read policy exists. |
| catalog.grades | 62 | Foreign-key target of variants; public read policy exists. |
| catalog.brands | 67 | Foreign-key target of variants; public read policy exists. |
| pricing.customer_price_tiers | 101 | Referenced by businesses and price versions; pricing tests exercise tiers. |

Foreign-key targets need dependency checks before removal. External clients may read public lookup tables without leaving repository references. Tables with writes but no observed reads, such as identity.review_events, commerce.inventory_movements, and sales.revision_requests, were not classified as dead. Role tables and reference datasets were also excluded from dead-table claims.

## Live verification and limits

A read-only request to the configured Supabase REST OpenAPI endpoint succeeded. It exposes public.fastener_grade_rates, public.fastener_weight_reference, and 144 RPC endpoints, confirming both exposed tables exist.

The API does not expose the internal application schemas. No management token was available. Live existence, row counts, live-only functions/triggers/jobs, and external consumers of other declared tables remain unverified. No customer records were fetched.

## Checks

- npm run lint: passed.
- npm run typecheck: passed.
- Read-only TypeScript dependency and symbol analysis, repository reference searches, SQL table inventory, read/write references, and foreign-key inspection completed.

Recommended next step: remove the confirmed unused source code first. Check live data and dependencies before retiring database tables.
