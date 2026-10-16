# Phase 3: catalogue deployment

This additive migration and Edge Function use the catalogue schema from the original FTI PostgreSQL blueprint. Apply Phase 2 first. They create no sample categories, products, rates or media.

## 1. Apply the migration

In the FTI Supabase project, open SQL Editor and run `01_catalog.sql` once. The migration adds the `catalog.manage` permission for the existing `super_admin` role, public read RPCs, staff-only write RPCs, and audit records. All write RPCs require the existing verified-phone, active-account, staff permission and AAL2 checks.

## 2. Deploy the catalogue function

If an earlier four-argument version of `fti_catalog_list` was also installed, run `03_catalog_rpc_cleanup.sql` after the main migration. This removes the superseded overload that causes PGRST203 for requests omitting optional filters. It does not change catalogue records.

In Edge Functions, create a function named exactly `catalog`, paste `02_catalog.ts` as `index.ts`, and deploy. Turn off gateway **Verify JWT** so anonymous product browsing works. The function verifies user JWTs for staff operations; database RPCs enforce the staff permission and MFA again.

No additional secrets are required. The hosted function receives `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Supabase.

## 3. Configure staff

Only an active user with the `super_admin` role receives `catalog.manage`. Sign in with that account and complete TOTP MFA before opening Admin → Catalogue Management. New products are drafts. Publishing requires an active category and one or more active variants. Changes are recorded in `platform.audit_logs`.

## Scope and media

The customer catalogue supports server-side search, category filtering and pagination. Staff can add/update/deactivate categories; add/update products and variants; publish, unpublish, archive and restore products. Variant specifications include SKU, size, dimensions, units, MOQ, grade and brand. Product prices and inventory remain outside this phase and are never fabricated.

Bunny uploads are not enabled yet: the project does not have Bunny Storage zone, access key and CDN hostname configuration. Add those as server-side secrets and implement the upload authorization flow before entering product image URLs. Do not put Bunny credentials in Expo public environment variables.
