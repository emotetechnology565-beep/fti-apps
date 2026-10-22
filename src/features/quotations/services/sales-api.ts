import { supabase } from '@core/api/supabase-client';
import type { SalesDetail, SalesSummary } from '../model/sales-types';

async function salesMedia<T>(operation: 'upload' | 'download' | 'category_upload' | 'category_download', args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Private document service is not configured.');
  const { data, error } = await supabase.functions.invoke('sales-media', { body: { operation, ...args } });
  if (error) {
    let message = 'Private document service is unavailable. Please try again.';
    if (error.context instanceof Response) {
      try { const body = await error.context.json(); if (typeof body.message === 'string') message = body.message; }
      catch { /* No structured error body. */ }
    }
    throw new Error(message);
  }
  return data.data as T;
}

export async function salesRpc<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Sales service is not configured.');
  const { data, error } = await supabase.functions.invoke('sales', { body: { operation, arguments: args } });
  if (error) {
    let message = 'Sales service is unavailable. Please try again.';
    if (error.context instanceof Response) {
      try { const body = await error.context.json(); if (typeof body.message === 'string') message = body.message; }
      catch { /* No structured error body. */ }
    }
    throw new Error(message);
  }
  return data.data as T;
}

export const salesApi = {
  categoryPdfs: () => salesRpc<CategoryPdf[]>('fti_sales_category_quote_catalog'),
  requestCategoryPdf: (requestId: string, category: string) => salesRpc<{ id: string; queued: boolean; replayed: boolean }>('fti_sales_category_quote_request', { p_request_id: requestId, p_category: category }),
  categoryRequests: (staff = false) => salesRpc<CategoryPdfRequest[]>('fti_sales_category_quote_requests', { p_staff: staff }),
  uploadCategoryPdf: (categoryId: string, base64: string) => salesMedia<{ id: string }>('category_upload', { categoryId, mimeType: 'application/pdf', base64 }),
  downloadCategoryPdf: (assetId: string) => salesMedia<{ mimeType: string; base64: string }>('category_download', { assetId }),
  mine: (offset = 0) => salesRpc<SalesSummary[]>('fti_sales_my', { p_offset: offset }),
  queue: (offset = 0) => salesRpc<SalesSummary[]>('fti_sales_queue', { p_offset: offset }),
  detail: (id: string) => salesRpc<SalesDetail>('fti_sales_detail', { p_id: id }),
  submit: (requestId: string, business: string | null, address: string | null, notes: string, items: { variant_id: string; qty: string; uom: string; requirements: string }[], sendCategoryPdfs = false) =>
    salesRpc<{ id: string; replayed: boolean }>('fti_sales_submit_with_pdfs', { p_request_id: requestId, p_business: business, p_address: address, p_notes: notes, p_items: items, p_send_category_pdfs: sendCategoryPdfs }),
  assign: (id: string, assignee: string) => salesRpc<void>('fti_sales_assign', { p_id: id, p_assignee: assignee }),
  quote: (id: string, validUntil: string, lines: { variant_id: string; rate: string }[], discount: string, gst: string, freight: string, terms: string, notes: string) =>
    salesRpc<{ quotation_id: string; revision_id: string; revision_no: number }>('fti_sales_quote', {
      p_rfq: id, p_valid_until: validUntil, p_lines: lines, p_discount: discount, p_gst: gst,
      p_freight: freight, p_terms: terms, p_notes: notes,
    }),
  revisionRequest: (quote: string, revision: number, reason: string) =>
    salesRpc<void>('fti_sales_revision_request', { p_quote: quote, p_revision: revision, p_reason: reason }),
  accept: (quote: string, revision: number) => salesRpc<void>('fti_sales_accept', { p_quote: quote, p_revision: revision }),
  uploadAttachment: (rfqId: string, mimeType: string, base64: string) =>
    salesMedia<{ id: string }>('upload', { rfqId, mimeType, base64 }),
  downloadAttachment: (assetId: string) =>
    salesMedia<{ mimeType: string; base64: string }>('download', { assetId }),
};

export type CategoryPdf = { id: string; name: string; asset_id: string | null; updated_at: string | null };
export type CategoryPdfRequest = { id: string; category: string; asset_id: string | null; created_at: string; buyer_phone: string | null; delivery_status: string };
