# Product reference charts

The four supplied PDFs are available as searchable reference charts on matching existing product families. The same charts can be opened from **Staff console → FTI catalogue → View reference charts**, including draft products.

| Existing product slug | References shown |
| --- | --- |
| `full-thread-hex-screw` | Bolt dimensions; metric and UNC bolt/nut weight charts |
| `half-thread-hex-bolt` | Bolt dimensions; metric and UNC bolt/nut weight charts |
| `plain-washers` | Separate plain and machined washer rows from IS:2016 |
| `spring-washers` | Spring washer rows from IS:3063 |

The data contains 15 dimensional entries, 390 metric bolt/nut entries, 421 UNC bolt/nut entries and 119 washer/lock-nut entries. The full washer source is preserved, but only applicable groups appear on matched products. Ordinary hex-nut weights are not assigned to HSFG nuts; generic steel values are not assigned to stainless, galvanized, socket-head, foundation bolt or agricultural products. Matching currently uses the imported product slugs.

Dimensions are in millimetres. Weights are approximate kilograms per 1,000 pieces. Nuts and bolts are separate chart groups; weights are not treated as assembled bolt-and-nut sets. Each independently printed chart block uses its own length column. Blank cells have no record and are never interpolated.

Original figures remain unchanged. Review notes flag M20 × 100 mm, M6 × 35/40 mm, the M24 head-thickness range, and the taper-washer M8/M10 pattern. The source's blank b1 values remain blank. The listed standards are transcribed from the PDFs; this feature does not certify current standards compliance or the weight/finish of stocked products.

Each chart includes its source filename, page, SHA-256 and an **Open original PDF** button. All four source PDFs were uploaded to the existing Bunny zone at content-addressed `product-documents/fasteners/<sha256>/…` paths and verified against the original bytes through the public CDN. No storage credentials are shipped to the app.

This is an app update with public PDF assets. It needs no SQL migration or Edge Function deployment. Existing product records, variants, publication status, inventory, prices and minimum orders are untouched. Install/reload the updated app to see the charts. The public catalogue returned zero published products during verification; staff can preview the matching imported records without publishing them.

Regenerate offline with `python scripts/prepare-fastener-references.py` (requires `pdfplumber`). Use `--upload` to publish and verify revised source PDFs with the existing ignored `.env` Bunny credentials. Only links verified for the matching source hash are retained during offline regeneration.

Validation: source hashes, chart-block alignment, mixed inch fractions, units, omission of blank cells, questionable values and product/type matching are covered by `tests/product-references.test.ts`. The browser regression in `scripts/product-references-browser.py` covers public product views, staff preview, mobile layout, search and source labels using mocked APIs.
