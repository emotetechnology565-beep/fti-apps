# Phase 4 - Pricing dashboard deployment

This package deploys the additive pricing migration and the pricing Edge Function. Apply Phase 2 and Phase 3 first. It creates no markets, prices, products, or sample records.

## 1. Apply SQL

In Supabase Dashboard, open **SQL Editor**, create a new query, paste the complete contents of 01_phase4_pricing.sql, and run it. Check that it completes without an error.

## 2. Deploy the Edge Function

Open **Edge Functions**, choose **Deploy a new function**, name it exactly pricing, and paste 02_pricing.ts as its entry point. Deploy it with JWT verification disabled: public reads are checked and writes are verified by the function and again by database permissions.

Required function defaults are already available: SUPABASE_URL and SUPABASE_ANON_KEY. No custom secrets are needed. Never add a service-role key to the app.

## 3. Grant a staff role

Use the dashboard SQL Editor while signed in with a trusted administrator. Replace the UUID with the actual staff profile auth user ID. This example grants the existing price_manager role; do not run it with a placeholder.

    insert into identity.user_roles(user_id, role_code)
    values ('<staff-auth-user-uuid>', 'price_manager')
    on conflict do nothing;

The staff member must complete staff TOTP MFA. Only price_manager and super_admin receive price.manage and price.publish from this migration.

## 4. Enter real data

Create approved markets in the staff console, publish real catalogue products and variants in the catalogue section, then save rates with an explicit expiry and review before immediate publication. Rates are public, indicative INR; GST and freight are excluded. No customer-specific rate or checkout total is generated.

The SQL migration and Edge Function source are also in the archive root. SHA-256 hashes are listed in manifest.json.
