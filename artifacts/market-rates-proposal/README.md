# FTI Market Rates — client review proposal

Share `fti-market-rates-flow.svg` (scalable with clickable references) or `fti-market-rates-flow.png`.

Suggested message:

“Please review our proposed Market Rates flow. Admins can quickly update prices and publish dated records, while customers can view the latest prices and earlier updates. Please confirm the six questions shown in the diagram, especially the pricing formula, rolling price definition and customer visibility. Let us know any changes you would like before we finalize the scope.”

The base rate example comes from market.txt; added adjustments, rolling charges, profit, final selling prices and additional history entries are illustrative. The source report does not define a rolling charge or profit. Presets, bulk updates, publication rules, permissions and correction history are proposals for client review. No app implementation is included.

Reference pages reviewed on 30 October 2026:

- https://www.bigmint.co/prices/detail — timeline, from/to date selection, comparisons and chart options.
- https://www.bigmint.co/historical-data — historical commodity prices and downloadable data.
- https://www.steelorbis.com/steel-prices/steel-price-analysis/ — historical price trends, product/location selection and comparisons over selected periods.

References establish customer-facing history patterns, not evidence of their private admin workflows. No integration or automatic data feed is proposed.

Design direction: a navy title band, teal directional arrows and warm confirmation notes distinguish the proposed flow from unresolved business rules. Consistent spacing and restrained type keep the sequence readable as a single shareable sheet.

To regenerate: `python artifacts/market-rates-proposal/generate.py`, then `python artifacts/market-rates-proposal/preview.py`.
