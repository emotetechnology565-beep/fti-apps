# FTI raw material screen generation prompt

Copy the prompt below into a coding or design tool to generate a working visual prototype for client approval.

---

Build a complete, connected, high-fidelity coded prototype for FTI’s raw material procurement platform, for client review and approval.

## Purpose

Create actual runnable screens with realistic sample data and working navigation. Show the complete journey from selecting a material, size, and grade to checking rates, requesting a quotation, placing an order, and tracking delivery.

## Platforms

- Mobile-first customer app: 390 px reference width.
- Responsive customer website: 1440 px reference width.
- Desktop admin dashboard: 1440 px reference width.
- Show mobile and desktop layouts for the main customer journeys.

## Project constraints

If working inside the FTI repository:
- Read the project instructions and existing implementation first.
- Use Expo, React Native, TypeScript, and Expo Router.
- Check the installed Expo version and matching official documentation before using platform APIs.
- Reuse existing components, brand assets, and dependencies.
- Keep demo screens isolated from production workflows.
- Use mock data and simulated payments, uploads, notifications, and approvals.
- Run lint and typecheck before completion.

## Visual direction

Use a professional industrial identity with clear typography, product photography, cross-section illustrations, readable specification tables, and restrained colours.

Use existing FTI branding. If unavailable, propose navy, white, steel grey, and orange for primary actions.

Prioritise material selection, transparent units, clear pricing conditions, availability, and delivery information.

## Material categories

Use FTI’s existing catalogue as the source of truth. Core examples:
- Round bright bars
- As-rolled round bars
- Square bars
- Flat bars
- Steel sheets and plates
- Roofing sheets

Only include additional categories such as pipes, structural sections, or TMT bars when supported by the catalogue. Treat advertised ranges as supply capabilities, not proof of stock availability.

## Customers

1. Workshop buyer ordering standard material.
2. Procurement manager requesting multiple grades and sizes.
3. Fabricator requiring cut lengths or cut sheets.
4. Contractor arranging bulk delivery.
5. Returning business customer reordering.

## Navigation

Mobile: Home, Materials, Requirements, Orders, Account.
Keep search, cart, weight calculator, and support easy to access.

## Customer screens

### A. Discovery and selection

01. Raw materials home: search, categories, rates, recent purchases, and bulk enquiry.
02. Category browser: photographs and cross-section illustrations.
03. Search: material names, aliases, grades, sizes, and product codes.
04. Search results: dimensions, grade, condition, selling unit, availability, and pricing status.
05. Filters: category, grade, dimensions, condition, finish, brand/mill, location, and availability.
06. Guided selection: category → size → grade → available supply option → quantity → review.
07. Product detail: images, specifications, dimensional illustration, rates, documents, and purchasing actions.
08. Grade information: supplied grade description and documents; do not invent equivalence claims.
09. Material comparison: compare dimensions, grade, condition, unit, price basis, and lead time.
10. Reference viewer: dimension charts, weight tables, and technical documents.

Category-specific selection:
- Round bars: diameter × length, grade, bright/as-rolled condition.
- Square bars: side × side × length, grade.
- Flat bars: width × thickness × length, grade.
- Sheets/plates: thickness × width × length, grade and condition.
- Roofing sheets: profile, thickness, overall/effective cover width, length, substrate, coating, colour, and quantity.

Use explicit dimension labels and units. Changing category or size must clear incompatible downstream selections.

### B. Weight and pricing

11. Weight calculator: shape, dimensions, material density or reference basis, quantity, and estimated total weight.
12. Rate overview: category/grade rates, price unit, applicable location, and last updated time.
13. Price-access state: signed-out, authorised, or subscription-required views matching FTI’s existing access rules.
14. Price breakdown: base amount, applicable extras, processing, tax, freight, and total.
15. Quantity/unit selection: kg, MT, pieces, or bundles where supported.
16. Availability detail: selected grade/size, stock or enquiry status, dispatch estimate, and minimum quantity.

Pricing rules:
- Clearly distinguish ₹/kg, ₹/MT, ₹/piece, and ₹/bundle.
- Use 1 MT = 1,000 kg consistently.
- Never calculate a piece price without a stated weight basis.
- Show whether weight is theoretical, reference-based, or actual.
- Distinguish an indicative rate from a confirmed quotation.
- Explain whether GST, freight, loading, unloading, and processing are included, excluded, or pending confirmation.
- Do not add charges already included in the displayed rate.
- If final billing depends on actual dispatched weight, show this before order confirmation.
- Never silently replace an accepted quotation with a newer market rate.

### C. Direct purchase

17. Cart: material lines, dimensions, grade, quantity/unit, estimated weight, and pricing conditions.
18. Login/business registration: simulated phone verification, company details, and GST information.
19. Delivery address: pincode, site contact, vehicle access, unloading arrangements, and instructions.
20. Delivery options: available transport methods, estimated freight, and delivery timing.
21. Order review: complete specifications, quantities, weight basis, charges, and terms.
22. Bank transfer instructions: payable amount, beneficiary, bank/account details, IFSC, order reference, and instructions for paying outside the app by NEFT/RTGS/bank transfer. Use clearly labelled demo bank details.
23. Payment submission and review: enter UTR/transaction reference, transfer date and amount, optionally attach proof, and view Awaiting payment, Submitted for verification, Partially verified, Verified, or Clarification required states.
24. Order acknowledgement: order number and payment verification status. After staff confirms receipt, show the confirmed amount, balance due, next steps, and dispatch estimate.

### D. Bulk quotation

25. Multi-item requirement list: different categories, dimensions, grades, and quantities.
26. Spreadsheet upload: sample template, recognised rows, and editable preview.
27. Requirement validation: missing grade, ambiguous units, unsupported sizes, and unmatched products.
28. Manual material enquiry: specify an unavailable or unlisted requirement.
29. Submit RFQ: delivery location, required date, mill preference, certificates, attachments, and notes.
30. RFQ tracking: submitted, under review, clarification requested, quoted, and closed.
31. Clarification conversation: messages and attachments linked to individual requirement lines.
32. Quotation detail: rates, quantities, weight basis, processing, freight, tax, validity, and delivery commitments.
33. Quotation revision: change quantities, sizes, or delivery requirements.
34. Accept quotation: approve selected lines, confirm terms, optionally attach a PO, and proceed to order.
35. Expired quotation: show expiry and request refreshed rates.

### E. Cutting and special supply

36. Processing requirement: cut-to-length bars or cut-to-size sheets where offered.
37. Cutting schedule: dimensions, number of pieces, tolerances, and notes.
38. Drawing upload: sample PDF, image, or CAD attachment.
39. Processing summary: requested output, estimated material usage, cutting charges, and items requiring confirmation.
40. Technical clarification: supplier questions and proposed revisions.
41. Drawing/cutting schedule approval: revision history and explicit approval before processing.

Do not promise cutting capability, tolerances, yield, or scrap treatment without supplier confirmation. If scrap ownership, kerf allowance, or minimum processing charges apply, make them visible in the quotation.

### F. Orders and repeat purchases

42. Order list: active, completed, payment pending, and cancelled.
43. Order detail: approved specifications, quantities, weight basis, payment, and fulfilment.
44. Dispatch detail: actual dispatched quantities/weights, partial dispatches, and vehicle/transporter details.
45. Delivery tracking: timeline, tracking reference, delivery contact, and delivery acknowledgement.
46. Documents: quotation, invoice, delivery challan, applicable weight slip, and material test certificate.
47. Reorder review: compare previous requirements with current rates, availability, and delivery terms.
48. Saved requirement lists: recurring grades, sizes, and procurement projects.

### G. Account and support

49. Business account: company, GST, contacts, and saved addresses.
50. Invoices and payment history.
51. Support request: linked to an order, RFQ, material, or delivery.
52. Notifications and preferences.

## Admin screens

53. Dashboard: enquiries, quotations, orders, payments, and dispatches needing attention.
54. Material catalogue management: categories, grades, dimensions, conditions, images, and documents.
55. Availability management: grade/size combinations, supply location, quantity/unit, and lead time.
56. Rate management: price basis, effective date, tax treatment, extras, and customer-specific rates.
57. RFQ inbox: customer, category, urgency, status, and assigned staff.
58. RFQ workspace: requirement validation, attachments, clarification, and sourcing notes.
59. Quotation editor: line rates, units, estimated weights, processing, freight, tax, validity, and terms.
60. Cutting/processing review: schedule, drawing revision, charges, and customer approval.
61. Order management: accepted specifications, procurement, fulfilment, and a manual payment review workspace. Compare submitted references/proof with bank receipt records; authorised staff records verified amounts, date, reviewer, and notes, or requests clarification. Show payment history and outstanding balance.
62. Dispatch creation: quantities, actual weights, partial supply, transporter, vehicle, and documents.
63. Weight reconciliation: estimated versus dispatched weight and resulting billing adjustment where applicable.
64. Customer management: account details, negotiated rates, credit terms, and purchase history.
65. Support workspace: linked conversations, delivery issues, and resolution status.

## Sample scenarios

Use consistent mock data across screens:
- EN-8 round bright bar, 40 mm diameter × 3,000 mm length, 20 pieces.
- Square bar, 50 × 50 mm × 6,000 mm, grade to be selected.
- Flat bar, 50 × 10 mm × 6,000 mm.
- Steel sheet, 6 × 1,250 × 2,500 mm.
- Roofing sheet with explicit profile, thickness, length, and effective cover width.
- Five-line RFQ with mixed materials and grades.
- One unavailable size requiring manual enquiry.
- One cut-to-length order with an approval revision.
- One partial dispatch with a difference between estimated and actual weight.

Treat these as demo requirements, not confirmed catalogue availability. Label all invented rates, stock, dates, certificates, and documents as sample data.

## Interaction rules

- Payments are made outside the app and manually confirmed by authorised staff. Do not include online payment gateways, card forms, UPI checkout, or a Pay now button.
- Submission of a reference or receipt is not confirmation of funds received. A customer cannot mark an order paid. Only staff verification changes the verified amount and payment status.
- Support partial payments, outstanding balances, duplicate-reference warnings, clarification, and corrected resubmission without duplicate orders. Keep a review history; corrections must remain traceable.
- Acknowledge the order immediately as awaiting payment verification. Release fulfilment only after staff verifies the amount required by the agreed payment terms. Label all verification controls and bank details as demo in the prototype.
- Allow browsing before login.
- Preserve requirements through navigation and simulated login.
- Enable Add to cart only for complete, priced, purchasable selections.
- Provide Request quotation for custom, bulk, unavailable, or unpriced requirements.
- Show unavailable grade/size combinations clearly.
- Apply minimum quantities only to the supply options they belong to; do not apply a special-grade minimum to every product.
- Require a reason and confirmation for customer-requested substitutions.
- Provide loading, empty, validation, error, unavailable, and success states.
- Use accessible forms and readable responsive tables.
- Include local demo controls and a reset action.

## Connected prototype journeys

1. Browse → select category/size/grade → quantity → cart → checkout → order acknowledgement → bank transfer instructions → submit payment reference → staff verifies receipt → payment confirmation.
2. Multi-item requirements → RFQ → clarification → quotation → acceptance → order.
3. Cut-to-size enquiry → drawing/schedule review → revision approval → quotation → order.
4. Order → partial dispatch → actual-weight review → documents → delivery.
5. Previous order → current rate/availability review → reorder.

## Client review deliverables

Create:
- A gallery linking to all 65 numbered screens.
- A navigation and screen map.
- Five fully connected journeys with shared mock state.
- Mobile and desktop examples.
- An annotated presentation view explaining important decisions.
- A reusable component showcase.
- An approval checklist for branding, material selection, units, weight, rates, quotations, processing, payment, and delivery.
- Run instructions and a screen completion checklist.

Mark business credit, advanced processing optimisation, and additional approval roles as optional initial-release features.

Generate working high-fidelity screen code, not only descriptions or wireframes. If building in batches, keep one design system, preserve shared state, and track completion against every numbered screen.
