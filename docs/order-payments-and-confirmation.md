# Step payments and WhatsApp confirmation totals

Apply `202610300008_order_confirmation_whatsapp_total.sql`, then `202610300009_order_payment_tracking.sql` after preceding migrations.

## Payment recording

Each material/fastener fulfillment step and parts confirmation/dispatch/delivery form has an optional **Payment received at this step (INR)** field. Leave it blank when no money was received. A positive entry requires a receipt number or bank reference (5–120 characters) and `payment.review` permission with staff MFA. The entered amount is a new receipt, added to earlier receipts; it is not the cumulative amount paid.

Total, payment received, remaining amount and receipt history appear in order details. Customer history and admin overview cards include the totals, and Excel exports include payment received and remaining amount. A separate **Record a payment** action supports payments between steps or after delivery.

The ledger stores each receipt's UUID, amount, reference, timestamp and recording staff member. Customer/table writes are blocked. Receipt and step updates commit together; a failed step rolls back its receipt. A retried receipt UUID cannot add payment twice, references cannot be reused on the same order, and payments above the balance are rejected under a parent-row lock. Decimal arithmetic is exact in the database and payment preview.

Parts order balances include previously verified bank payments. Bank claims after an advance cover only the remaining amount, and a pending claim must be resolved before another manual receipt can be added. Full payment allocates stock once; the existing fully-paid requirement for parts dispatch remains. Reservation expiry skips orders with recorded receipts so it cannot automatically cancel a paid advance. Expired reservations and refunds still require manual resolution.

## WhatsApp confirmation

The existing `fti_order_status_v1` template still receives two text parameters, so no new template or worker contract is required. Confirmation messages include the saved reference and total, for example:

> FTI update for order RM-000001: confirmed; total INR 47,000.00. Open the FTI app for details.

Parts approval adds **awaiting payment** while a balance is due. Verified bank payment confirmation adds **payment verified** and resolves the actual order reference from the payment event. Material and fastener confirmation totals come from their saved fulfillment records. Consent, active-account checks and the one-job-per-notification constraint remain enforced. Previously queued or sent messages are unchanged; the migration does not replay historical notifications.

## Validation

```powershell
npm run typecheck
npm run lint
node_modules/.bin/tsx --test --test-concurrency=2 tests/order-payments.test.ts tests/fulfillment-whatsapp.test.ts tests/dispatch-driver.test.ts tests/order-closure.test.ts tests/admin-orders-overview.test.ts
node_modules/.bin/expo export --platform web --output-dir artifacts/admin-orders-preview
python scripts/order-payments-browser.py
```

The integration tests use actual PostgreSQL functions in PGlite. The browser checks use mocked services and cover all four request steps, overpayment errors, cumulative balances, a blank optional payment step, receipt history and post-delivery settlement at mobile and desktop widths. No customer messages are sent by these checks.
