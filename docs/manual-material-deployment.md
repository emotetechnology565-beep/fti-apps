# Inline material entry and Supabase Queues

The existing raw-material form now offers **Enter size manually** and **Enter grade manually** inside its selectors. These choices are independent. Material can also be entered through the existing material selector. There is no separate manual-order form.

For pricing, the server looks up explicit available sizes within 2 mm per dimension, preferring the entered grade and breaking equal-distance ties toward the smaller size. The customer sees the calculated rate and estimated total, without tolerance or rounding messages. Their entered size stays unchanged on the request, staff notification and buyer acknowledgment. The lookup size is retained separately as `pricing_size` for staff. Unknown grades/materials and sizes without a suitable pricing option request a quote; out-of-range sizes show **9780830333**.

## Apply

Prerequisites: existing catalogue, raw-material ordering, round-bar availability and material-selection migrations through `202610240002_material_selection.sql`.

1. Run `202610250001_manual_material_requests.sql` in the Supabase SQL Editor.
2. Run `202610250002_raw_material_supabase_queues.sql`. This enables `pgmq`, creates durable `fti_raw_material_buyer` and `fti_raw_material_staff` queues, and backfills pending jobs once.
3. Redeploy `supabase/functions/catalog/index.ts`. Older gateways can use the authenticated database fallback after rejecting an unsupported operation.
4. Publish the updated frontend using the project's existing hosting/build workflow.

`node scripts/prepare-manual-material.mjs` prepares a dashboard bundle in `deployment/manual-material/`. It contains no credentials. These steps have not been applied to the hosted project by the implementation task.

## Delivery

The existing `operations-whatsapp` worker already calls `fti_raw_material_claim` and `fti_raw_material_finish`; their RPC contract is unchanged. The scheduled worker and approved `fti_raw_material_received_v1` / `fti_raw_material_admin_v1` templates must remain configured. No template changes or new recipient registrations are required.

Supabase Queue messages contain only the private delivery job ID. Jobs retain phone numbers, immutable request details, delivery history and existing consent/recipient checks. Browser roles cannot read the queues. Requests, jobs and queue messages commit together. Retries reuse the request ID and queue message; successful/failed delivery messages are archived. An unknown provider result or expired claim needs staff review before replay, because automatic resend could duplicate a WhatsApp message.

## Verification

Local acceptance covers independent size/grade choices, guest draft handoff, calculated pricing, original-size preservation, out-of-range contact, unknown-grade enquiries, retry deduplication, worker behavior, and queue read/visibility/archive/replay using upstream pgmq SQL in PGlite. The pgmq fixture is test-only; production uses Supabase's extension.

Run `04_verify.sql` from the bundle in the hosted SQL Editor to inspect extension, queue metrics and job counts. Hosted acceptance still requires a signed-in request and delivery confirmation to an authorized test recipient after deployment. Native device acceptance is separate from the web checks.
