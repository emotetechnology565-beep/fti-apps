export type SalesSummary = {
  id: string;
  rfq_no: string;
  status: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  item_count: number;
};
export type RfqItem = {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  qty: string;
  uom: string;
  requirements: string | null;
};
export type QuoteRevision = {
  id: string;
  revision_no: number;
  status: string;
  valid_until: string;
  subtotal: string;
  discount_total: string;
  gst_total: string;
  freight_total: string;
  grand_total: string;
  payment_terms: { text?: string };
  notes: string | null;
  accepted_at: string | null;
  items: { variant_id: string; sku: string; qty: string; uom: string; rate: string; line_total: string }[];
};
export type SalesDetail = SalesSummary & {
  buyer_id: string;
  business_id: string | null;
  delivery_address_id: string | null;
  notes: string | null;
  items: RfqItem[];
  quotations: { id: string; quote_no: string; status: string; current_revision: number; revisions: QuoteRevision[] }[];
  attachments: { id: string; mime_type: string; size_bytes: number; created_at: string }[];
};
