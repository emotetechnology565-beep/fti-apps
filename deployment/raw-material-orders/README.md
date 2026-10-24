# Raw-material order requests

Steel product pages now collect an available size and grade, quantity, buyer name,
business or Individual, delivery location, and consent for order-specific WhatsApp
updates. The phone comes from verified sign-in on the server. Requests are pending
FTI confirmation; no payment, price commitment, stock reservation or confirmed order
is created by this form. Fastener PDF quotations and tractor orders are unchanged.

Staff console → Raw-material orders requires `order.manage` and staff MFA. The
recipient form starts with the signed-in admin's number. Save it to enable delivery;
add further authorized numbers as needed. Recipients can be enabled, disabled or
removed independently. No arbitrary buyer can configure notification recipients.
The number field accepts comma-separated numbers and saves each as a separate
recipient. Inputs are validated before saving; duplicate numbers are merged.

If an older deployed `catalog` gateway returns `INVALID_OPERATION`, the app calls
only the six raw-material database RPCs directly with the signed-in user's session.
Database permissions and staff MFA remain enforced. A read-only live check found
the raw-material SQL functions installed while the gateway still returned
`INVALID_OPERATION`. This compatibility path lets settings and order requests work
after updating the app; updating the gateway is still recommended. The WhatsApp
worker must also be deployed for message delivery.

## Missing WhatsApp acknowledgments

The latest live check found both raw-material templates APPROVED. A recovery run
using the current worker claimed three pending raw-material jobs and Meta accepted
all three, with no delivery errors reported. Provider acceptance does not establish
handset delivery. The receipt contains job IDs and provider message IDs in
`test-results/raw-material-delivery-1792757338685.json`.

The current Supabase CLI account receives HTTP 403 for this project's function
management. To enable automatic processing, a project member with deployment
access must update the hosted worker:

1. Run `node scripts/prepare-raw-material-orders.mjs` to prepare dashboard files.
2. In the FTI Supabase Dashboard, open Edge Functions → `operations-whatsapp`.
3. Replace its entry point with the complete contents of
   `deployment/raw-material-orders/03_operations-whatsapp.ts` and deploy it.
   This file includes the crypto helper, so no additional file is needed.
4. Keep Verify JWT disabled, as before. The worker authenticates its existing
   `X-Worker-Secret`. Preserve its existing environment secrets.
5. Confirm the existing `fti-operations-whatsapp` Cron job is active. Its schedule
   runs every five minutes, so queued acknowledgments are sent on the next run.
   `deployment/raw-material-orders/04_delivery_checks.sql` provides read-only checks
   for the queue and schedule. Do not add a duplicate job.

For a controlled recovery, `node --import tsx scripts/process-raw-material-notifications.ts --send-pending`
processes up to ten pending raw-material jobs using the same worker code. It
requires the local server credentials, rechecks recipients, stores delivery
receipts, and never replays sent or ambiguous jobs. It is an operational recovery
tool; scheduled delivery still needs the hosted worker above.

## Deploy in this order

1. Run `supabase/migrations/202610230001_raw_material_orders.sql` in the project's
   Supabase SQL Editor after the identity, catalogue, order permissions and category
   filters migrations. The script is transactional and safe to reapply.
2. Redeploy `catalog` from `supabase/functions/catalog/index.ts`.
3. Redeploy `operations-whatsapp` from `supabase/functions/operations-whatsapp/`,
   keeping its existing `crypto.ts` and worker secret (or use the single-file
   dashboard version above). Keep the existing scheduled
   worker invocation; do not create a second schedule. It claims these jobs only
   when their matching templates are approved.
4. Publish the updated Expo app. Add recipient numbers in Raw-material orders.

Live database and function deployment has not been performed by this change.
The available credentials support the data API and Meta, but do not provide
database migration or Supabase function-management access.

## Templates submitted to Meta

| Name | Meta ID | Status returned at submission |
| --- | --- | --- |
| `fti_raw_material_received_v1` | `2299111884272770` | PENDING |
| `fti_raw_material_admin_v1` | `3058014181207268` | PENDING |

Both are APPROVED at the latest live check.

The buyer template has six positional parameters: buyer name, request reference,
material, size, grade, quantity including unit. The admin template has nine:
reference, material, size, grade, quantity including unit, buyer name, business,
verified phone, delivery location. Payloads are stored in
`scripts/meta_templates.py`. Submission receipts are in
`test-results/raw-material-template-submission.json`.

Each request and its message jobs commit atomically. Reusing a request ID cannot
create a second request. Server checks published steel variants, size/grade,
minimum quantity, verified phone and buyer consent. Recipient phone numbers are
normalized and unique. Disabling/removing a recipient prevents queued delivery;
adding a recipient affects future requests only. Requests submitted before any
recipient is configured remain visible in the admin queue.

Buyer acknowledgment consent applies to this request, not a general subscription.
Admin delivery rechecks that the recipient is enabled and the configuring staff
account still has order-management permission. Recipient changes are audited.
Failed or ambiguous deliveries appear with each order. Staff must check provider
logs before explicitly retrying. Timeouts are never automatically resent.

## Validation

Run lint, typecheck, build, the raw-material DB and worker tests, the existing
quotation worker and admin/architecture tests, and
`python scripts/raw-material-order-browser.py 8137` against a local web export.
Browser tests use mocked APIs and send no real messages.
