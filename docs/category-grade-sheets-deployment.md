# Category grade-list publishing

The catalogue now offers a reusable category-first form for Fasteners, six steel
categories, and future categories. Create a category once; select it to add
brands/grades, base price, BASE charge, profile, rolling and size-group additions.
Serial numbers and net prices are calculated. All amounts use the explicitly
selected INR price unit. Enter 0 for a charge that does not apply; blank amounts
remain incomplete drafts.

## Deployment

1. Apply `supabase/migrations/202610220001_category_grade_sheets.sql` after the
   existing identity, catalogue and pricing migrations. It is safe to reapply.
   Then apply `supabase/migrations/202610220002_catalogue_filters.sql` for the
   category, size and grade filters, followed by
   `supabase/migrations/202610220003_material_categories.sql` to create Round Bar —
   As Rolled, TMT and Bright Bar in the catalogue category selector. Then apply
   `supabase/migrations/202610220004_round_bar_sheet_data.sql` to publish the 34
   Round Bar grades from the supplied workbook, with both size groups and prices
   in INR per MT. This migration leaves an existing Round Bar grade sheet alone.
   Finally apply `supabase/migrations/202610220005_shared_steel_categories.sql`
   to configure As Rolled Round Bar, Round Bright Bar, Flat, Sheet, Square and TMT
   Bar, with shared size/grade filter lists.
2. Redeploy the `catalog` Edge Function from `supabase/functions/catalog/index.ts`.
   It includes the three new authenticated sheet RPC operations and the public
   filtered catalogue operation.
3. Deploy the updated Expo application using the project's normal release process.

The Round Bar migration imports grade names and prices from the workbook. The
workbook's Base Price cells are blank, so customers see “Not specified in sheet”
for Base Price; its net prices still follow the workbook totals, with blank rolling
cells treated as zero. The workbook itself is unchanged. Existing products,
including HEX SCREW, are unaffected.

## Staff workflow

- Open FTI catalogue, create or select a category, and choose the product type,
  price unit and minimum order quantity. The six steel categories use PMT prices;
  PMT is stored as MT in the catalogue unit field.
- Add the category's brands/grades and one or more size groups per entry. Size
  groups are labels and can describe a range, a particular size, or "All sizes".
- Save the list draft. Incomplete monetary fields are allowed at this step.
- Review publication, then publish. A positive base price and explicit amounts
  for all other charges are required. Zero is accepted for non-applicable charges.
- Each category's published list appears as one catalogue product with a variant
  for each brand/grade and size group. SKUs are generated automatically.
- Later edits remain private until published. Removed size groups become inactive;
  their IDs are retained for historical quotation references.
- Use the existing product Unpublish/Archive controls to withdraw a published list.

## Pricing and access

Net price = base price + BASE charge + profile + rolling.
The published price for a size group = net price + that group's addition.
The database recalculates prices and ignores client-supplied totals.

Cost components are stored in an RLS-protected private sheet table. Public catalogue
responses contain grade, size group, base price, net list price and publication time.
Customers see only Base Price and Net Price as monetary fields. BASE charge,
profile, rolling and individual size additions remain private.
Staff require MFA and both catalogue and pricing management permissions to edit;
publication also requires pricing publication permission. Revision checks prevent
stale edits overwriting a colleague's changes.

These are catalogue list prices for quotation-based products. They do not create
market-specific entries on the existing Rates screen or change quotation/order
totals automatically. Staff still confirm the final selling price, GST and freight
through the existing quotation workflow. No automatic WhatsApp or Excel import
is introduced by this change.

## Validation

- `npm run lint`
- `npm run typecheck`
- `node --import tsx --test tests/grade-sheet.test.ts tests/grade-sheet-db.test.ts tests/architecture.test.ts`
- `npm run build`
- `python scripts/grade-sheet-browser.py <preview-port>` against a local web export;
  backend calls are mocked, so the acceptance check makes no live changes.
- `node --import tsx --test tests/catalog-filters-db.test.ts`
- `python scripts/catalog-filters-browser.py <preview-port>`

## Customer filters

The catalogue filters appear in the order Category, Size, Grade. Choose a category
to enable size and grade. The six steel categories share the sizes and grades from
the workbook; selecting a category, size and grade still returns only that category's
published matching variants. Changing category clears size and grade; changing size
clears grade. "All sizes" and "All grades" allow broader browsing. Search and
saved-product filtering still apply.

The size picker contains the listed sizes from 8 to 80 mm, not every integer in that
range. Exact variant diameters take precedence. Size-group labels such as `16MM TO 50MM`,
`53-80 mm`, `20 mm`, and `All sizes` are supported. Unknown labels do not match an
exact size. A size group can cover only the sizes in the shared list.
Filtering happens before pagination and returns only matching variants. Selected
size/grade carry into the product detail page, with a Show all variants control.
