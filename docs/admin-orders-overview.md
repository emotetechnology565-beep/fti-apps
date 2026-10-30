# Admin orders overview

Open **Staff console → Orders overview**. Access requires `staff.access`, `order.manage` and staff MFA. The overview covers parts, raw material and fastener orders, including closed orders. Existing confirmation and notification workspaces remain available.

Search by reference, internal ID, customer, phone, business, delivery location, material/SKU, size, grade or LR/tracking number. Combine search with order type, status and optional from/to dates, then choose **Search & apply filters**. Date presets apply immediately. Dates include the entire selected day in `Asia/Kolkata`; either endpoint may be left empty. Reset restores all orders and dates.

Totals describe all matching orders, independently of the 24-row page. Confirmed order value includes confirmed, processing, dispatched and delivered orders; it is not received payment or recognized revenue. Expand an order to see buyer/delivery details, parts line items or request fulfillment and authorized actions. Fulfillment and rejection updates refresh the overview.

**Export Excel** exports the applied filters, across all matching pages, into a genuine `.xlsx` workbook:

- **Orders:** references, type/status, IST booking date, customer/phone/business, location, material/quantity/size/grade, numeric order values and amounts due, transporter/tracking, closure reason and internal ID.
- **Overview:** applied filters, generation time, timezone, counts and confirmed order value.

The browser downloads the file; Android/iOS opens the share sheet. Customer strings are encoded as literal text rather than formulas, and phone numbers remain text. Exports above 10,000 matches are rejected with a request to narrow the filters; results are never silently truncated. Mobile sharing should also be verified on a device before release.

## Deployment and validation

Apply `supabase/migrations/202610300007_admin_orders_overview.sql` after preceding migrations. It adds an internal ledger view, creation-date indexes and the staff-protected `fti_admin_orders` RPC. Direct access to the ledger is revoked for clients. Install the lockfile dependency update for `fflate`, used only when building the Excel export.

Run:

```powershell
npm run typecheck
npm run lint
node_modules/.bin/tsx --test tests/admin-orders-overview.test.ts tests/admin-order-filters.test.ts tests/order-closure.test.ts tests/short-order-references.test.ts
node_modules/.bin/expo export --platform web --output-dir artifacts/admin-orders-preview
python scripts/admin-orders-overview-browser.py
```

The browser test mocks every backend request. It checks mobile/desktop layout, search/date/type/status filtering, pagination, details, error recovery, full export and the export-size limit. Downloaded workbooks are independently opened with `openpyxl`. Evidence is saved under `artifacts/admin-orders/`.
