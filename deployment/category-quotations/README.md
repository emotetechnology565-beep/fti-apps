# Fastener category quotation PDFs

Admin can upload one current PDF per fastener category or subcategory. PDFs **do not expire**. Replacing a PDF changes future requests; each existing request keeps its own document version for a consistent record. No automatic two-hour expiry or invented prices are introduced.

Buyers can request a category PDF from Requests & quotations. The multi-item RFQ form also offers **Send fastener category PDFs to my WhatsApp**. One document is queued per distinct fastener category, even when an RFQ has multiple products in the same category. The app sends only to the requesting account's verified phone number, with explicit permission for that requested document; it does not subscribe the buyer to unrelated WhatsApp updates.

If a category has no PDF, the request still alerts staff. Uploading its PDF later automatically queues waiting requests. Every active staff member receives an in-app alert once for each standalone category request or multi-item RFQ. Staff WhatsApp alerts still require their existing opt-in. Sales staff review requests and upload PDFs under **Staff console → RFQs & quotations**. This flow does not change accepted quotation revisions or create an order automatically.

## Deploy

Requires the existing identity, catalogue/media, sales/private media and request-notification migrations, including `202610180001_request_notifications.sql` and `202610180002_whatsapp_phone_format.sql`. If deploying the tractor cart changes too, apply that package first.

1. Run `01_category_quotation_pdfs.sql` in the FTI Supabase SQL Editor.
2. Redeploy **sales** using `02_sales.ts`, **sales-media** using `03_sales-media.ts`, and **operations-whatsapp** using `04_operations-whatsapp.ts`. These prepared files are self-contained; do not deploy files under a different function name. Keep JWT gateway verification disabled as in the existing project: functions authenticate their caller or worker secret themselves.
3. Keep the existing Supabase service defaults, Bunny encrypted-storage secrets, WhatsApp credentials and `OPERATIONS_WORKER_SECRET`. No new runtime secrets are required. Successful requests/uploads wake the existing WhatsApp worker in the background; keep the scheduled worker as a fallback. No customer messages were sent during local tests.
4. Submit the new document-header utility template **fti_category_quotation_v1**, then wait for Meta approval in the configured language. The worker will not claim PDF jobs until that template is approved. The template uses three body parameters (category, PDF upload timestamp, request reference) and a PDF document header. `template-draft.json` is a review draft; its sample-header handle is added at submission time. `sample-quotation.pdf` is explicitly a template-review sample, with no real rates.
5. Deploy the updated app, upload a real quotation PDF to each fastener category, and test with an authorized recipient. End-user delivery still depends on valid Meta access and recipient/provider availability. Accepted API messages are not proof of delivery.

## Template submission

Meta account access is now working. The seven existing notification templates were confirmed APPROVED. The new document-header template `fti_category_quotation_v1` was submitted successfully with sample PDF on 21 October 2026: Meta template ID `2198892627328825`, status **PENDING** at submission. Wait for approval before expecting automatic PDF delivery. No customer messages were sent by this submission.

With a Meta sample upload handle:

```powershell
python scripts/submit-category-quotation-template.py --submit --header-handle "META_SAMPLE_UPLOAD_HANDLE"
```

Or let the script upload the included sample using your actual Meta application ID:

```powershell
python scripts/submit-category-quotation-template.py --submit --app-id YOUR_META_APP_ID --sample-pdf deployment/category-quotations/sample-quotation.pdf
```

Alternatively, create the template in WhatsApp Manager using the draft body and sample PDF. The script checks for an existing template first and never sends a customer message.

## Validation and operational details

Files are PDF-only, limited to 3 MB, encrypted using the existing AES-GCM envelope in Bunny, and downloaded only after database authorization. The worker decrypts the pinned file server-side, verifies its size/signature/hash, uploads it to Meta, and sends the returned media ID in the document header; it does not expose a plaintext public download URL. Admin upload/replacement requires sales permission and staff MFA. Completion and worker metadata access are service-only. Requests and alerts commit together. Retrying the same request ID does not create duplicate requests or staff alerts. An unconfirmed provider send goes to manual review; preparation failures can retry safely because no message has been sent yet.

Run `node scripts/prepare-category-quotations.mjs` to regenerate the deployment files after source changes. Source migrations and packaged files must remain identical. The package does not include real quotations, credentials, or customer records.
