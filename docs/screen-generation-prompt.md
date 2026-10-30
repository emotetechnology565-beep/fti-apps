# FTI screen generation prompt

Copy the prompt below into a coding agent to generate a working visual prototype for client approval.

---

Build a complete, connected, high-fidelity coded prototype for FTI, an Indian B2B fastener and industrial material procurement platform.

## Objective and deliverables

Generate actual runnable screen code, realistic sample data, and working navigation. The client must be able to browse every screen and complete the main journeys before approving development.

Deliver:
- All 56 screens listed below, grouped by journey and numbered consistently.
- A screen gallery with links to every screen, its states, and its journey.
- Five connected interactive journeys using shared mock state.
- A client presentation view with annotated journey sequences and an approval checklist.
- Shared components, design tokens, and a component showcase.
- Run instructions and a screen coverage checklist identifying any incomplete work.

## Project and implementation constraints

Read the repository instructions and existing implementation first. This project uses Expo, React Native, TypeScript, and Expo Router. Read the installed Expo version from package.json and consult its matching versioned documentation before using Expo or React Native APIs.

Use the existing stack, design primitives, and dependencies. Use Expo Router for navigation; keep non-route components, fixtures, and utilities outside src/app. Prefer responsive shared components for mobile and web. Keep the prototype isolated from production workflows and use clearly identified demo data. Avoid live payments, real customer messages, production database writes, or fabricated operational claims.

Make forms, filters, comparison, cart, quantity changes, quotation revisions, approvals, and status changes work locally. Simulate uploads with sample attachments when platform support is unavailable. Provide deterministic demo scenarios and a reset action. Keep entered requirements when navigating or completing simulated login.

Run lint and typecheck, and verify the five journeys at mobile and desktop widths. Report the checks actually completed and any limitations.

## Platforms and visual direction

- Mobile-first customer app: 390 px reference width, responsive to smaller devices.
- Customer website and admin dashboard: 1440 px reference width.
- Mobile and desktop layouts for the main customer screens.
- Professional industrial identity: clear typography, readable specifications, precise drawings, product imagery, and restrained colour.
- Use existing FTI branding and assets. If unavailable, propose navy, white, steel grey, and an orange action colour.
- Consistent spacing, status colours, accessible contrast, visible keyboard focus, comfortable touch targets, and readable mobile tables.
- Prefer reusable patterns over individually styled screens.

## Customers and navigation

Support workshop buyers ordering standard products, procurement managers requesting bulk quotes, contractors submitting custom drawings, and returning businesses reordering.

Mobile navigation: Home, Catalogue, Requirements, Orders, Account. Keep search, cart, and support easy to access. Use an appropriate desktop navigation layout.

## Customer screens

### A. Discovery and selection
01. Home: search, categories, common products, recent purchases, bulk quotation action.
02. Category browser: bolts, nuts, screws, washers, anchors, threaded rods, with illustrations.
03. Search: suggestions for names, aliases, standards, and part numbers.
04. Results: key specifications, availability, pack size, and pricing status.
05. Filters: category, metric/inch, diameter, length, pitch, material, grade, finish, standard, availability.
06. Comparison: up to three products with clear specification differences.
07. Product detail: photo, drawing, specifications, documents, quantity, purchasing actions.
08. Drawing/document viewer: zoom and technical document downloads.
09. Identification guide: head styles, measurement methods, thread terminology.

Product detail must show name, SKU, standard, applicable brand, diameter, length, pitch, full/partial thread, material, grade, finish, selling unit, pack quantity, minimum quantity, applicable price breaks, stock status, dispatch estimate, and clearly labelled estimated weight. Use Add to cart for available priced items and Request quotation for bulk, custom, or unpriced requirements.

### B. Direct purchase
10. Cart: multiple items, editable quantities/units, totals, availability warnings.
11. Login/business registration: simulated phone verification and company details.
12. Checkout: billing/delivery addresses, GST details, shipping, optional PO reference.
13. Order review: exact specifications, quantities, tax, freight, total, delivery estimate.
14. Bank transfer instructions: payable amount, beneficiary, bank/account details, IFSC, order reference, and instructions for paying outside the app by NEFT/RTGS/bank transfer. Use clearly labelled demo bank details.
15. Payment submission and review: UTR/transaction reference, date, amount, optional proof, and Awaiting payment, Submitted for verification, Partially verified, Verified, or Clarification required states.
16. Order acknowledgement: order number and verification status. After staff confirms receipt, show confirmed amount, balance due, next steps, and expected dispatch.

### C. Bulk quotations
17. Requirement list: multiple fasteners and quantities.
18. Spreadsheet upload: preview recognised rows using a sample parts list.
19. Requirement review: missing specifications, unmatched items, clarification needs.
20. Submit RFQ: location, required date, certificate requirements, attachments, notes.
21. RFQ tracking: submitted, under review, clarification requested, quoted, closed.
22. Clarification conversation: RFQ-linked messages and attachments.
23. Quotation detail: itemised rates, tax, freight, stock, delivery, payment terms, validity.
24. Revision request: quantity changes and requested amendments.
25. Acceptance: approve items, optional PO upload, proceed to order.
26. Expired quotation: visible expiry and Request updated quotation.

### D. Custom fasteners
27. Custom requirement: type, dimensions, material, grade, finish, quantity, required date.
28. Drawing upload: sample PDF/image/CAD attachment and manufacturing notes.
29. Requirement summary: dimension preview and entered specification confirmation.
30. Custom request status: technical review, clarification, quotation, approval, production.
31. Drawing approval: revision, status, and explicit approval before production.

### E. Orders and repeat buying
32. Order list: active, completed, cancelled, payment-pending filters.
33. Order detail: items, approved specifications, payment, documents, shipment status.
34. Tracking: dispatch timeline, carrier, tracking, partial shipments.
35. Documents: quote, invoice, packing list, applicable test certificates/approved drawings.
36. Reorder: review current prices and availability before adding items to cart.
37. Saved lists: favourites and recurring procurement requirements.

### F. Account and support
38. Account overview.
39. Company profile and GST details.
40. Billing and delivery addresses.
41. Team members and purchasing permissions.
42. Team purchase approval request.
43. Invoices and payment history.
44. Support request linked to an order, product, or RFQ.
45. Notifications and preferences.

## Admin screens

46. Dashboard: RFQs, orders, payments, dispatches, requests needing attention.
47. Catalogue: products, variants, specifications, images, documents.
48. Stock/pricing: units, pack sizes, minimums, price breaks, customer-specific rates.
49. RFQ inbox: status, customer, urgency, assignee filters.
50. RFQ workspace: line items, attachments, clarification, quotation preparation.
51. Quotation editor: rates, tax, freight, validity, delivery, revisions, preview.
52. Drawing review: dimension checks, revision history, client approval status.
53. Orders: approved specifications, fulfilment, partial shipments, and a manual payment review workspace. Authorised staff checks bank receipt records, records verified amounts/date/reviewer/notes, or requests clarification. Show payment history and outstanding balance.
54. Dispatch creation: items, quantities, carrier, tracking, documents.
55. Customers: business profile, negotiated prices, credit terms, order history.
56. Support workspace: linked conversations, requests, resolution status.

## Shared sample scenarios

Use a consistent fixture throughout the journeys:
- Hex Head Bolt, M16 × 100 mm, metric coarse 2.0 mm pitch, partial thread, grade 8.8, zinc plated, ISO 4014, quantity 500 pieces.
- Matching M16 hex nut and plain washer.
- Five-line RFQ containing different sizes.
- Custom U-bolt with a sample dimension drawing.
- Partially available order and partial shipment.
- Quotation requiring a quantity revision and an expired quotation.

Mark all invented prices, stock figures, dates, documents, and certificates as demo/sample data. Do not imply certifications or engineering specifications have been verified. Ensure totals and quantities remain consistent across screens.

## Interaction and state rules

- Payments are made outside the app and manually confirmed by authorised staff. Do not include online payment gateways, card forms, UPI checkout, or a Pay now button.
- Submitting a payment reference or proof does not confirm receipt. Customers cannot mark orders paid; only staff verification changes verified amounts and payment status.
- Support partial payments, outstanding balances, duplicate-reference warnings, clarification, and corrected resubmission without duplicate orders. Preserve a traceable review history.
- Acknowledge orders immediately as awaiting payment verification. Release fulfilment only when staff verifies the amount required by agreed payment terms. Keep bank details and verification controls clearly identified as demo.
- Allow catalogue browsing before login; require simulated login for saving requirements, RFQs, and orders.
- Distinguish confirmed, estimated, and quotation-only prices.
- Label per-piece, per-pack, and per-kg amounts and explain GST/freight treatment.
- Require complete specifications before adding a purchasable variant.
- Preserve drafts during navigation and login.
- Review current prices and stock on reorder.
- Include loading, empty, error, validation, unavailable, and success states where relevant.
- Use mobile sticky purchase actions where helpful.
- Provide demo controls to preview important states without waiting for a backend.

## Connected journeys

1. Search → select product → cart → checkout → order acknowledgement → bank transfer instructions → submit payment reference → staff verifies receipt → payment confirmation.
2. Requirement list → RFQ → clarification → quotation → acceptance → order.
3. Custom drawing → technical review → revised drawing approval → quotation → order.
4. Order → shipment tracking → invoice/certificate download.
5. Previous order → reorder review → updated cart → checkout.

## Client approval presentation

Create a review view containing the visual direction, navigation/screen map, annotated sequences for all five journeys, customer mobile screens, desktop examples, admin workflows, and component showcase. Include a printable approval checklist for branding, navigation, product specifications, buying, RFQs, drawing approval, payments, and tracking. Allow local review notes and distinguish demo approval interactions from actual business approvals.

Mark barcode scanning, team purchasing approvals, and business credit as optional initial-release features. Show those screens for scope review without requiring production integrations.

Build working high-fidelity screens, rather than stopping at a plan or written descriptions. If output limits require batches, maintain one design system and shared state, complete all listed journeys, and record progress against the numbered screen checklist.
