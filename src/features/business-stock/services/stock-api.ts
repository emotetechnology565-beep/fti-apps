import { supabase } from '@core/api/supabase-client';
import type { StockListing, StockFields, StockEnquiry, StockMessage, StockMediaKind, StockAsset } from '../model/types';

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Business stock is not configured.');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = 'Business stock service is unavailable. Please try again.';
    if (error.context instanceof Response) {
      try { const result = await error.context.json(); if (typeof result.message === 'string') message = result.message; } catch { /* No structured error. */ }
    }
    throw new Error(message);
  }
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'data')) throw new Error('Business stock returned an invalid response.');
  return data.data as T;
}
export const stockRpc = <T>(operation: string, args: Record<string, unknown> = {}) => invoke<T>('business-stock', { operation, arguments: args });
export const stockApi = {
  list: (scope: 'browse' | 'mine' | 'review', search = '', city = '', condition = '', offset = 0) =>
    stockRpc<StockListing[]>('fti_stock_list', { p_scope: scope, p_search: search, p_city: city, p_condition: condition, p_offset: offset }),
  detail: (id: string) => stockRpc<StockListing>('fti_stock_detail', { p_id: id }),
  save: (id: string, version: number, business: string, fields: StockFields) => stockRpc<string>('fti_stock_save', { p_id: id, p_version: version, p_business: business, p_fields: fields }),
  transition: (listing: StockListing, action: string, note = '') => stockRpc<null>('fti_stock_transition', { p_id: listing.id, p_version: listing.version, p_action: action, p_note: note }),
  enquire: (id: string, listing: string, quantity: string, message: string) => stockRpc<string>('fti_stock_enquire', { p_id: id, p_listing: listing, p_quantity: quantity, p_message: message }),
  enquiries: (scope: 'buyer' | 'seller' | 'staff', offset = 0) => stockRpc<StockEnquiry[]>('fti_stock_enquiries', { p_scope: scope, p_offset: offset }),
  thread: (id: string, offset = 0) => stockRpc<StockMessage[]>('fti_stock_thread', { p_id: id, p_offset: offset }),
  reply: (enquiry: StockEnquiry, messageId: string, body: string, close: boolean) => stockRpc<null>('fti_stock_reply', { p_id: enquiry.id, p_message_id: messageId, p_version: enquiry.version, p_body: body, p_close: close }),
  mediaList: (id: string, kind: StockMediaKind) => stockRpc<StockAsset[]>('fti_stock_media_list', { p_entity: id, p_kind: kind }),
  mediaUpload: (id: string, kind: StockMediaKind, mimeType: string, base64: string) => invoke<{id: string}>('business-stock-media', { operation: 'upload', entityId: id, kind, mimeType, base64 }),
  mediaDownload: (id: string) => invoke<{mimeType: string; base64: string}>('business-stock-media', { operation: 'download', assetId: id }),
  mediaRemove: (id: string, version: number) => stockRpc<null>('fti_stock_media_remove', { p_id: id, p_version: version }),
};
