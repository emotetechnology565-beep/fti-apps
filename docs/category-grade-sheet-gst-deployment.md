# Category refresh and GST disclosure

The live catalogue APIs were checked and return all eight active categories, including Flat, Sheet and Square. Migration 202610220005 has taken effect. Reload the app to clear old category data. The updated picker also refetches whenever it opens.

Apply `supabase/migrations/202610220006_grade_sheet_gst.sql` in the same Supabase project after migration 202610220001, then deploy the updated app. No new Edge Function operation is required.

In Category publishing, choose Including GST and enter the percentage (0-100, up to two decimals). Enter prices that already contain GST; the app does not add GST again. Save and publish to display the tax disclosure and MOQ. Existing published prices remain unchanged until republished; legacy prices without tax metadata show "GST inclusion not specified". Review existing drafts before republishing because their new GST setting defaults to excluding GST.

After migration 006, run supabase/migrations/202610220007_round_bright_bar_prices.sql to initialise Round Bright Bar from the published Round Bar sheet. Each matching net price gains INR 8,000 per MT. Base prices, grades, sizes and MOQ are copied unchanged. This is a one-time copy, not an ongoing price link. Existing Bright Bar sheets are left unchanged.
