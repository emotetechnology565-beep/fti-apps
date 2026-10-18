export type StockStatus = 'draft' | 'submitted' | 'published' | 'rejected' | 'withdrawn' | 'sold';
export type StockUnit = 'kg' | 'tonne' | 'piece' | 'metre';
export type StockFields = {
  material: string; grade: string; specification: string; condition: 'new' | 'surplus' | 'used';
  quantity: string; uom: StockUnit; asking_price: string; price_unit: StockUnit;
  city: string; state: string; pincode: string; notes: string; available_until: string;
};
export type StockListing = StockFields & {
  id: string; business_id: string; business_name: string; status: StockStatus;
  version: number; available: boolean; is_seller: boolean; updated_at: string;
  review_note?: string | null;
  can_certificates?: boolean;
};
export type StockEnquiry = {
  id: string; listing_id: string; material: string; business_name: string; buyer_name: string;
  quantity: string; uom: StockUnit; status: 'open' | 'closed'; version: number;
  is_buyer: boolean; is_seller: boolean; updated_at: string; listing_snapshot: StockListing;
};
export type StockMessage = { id: string; body: string; is_mine: boolean; author_name: string; created_at: string };
export type StockMediaKind = 'stock_photo' | 'stock_certificate';
export type StockAsset = { id: string; mime_type: string; size_bytes: number; created_at: string };
export const stockUnits: StockUnit[] = ['kg', 'tonne', 'piece', 'metre'];
export const editableStock = (status: StockStatus) => ['draft', 'rejected', 'withdrawn', 'published'].includes(status);
export const newStockId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const n = Math.floor(Math.random() * 16); return (ch === 'x' ? n : (n & 3) | 8).toString(16);
});
