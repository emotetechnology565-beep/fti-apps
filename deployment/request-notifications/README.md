# Request notifications

The code extends the existing in-app notifications and consent-gated WhatsApp worker. No real customer messages were sent during development. The migration applies to future activity; it does not notify old requests retroactively.

## Meta templates

Submitted using the existing local credentials on 18 October 2026. All five returned PENDING at submission and now show APPROVED in the configured language on the latest live check.

| Template | Meta ID | Purpose |
| --- | --- | --- |
| `fti_request_received_v1` | `2558010214672915` | Applicant submission confirmation |
| `fti_admin_request_v1` | `1666268348481654` | Authorized staff request alert |
| `fti_request_approved_v1` | `2422730015198582` | Applicant approval |
| `fti_request_rejected_v1` | `1111961545073799` | Applicant rejection |
| `fti_request_update_v1` | `2070427226924465` | Quotation ready, enquiry replies, resolution and other progress |

The existing `fti_order_status_v1` and `fti_support_reply_v1` were APPROVED at this check. Recheck current status with `python scripts/meta_templates.py list`. Do not put Meta tokens in app environment variables.

## Coverage

| Request | Staff permission | Applicant updates |
| --- | --- | --- |
| Business verification | `business.review` | Received, approved, rejected; each resubmission gets a new receipt |
| Quotation / RFQ | `sales.manage` | Received, quotation ready, accepted, rejected |
| Quotation revision / acceptance | `sales.manage` | Revision received and quotation acceptance confirmation |
| Order | `order.manage` | Existing order confirmations, expiration, dispatch and delivery updates |
| Bank payment review | `payment.review` | Received, approved, rejected |
| Support ticket / customer follow-up | `support.manage` | Received, staff reply, resolved |
| Stock listing | `stock.review` | Submitted, approved, rejected, withdrawn, sold; drafts do not notify |
| Stock enquiry | `stock.review` plus the listing's seller | Received, counterparty replies, closed |
| Account deletion | `operations.manage` | Received, processing/completed when staff updates its status |

Staff recipients must also have `staff.access` and an active account. Duplicate roles produce one alert per staff member. The applicant does not receive their own staff alert. Business membership and the existing self-review restrictions remain enforced. Seller alerts contain no buyer phone, tax details or message body. WhatsApp contains request type, reference and status; review notes stay in the app.

## Deploy

For **"A verified WhatsApp phone number is required"** after a successful phone OTP sign-in, run `deployment/request-notifications/04_whatsapp_phone_format.sql` in the Supabase SQL Editor after the existing Phase 7 WhatsApp migration. Supabase Auth stores numbers without `+`; this migration normalizes profile numbers from verified Auth records, keeps future profile saves canonical, and checks the verified Auth number when enabling updates. Existing consent and queued jobs are preserved. It does not subscribe anyone or send messages. No Edge Function redeployment is required for this phone-format fix. Local CLI management access returns HTTP 403, so a project member with SQL access must apply it.

The owner reports hosted deployment complete. A live unauthenticated check of `operations-whatsapp` returned HTTP 401 with `UNAUTHORIZED`, confirming the worker is reachable and requires its secret. Management access remains unavailable through the current Supabase CLI credentials, so migration contents, Cron configuration and delivery to real recipients have not been independently verified. The steps below document the deployment procedure.

1. Confirm Phases 2–8, including the Phase 7 outbox/WhatsApp migrations and Phase 8 stock tables, are already installed. Run `deployment/request-notifications/01_request_notifications.sql` once in the FTI Supabase SQL Editor. It is transactional and additive; existing notification jobs are preserved.
2. Redeploy the existing Edge Function **`operations-whatsapp`** using `02_operations-whatsapp.ts`. Keep Verify JWT off: this scheduled function authenticates its worker secret. It reuses `OPERATIONS_WORKER_SECRET`, existing WhatsApp credentials, and Supabase's server-only defaults. No new credentials are needed.
3. Keep the existing in-app outbox Cron job running. If the WhatsApp job is already scheduled, keep that single job. If it has not been scheduled, enable `pg_cron`/`pg_net`, configure the existing Vault secrets, then run `03_schedule_whatsapp.sql` once. It invokes the worker every five minutes; pending templates are skipped while approved templates can send. Never create a duplicate Cron job.
4. Ship/reload the updated app. Both admins and applicants can enable WhatsApp updates explicitly under **Account settings → Your updates → Opt in to WhatsApp updates**. Existing opt-ins are preserved. In-app notices do not require WhatsApp opt-in. Enabling delivery does not subscribe users automatically or backfill old requests.
5. With separate authorized test accounts, submit a real request, confirm its staff alert, then approve/reject it and check the applicant update. Business/stock self-approval remains prohibited. Verify opt-out and staff permission removal prevent sending queued alerts. No approval/rejection actions were added to workflows that do not already support those actions.

Request notices and jobs commit with the originating transaction. Sales/commerce keep the existing idempotent outbox projection; no second applicant receipt is inserted. The sender rechecks consent, active status and staff permissions before sending. A provider timeout or ambiguous result goes to manual review instead of automatic replay; explicit rate limits retain the existing backoff behavior.

Regenerate the package with `node scripts/prepare-request-notifications.mjs`. It contains no credentials. Local validation covers transactional rollback, receipts and decisions across workflows, recipient isolation, duplicate roles/replays, opt-out, permission removal, template approval/parameter validation, and void worker responses. Hosted sending still requires deployment, approved templates and opted-in recipients.
