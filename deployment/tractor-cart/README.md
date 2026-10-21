# Tractor cart checkout

1. In the FTI Supabase SQL Editor, run `01_tractor_cart.sql` after the existing Phase 6 commerce migration.
2. Run `03_order_staff_alerts.sql` after the existing request-notification migration (`202610180001_request_notifications.sql`). This alerts all active staff for future new orders, including quotation orders. It does not notify historical orders.
3. Replace the `commerce` Edge Function code with `02_commerce.ts` and deploy with JWT gateway verification disabled, matching the existing function configuration. The function verifies the caller through Auth and forwards their JWT; database functions enforce buyer ownership and staff MFA.
4. Deploy the updated application build.

Published tractor parts with active variants show Add to cart. Multiple variants are selected from the product page. Prices are optional at cart submission: displayed discounted prices are read on the server; unpriced items await an admin-entered price.

Buyers choose a personal delivery address and submit an order awaiting confirmation. No payment is due and no stock is reserved at this point. Staff with `order.manage` open **Tractor order confirmation**, enter final unit prices plus absolute GST and delivery amounts in INR (including explicit zero amounts), review the total, and confirm. Confirmation requires the existing reservation policy and sufficient tracked inventory; it atomically reserves stock and moves the order to pending payment. Existing bank transfer verification, expiry, dispatch and delivery flows then apply.

This package creates no products, prices, inventory, tax rates or delivery defaults. Existing quotation orders retain their workflow. Submission retries with the same request ID and payload return the same order. Confirmed orders cannot have their charges edited using this action.

Validation: local disposable database coverage checks ownership, staff MFA, minimum quantities, duplicate lines, server-read discounted prices, idempotency, missing prices, stock checks/rollback and payment blocking before confirmation. Deploying the SQL alone does not add buttons to an older app build.

## Staff alerts

Every active profile with staff.access receives one in-app notification when a new order transaction commits. Duplicate roles do not duplicate notices; a retried cart submission or later order confirmation does not repeat the new-order alert. The staff banner and account updates refresh every five seconds while the app is open. Staff without order.manage can see the alert but cannot confirm orders.

The existing consent-gated request notification trigger creates WhatsApp jobs for opted-in staff. Successful new cart/quotation orders through the commerce Edge Function immediately wake the existing operations-whatsapp worker in the background, in bounded batches. The commerce function needs the existing OPERATIONS_WORKER_SECRET secret, and the previously deployed operations-whatsapp function must be available. No credentials are included in this package. The existing Cron job remains a fallback for delivery errors, rate limits or large backlogs. Orders submitted directly in the SQL Editor receive immediate in-app notices but WhatsApp uses the scheduled worker. Provider delivery time is not guaranteed; staff without WhatsApp opt-in still get in-app alerts.
