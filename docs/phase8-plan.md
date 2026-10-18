# Phase 8 - Business stock selling

Status: implemented and deployed, as reported by the owner on 17 October 2026. Both Edge Functions return the expected function-level 401 for anonymous requests. Signed-in seller/buyer/staff flows and installed-device acceptance remain pending. See [deployment guide](phase8-deployment.md).

## Purpose

Allow verified businesses to offer their available steel stock for sale, with FTI review and buyer enquiries.

## Implemented scope

- Stock navigation dropdown: let users switch between **FTI stock** (our stock) and **Business stock** (stock uploaded by businesses). Keep the two listing views separate.
- Ownership labels: business listings must visibly show **Business stock** and the selling business's name so buyers can identify who owns the material. FTI stock must be clearly identified as FTI-owned stock.
- Seller workspace: create and edit stock submissions, view review feedback, update availability, withdraw listings and mark stock sold.
- Listing details: material, grade, dimensions/specification, condition, available quantity and unit, asking price and pricing unit, stock location and seller notes.
- Media: photos and certificates are encrypted in the existing Bunny zone. Signed-in buyers can view photos on approved available listings; certificates are restricted to the seller, MFA reviewers and buyers who have submitted an enquiry.
- Review: authorized FTI staff approve or reject submissions with feedback. Published edits become drafts and require another review. Staff cannot approve their own listing.
- Buyer discovery: browse and filter approved available listings, inspect material details and send a quantity-based enquiry.
- Enquiry tracking: buyers and sellers see only their own enquiries; authorized FTI staff handle reviews and oversight.
- Listing lifecycle: draft, submitted, published, rejected, withdrawn and sold. Sellers enter an explicit future availability expiry. Expired listings disappear from buyer discovery and reject new enquiries. Withdrawn stock can be edited back into a draft; sold stock cannot reopen.

## Decisions required

1. Do transactions go through FTI or directly between businesses?
2. Who issues quotations, receives payment, issues invoices and fulfils orders?
3. Are there listing fees, commissions or seller restrictions?
4. What commercial stock guarantees, expiry limits, GST, freight, returns and dispute rules should apply before transaction automation?

Current disclosure is limited to the seller's legal business name, material details, asking price, coarse stock location, approved photos, and enquiry-scoped certificates. Personal phone numbers and email addresses are not exposed through listings. This phase records enquiries without reserving stock or creating orders.

## Implementation constraints

- Reuse verified business membership and staff authorization with MFA.
- Keep seller listings distinct from FTI-owned catalogue inventory and orders until the commercial model is approved.
- Use the dedicated `src/features/business-stock` folder and additive Phase 8 migrations.
- Enforce seller ownership, enquiry privacy, review history and concurrent availability updates on the server.
- Use Bunny for media and documents; do not use Supabase Storage.
- Create no demo listings, users, prices or stock.

## Acceptance criteria

- The stock navigation dropdown switches between FTI stock and business-uploaded stock without mixing their results.
- Business stock cards and detail screens clearly identify the material as business-owned and display the seller's business name.
- Unverified businesses cannot submit sell listings.
- A seller cannot read another seller's private drafts or change their listings.
- Only approved available listings appear in buyer discovery; withdrawn or sold listings cannot receive new enquiries.
- Buyers can track their own enquiries and cannot access another buyer's conversations.
- Staff review and changes to listing status are audited.
- Editing, moderation and stock updates cannot silently overwrite newer changes.
- Mobile and web flows handle empty states, failures and permission changes.

Deployment instructions are in [phase8-deployment.md](phase8-deployment.md). Automated checks use isolated local database and browser fixtures. They do not create remote listings, accounts or messages, and do not prove dashboard deployment or installed-device acceptance.
