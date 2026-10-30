Material and fastener fulfillment saved in-app notifications, but the WhatsApp
notification trigger only recognized commerce dispatch/delivery titles. It ignored
the structured material/fastener confirmation, processing, dispatch and delivery
events, so they never reached the sender queue.

Apply `supabase/migrations/202610300002_request_fulfillment_whatsapp.sql` in the
Supabase SQL Editor after the request fulfillment and operations WhatsApp migrations.
It is safe to run again. This fix is independent of the driver-details migration.

New status updates enqueue the existing `fti_order_status_v1` template with the
request reference and status. `shipped` is displayed as `dispatched`. Jobs commit
with the fulfillment change and the notification ID prevents duplicate jobs.
Only the matching buyer of the saved request receives an update. The existing
sender continues to enforce active accounts, WhatsApp opt-in and verified phone
format. No historical messages are replayed.

For delivery, `fti_order_status_v1` must be approved in the worker's configured
language, and the existing `fti-operations-whatsapp` Cron must be active. The
scheduled worker normally runs every five minutes; saving a status does not mean
WhatsApp has delivered the message. A buyer who has not enabled WhatsApp updates
under Account settings must enable them first. Request receipt consent and the
account's general status-update opt-in are currently separate.

Run `python scripts/diagnose-fulfillment-whatsapp.py` for read-only template and
queue diagnostics. It does not invoke the sender or send messages. It requires
the local service configuration and a management token for private SQL diagnostics.

Detailed dispatch messages
--------------------------

The `fti_order_dispatch_v1` utility template includes order reference, transporter,
LR/tracking number, vehicle registration, driver name and driver phone. Missing
fields say `Not provided`. Confirmed, processing and delivered continue to use
`fti_order_status_v1`.

Submit the new template with:
`python scripts/meta_templates.py submit fti_order_dispatch_v1`.
Wait for Meta approval in the configured language, redeploy the updated
`supabase/functions/operations-whatsapp` worker, then apply
`supabase/migrations/202610300003_dispatch_whatsapp_details.sql` after migration
`202610300002`. Keep the existing single worker schedule. The new dispatch trigger
runs before the generic triggers, which skip the already queued notification;
there is one message per dispatch notice. Existing pending generic messages are
preserved, and no historical messages are replayed.

The dispatch migration reads optional driver columns from the saved row as JSON,
so it also works before the driver-details migration is installed. Install the
driver-details migration to save driver names and phone numbers through the app.
