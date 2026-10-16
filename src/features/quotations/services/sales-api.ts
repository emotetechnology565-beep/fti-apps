import { supabase } from '@core/api/supabase-client';
import type { SalesDetail, SalesSummary } from '../model/sales-types';

async function salesMedia<T>(operation: 'upload' | 'download', args: Record<string, unknown>): Promise<T> {
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
  mine: (offset = 0) => salesRpc<SalesSummary[]>('fti_sales_my', { p_offset: offset }),
  queue: (offset = 0) => salesRpc<SalesSummary[]>('fti_sales_queue', { p_offset: offset }),
  detail: (id: string) => salesRpc<SalesDetail>('fti_sales_detail', { p_id: id }),
  submit: (requestId: string, business: string | null, address: string | null, notes: string, items: { variant_id: string; qty: string; uom: string; requirements: string }[]) =>
    salesRpc<{ id: string; replayed: boolean }>('fti_sales_submit', { p_request_id: requestId, p_business: business, p_address: address, p_notes: notes, p_items: items }),
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
