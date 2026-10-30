# Order cancellation and rejection

Apply `supabase/migrations/202610300005_order_cancellation_rejection.sql` after the preceding migrations before releasing the client changes.

- Customers may cancel their own parts, material and fastener orders while awaiting confirmation/payment or confirmed, before processing starts.
- Staff cannot use customer cancellation. Staff with `order.manage` and MFA may reject orders before dispatch, including processing orders, with a reason of 5–1000 characters.
- Processing and dispatched customers are directed to support with a cancellation request prefilled. Material and fastener IDs are included in the message rather than linked as commerce order IDs.
- Dispatched, delivered and closed orders cannot be cancelled or rejected through these actions.
- Actions lock the parent order/request, check the expected status, and record an audit entry and buyer notification. Closed requests cannot resume fulfillment.
- Active stock reservations are released. Consumed stock allocations are returned with an inventory movement. Payment records remain unchanged; accounts must reconcile payments and refunds separately.

Admin parts decisions appear in the tractor orders section. Material and fastener decisions appear in each request's fulfillment panel. Rejection reasons appear in customer order history.

Run `npm run typecheck`, `npm run lint`, and `node_modules/.bin/tsx --test tests/order-closure.test.ts tests/dispatch-driver.test.ts tests/admin-order-filters.test.ts` to verify.
