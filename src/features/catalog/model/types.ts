export type Category = { id: string; slug: string; name: string };
export type CatalogImage = { id: string; product_id: string; url: string; mime_type: string };
export type Variant = {
  id: string;
  sku: string;
  size_label: string | null;
  diameter_mm: number | null;
  length_mm: number | null;
  uom: 'kg' | 'MT' | 'piece' | 'box' | 'bundle';
  min_order_qty: number;
  pack_qty: number | null;
  attributes: Record<string, unknown>;
};
export type Product = {
  id: string;
  category_id: string;
  category: string;
  slug: string;
  name: string;
  description: string | null;
  product_kind: 'steel' | 'fastener' | 'tractor_part' | 'other';
  purchase_mode: 'rfq' | 'direct' | 'both';
  status: 'draft' | 'published' | 'archived';
  variants: Variant[];
  images: CatalogImage[];
  // Transitional read fields used by the unfinished pricing and cart phases.
  grade: string;
  brand: string;
  size: string;
  unit: Variant['uom'];
  moq: number;
  tag: string;
  stock?: number;
  rate?: number;
  previous?: number;
  market?: string;
};
export type CatalogPage = {
  items: Product[];
  total: number;
  categories: Category[];
};
