export type OrderSummary = {
  id: string; order_no: string; status: string; grand_total: string; amount_due: string;
  created_at: string; updated_at: string; quotation_revision_id: string | null;
  reservation_expires_at: string | null;
};
export type OrderDetail = OrderSummary & {
  closure_note?: string | null;
  buyer_id: string; business_id: string | null; delivery_address_snapshot: {
    line1: string; line2: string | null; city: string; state: string; pincode: string;
  };
  subtotal: string; discount_total: string; gst_total: string; freight_total: string;
  loading_total: string; currency_code: string;
  items: { id: string; variant_id: string; sku: string; qty: string; uom: string;
    unit_price: string; line_total: string; reservation_expires_at: string | null }[];
  payments: { id: string; method: string; reference: string; amount: string; status: string;
    created_at: string; updated_at: string }[];
};
export type DeliveryAddress = { id: string; business_id: string | null; label: string;
  line1: string; city: string; state: string; pincode: string };
export type StockLocation = { id: string; code: string; name: string; city: string | null; is_active: boolean };
export type StockRow = { variant_id: string; sku: string; location_id: string; on_hand: string;
  reserved: string; available: string };
export type PaymentReview = { id: string; order_id: string; order_no: string; buyer_id: string;
  reference: string; amount: string; status: string; created_at: string };
export type CartOrderReview = {
  id: string; order_no: string; created_at: string; subtotal: string;
  delivery_address_snapshot: { line1: string; city: string; state: string; pincode: string };
  items: { id: string; name: string; sku: string; qty: string; uom: string; unit_price: string }[];
};
