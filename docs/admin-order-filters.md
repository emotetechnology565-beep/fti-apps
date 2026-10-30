Admin order filters
===================

Apply `supabase/migrations/202610300004_admin_order_filters.sql` after the request
fulfillment migration. It adds status-filtered RPC overloads for raw material,
fastener and dispatch orders. Existing one-argument RPCs remain available for older
app versions. The new app sends `p_status` and `p_offset`.

Filters run before pagination, retain staff permission checks and reset pagination
when a different status is selected. Requests without a fulfillment record appear
under Awaiting confirmation. `shipped` is labelled Dispatched in the interface.

Material and fastener rows start collapsed. Select the row header to reveal buyer
and delivery information, specifications and the fulfillment timeline. Drawing and
notification details have a separate disclosure inside the expanded order.

Validation: PGlite tests verify filtered pagination and authorization. The isolated
Playwright script `scripts/admin-order-filters-browser.py` mocks service responses
and checks filters and disclosure controls at 390px and 1440px.
