# Material and fastener request fulfillment

Apply `01_request_fulfillment.sql` in the Supabase SQL editor for the existing FTI project, or deploy the canonical migration `supabase/migrations/202610270002_request_fulfillment.sql` using the project's normal migration process. Apply it once, after the existing raw-material and fastener request migrations. Do not rerun the baseline.

Then publish the updated app/web build. No Edge Function changes are needed: fulfillment updates call the authenticated PostgREST RPC directly. The migration reloads PostgREST's schema cache.

Admin > Material & fastener orders now provides:

1. Confirm order: record an agreed total in INR and a confirmation note covering availability, pricing, taxes, delivery and payment terms.
2. Start processing: record preparation of the accepted request.
3. Record dispatch: record the transporter, LR/tracking reference, and optional vehicle number.
4. Mark delivered: record signed POD or recipient confirmation evidence.

Every step has a review before saving. Database validation enforces ordering, validates required fields, checks MFA, and checks the current revision under a row lock. Repeated or stale writes fail without duplicating activity. The data is persisted independently of notification-job statuses and checkout orders/payments. Source request, buyer and drawing snapshots remain unchanged.

All changes require `order.manage`. Dispatch and delivery also require `operations.manage`. Assign these through the existing role-permission system. Existing super-admin/order-manager grants may already include both permissions; do not grant new roles merely to bypass an access error.

Existing requests show Awaiting confirmation until staff records a real confirmation. The migration does not infer delivery from a sent WhatsApp acknowledgment. It does not mark payment as received, create a checkout order, or automatically send a WhatsApp fulfillment message. In-app updates and audit entries are saved transactionally with each transition.

## Verification

- Database/architecture checks: `node --import tsx --test --test-isolation=none tests/request-fulfillment-db.test.ts tests/architecture.test.ts`
- UI acceptance: run the web export/preview, then `python scripts/request-fulfillment-browser.py <preview-port>`. This script mocks all Supabase traffic and sends no remote messages or records.
- `npm run lint`, `npm run typecheck`, and `npm run build`.

This package has not been applied to the live database by the coding session. The workspace has no direct database connection or Supabase management token available for applying SQL.
