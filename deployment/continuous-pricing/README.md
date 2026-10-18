# Continuous product pricing

Rates have no expiry. Staff can publish a replacement whenever the increased price, rolling charge or profit percentage changes. MS and EN8 also have shared base prices: changing a grade's base recalculates every matching existing public rate in the same market and pricing unit.

## Calculation

All prices are INR per product unit. Profit is a percentage of the subtotal:

```
Subtotal = base price + increased price + rolling charge
Profit amount = round(subtotal * profit percentage / 100, 4)
Selling rate = subtotal + profit amount
```

For example, base 70 + increase 2 + rolling 3 gives a subtotal of 75. Profit at 10% is 7.50, giving a selling rate of 82.50. The server calculates and validates the result with exact decimal arithmetic. Components must be non-negative, base price must be positive, and values support up to four decimal places.

## Apply to the hosted project

1. Confirm the existing Phase 4 pricing migration is installed.
2. Run the complete `01_continuous_pricing.sql`, then `02_grade_base_pricing.sql`, in Supabase SQL Editor. Both are transactional and safe to reapply. They add the staff breakdown/shared-base fields and replace the pricing RPC implementations. Existing function signatures are preserved.
3. Redeploy the Edge Function named exactly **`pricing`** using `03_pricing.ts`. Keep Verify JWT off, as configured in the project: the function verifies staff sessions and the database enforces permissions and MFA. The function now allows the shared-grade-base operation. No new secrets are required. Reload or ship the updated app. The old `p_expires` argument remains for installed clients, but is ignored. New publications save no expiry.
4. In **Staff console → Pricing**, select a market and product variant, enter the three price amounts and profit percentage, check the calculated total, and add the item. Save the draft, review it, and confirm publication.
5. To update a published rate, use **Update [SKU]** under **Current rates**. Its existing breakdown is copied into a new draft. Edit the breakdown, save it and publish. Customers see the replacement rate and its automatic update time; previous publications remain in price history.
6. To update every priced MS or EN8 variant together, open **Shared material base prices**. Choose the market, grade and unit, enter the new base, review, and confirm. All existing matching published rates update in one transaction, retaining their product-specific increases, rolling charges and profit percentages. The confirmation reports the count of updated rates. Products without an initial published rate still need their charges/profit configured and their first publication.

The current local CLI account has received HTTP 403 for hosted function management. No hosted migration or real price publication was performed by this change. A project member with SQL access must apply the migration.

## MS and EN8 grades

Set each variant's **Grade** in **FTI catalogue** to `MS` or `EN8`. `Mild Steel` and `EN-8` are recognized as the corresponding grade. Shared bases are keyed by market, grade and unit: updating Delhi MS per kg does not change Delhi EN8, another market, or per-piece rates. There is no implicit weight conversion between units. New rate items automatically use a configured shared base and display it as a linked value; change that base in the shared-base form rather than per product.

Changing a shared base writes immutable replacement price versions and one audit/outbox publication for the affected batch. A stale shared-base revision or an oversized calculated result rejects the entire transaction. Drafts are not silently rewritten: if a shared base changes after a draft was saved, publishing that stale draft is blocked until staff refreshes and reviews its breakdown again. Rate publication and shared-base updates use the same market lock.

## Existing rates and access

Existing current-price pointers remain in place. Their rates become visible regardless of elapsed legacy expiry; inactive markets, unpublished products, inactive variants and private customer tiers remain excluded. No historical price row is edited or deleted. A legacy rate with no saved breakdown is represented as its existing amount in the base field, with zero adjustments and zero profit, until staff enters the actual breakdown.

Only verified pricing staff with completed authenticator verification can read the breakdown, save drafts or publish replacements. Public reads and history expose the selling rate and publication timestamp, without internal costs or profit. GST and freight remain excluded. Quotation validity and order-reservation expiry are separate and retain their existing behavior.

The publication date/time comes from the database clock and is displayed in IST, including seconds. There is no manual timestamp entry or future scheduling. Publishing remains an explicit review-and-confirm action, with revision checks, immutable history and audit/outbox records.

Local tests cover percentage calculation and rounding, large values, legacy records, no-expiry reads, replacement history, server timestamps, rejected inputs, transaction rollback, private-cost isolation, permissions and MFA. Shared-base tests cover MS/EN8 separation, market/unit isolation, stale drafts, revision conflicts and whole-batch rollback. Browser verification uses mocked APIs and publishes no real prices.
