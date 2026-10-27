# Fastener order deployment

This package adds the raw-material-style order request form to configured fasteners. It stores the selected drawing and buyer details, shows requests in admin, and sends drawing images through two WhatsApp utility templates.

## Deploy in this order

**Fix for “Drawing dimension is outside permitted limits”:** if the initial migrations are already deployed, run only `03_fix_optional_dimensions.sql` in Supabase SQL Editor. It accepts the older app's unused `width: 0` when the published drawing has no width selector. Required dimensions remain positive and published widths remain enforced. This SQL is enough to unblock the current web page; the refreshed `web-build.zip` also omits unused dimensions. No WhatsApp worker redeployment is needed for this fix. Apply `03_fix_optional_dimensions.sql` after `02_fastener_orders.sql` on a new installation, or after rerunning that setup file.

1. **Database:** you confirmed the migrations are already applied. `01_grade_rates.sql` and `02_fastener_orders.sql` are included for reference or deployment to another environment. Both can be rerun; the grade-rate setup preserves edited rates. Existing identity, catalogue drawings, raw-material recipient and operations migrations are prerequisites.
2. **WhatsApp worker:** deploy the entire `supabase/functions/operations-whatsapp` folder from this package. It includes TypeScript, the PNG renderer, WebAssembly and the font. Do not paste only `index.ts` into the Dashboard: the other files are required.
3. **App:** extract `web-build.zip` and upload its contents to your existing web host. Preserve your existing SPA fallback to `index.html`. For the installed Expo app, use the repository's normal EAS build/update flow.

From this folder in PowerShell, after signing in to Supabase CLI:

```powershell
supabase functions deploy operations-whatsapp --project-ref YOUR_PROJECT_REF --use-api
```

The included `supabase/config.toml` sets Verify JWT off and bundles the `.wasm` and `.ttf` static assets. The worker checks `X-Worker-Secret`. This updates the existing function; its existing scheduled invocation continues to work. No new schedule is required if raw-material WhatsApp delivery already runs.

Keep these existing values in **Supabase Edge Function Secrets**:

- `OPERATIONS_WORKER_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_BUSINESS_ID`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_TEMPLATE_LANGUAGE` (`en_US` for the submitted templates)

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Preserve the existing Bunny secrets because the same worker also delivers quotation PDFs. No credentials are included in this package.

## Templates and recipients

- Customer: `fti_fastener_received_v1`, ID `1405286764922646`.
- Admin: `fti_fastener_admin_v1`, ID `2110418769843339`.

Both use an **IMAGE header** and 11 body variables. `templates.json` contains the approved-submission text and example values; `sample-drawing.png` is the submitted example. `template-status.json` records the last check time and status, not a live status. The worker checks Meta approval before claiming jobs. Pending/rejected templates do not send.

Admin recipients are the same enabled numbers configured for raw-material orders. Admin access is under **Material & fastener orders**. Fastener requests show buyer/order details, the saved drawing, delivery status and a controlled retry for failed or uncertain deliveries. Grade rates are edited under **Fastener dimensions → Fastener grade prices**.

## Order behavior

The customer selects a published standard, size and drawing dimensions, chooses grade and quantity, then enters buyer and delivery details and agrees to WhatsApp updates. A verified signed-in phone is required. Submission queues one buyer message and a separate message for each enabled admin recipient. Each message uploads a PNG generated from the saved drawing, then attaches its WhatsApp media ID to the template image header.

The database saves a drawing snapshot and grade-rate revision. Later dimension/rate changes do not overwrite the request. Retrying the same request does not create duplicate requests. Uncertain provider responses require staff review before replay. These are order requests awaiting FTI confirmation; no payment or final commercial order is created by submitting.

Weight-based prices are approximate and available for supported exact weight matches. The order request saves the selected grade and server-side rates; FTI confirms the final weight, charges and quotation. Configured fasteners with no matching weight can still be requested. Categories without a published drawing remain outside this drawing-attached request flow.

## After deployment

1. Confirm both templates are APPROVED in Meta and the existing scheduled worker is enabled.
2. With an authorized test buyer, select a published fastener and submit one consented request.
3. Confirm its reference and drawing in **Material & fastener orders**.
4. Confirm the buyer and configured admin each receive the correct drawing and matching details. This real-message check is required to confirm live delivery.

To rebuild this package after source changes, run `npm run build`, then `python scripts/package-fastener-orders.py` from the repository root. Refresh generated drawing sources with `python scripts/prepare-fastener-order-renderer.py` if drawing renderers change. `manifest.json` records the bundled files and checksums.
