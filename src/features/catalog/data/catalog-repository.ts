import { supabase } from '@core/api/supabase-client';
import type { CatalogImage, CatalogPage, Category, Product, Variant } from '../model/types';
import type { GradeSheet } from '../model/grade-sheet';

export type CatalogQuery = {
  search?: string;
  category?: string;
  size?: number;
  grade?: string;
  limit?: number;
  offset?: number;
  ids?: string[];
};
export interface CatalogRepository {
  readonly scope: string;
  listProducts(query?: CatalogQuery): Promise<CatalogPage>;
  getProduct(id: string): Promise<Product | null>;
}

type RawVariant = Omit<Variant, 'id'> & { id?: string };
type RawProduct = Omit<Product, 'grade' | 'brand' | 'size' | 'unit' | 'moq' | 'tag' | 'images'> & {
  variants: RawVariant[];
};
function mapProduct(raw: RawProduct): Product {
  const variants = raw.variants.map((variant, index) => ({
    ...variant,
    id: variant.id ?? `${raw.id}-variant-${index}`,
  })) as Variant[];
  const first = variants[0];
  const attributes = first?.attributes ?? {};
  const text = (key: string) => {
    const value = attributes[key];
    return typeof value === 'string' ? value : '';
  };
  return {
    ...raw,
    variants,
    images: [],
    grade: text('grade'),
    brand: text('brand'),
    size: first?.size_label ?? '',
    unit: first?.uom ?? 'kg',
    moq: first?.min_order_qty ?? 1,
    tag: text('certification'),
  };
}

async function catalogRpc<T>(operation: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Catalogue service is not configured.');
  const { data, error } = await supabase.functions.invoke('catalog', {
    body: { operation, arguments: args },
  });
  if (error) {
    let message = 'Catalogue service is unavailable. Please try again later.';
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body.message === 'string') message = body.message;
      } catch {
        // The gateway returned no structured error body.
      }
    }
    throw new Error(message);
  }
  return data.data as T;
}

export const catalogApi = {
  rpc: catalogRpc,
  admin: () => catalogRpc<AdminCatalog>('fti_catalog_admin_list'),
  gradeSheet: (categoryId: string) => catalogRpc<GradeSheet | null>('fti_catalog_grade_sheet_get', { p_category: categoryId }),
  saveGradeSheet: (categoryId: string, revision: number | null, sheet: Pick<GradeSheet, 'product_kind' | 'uom' | 'min_order_qty' | 'rows' | 'gst_included' | 'gst_rate'>) =>
    catalogRpc<GradeSheet>('fti_catalog_grade_sheet_save', { p_category: categoryId, p_revision: revision, p_sheet: sheet }),
  publishGradeSheet: (categoryId: string, revision: number) =>
    catalogRpc<GradeSheet>('fti_catalog_grade_sheet_publish', { p_category: categoryId, p_revision: revision }),
  saveCategory: (category: Record<string, unknown>) =>
    catalogRpc<string>('fti_catalog_category_upsert', { p_category: category }),
  saveProduct: (product: Record<string, unknown>, variants: Record<string, unknown>[]) =>
    catalogRpc<string>('fti_catalog_product_upsert', {
      p_product: product,
      p_variants: variants,
    }),
  setProductStatus: (id: string, status: Product['status']) =>
    catalogRpc<void>('fti_catalog_product_status', { p_id: id, p_status: status }),
  publicImages: (ids: string[]) => catalogRpc<CatalogImage[]>('fti_catalog_media_public', { p_product_ids: ids }),
  adminImages: (id: string) => catalogRpc<CatalogImage[]>('fti_catalog_media_admin', { p_product_id: id }),
  async media<T>(operation: 'upload' | 'remove', args: Record<string, unknown>): Promise<T> {
    if (!supabase) throw new Error('Image service is not configured.');
    const { data, error } = await supabase.functions.invoke('catalog-media', { body: { operation, ...args } });
    if (error) {
      let message = 'Image service is unavailable. Please try again.';
      if (error.context instanceof Response) {
        try { const body = await error.context.json(); if (typeof body.message === 'string') message = body.message; }
        catch { /* No structured error body. */ }
      }
      throw new Error(message);
    }
    return data.data as T;
  },
};

export type AdminVariant = Variant & { is_active: boolean };
export type AdminProduct = Omit<Product, 'variants' | 'images'> & { variants: AdminVariant[] };
export type AdminCategory = Category & {
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};
export type AdminCatalog = { categories: AdminCategory[]; products: AdminProduct[] };

export const supabaseCatalogRepository: CatalogRepository = {
  scope: 'supabase-catalog-v1',
  async listProducts(query = {}) {
    const raw = await catalogApi.rpc<{
      items: RawProduct[];
      total: number;
      categories: Category[];
      grades?: string[];
    }>('fti_catalog_filtered_list', {
      p_search: query.search ?? '',
      p_category: query.category || null,
      p_limit: query.limit ?? 24,
      p_offset: query.offset ?? 0,
      p_size: query.size ?? null, p_grade: query.grade || null,
      p_ids: query.ids === undefined ? null : query.ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
    });
    const images = raw.items.length ? await catalogApi.publicImages(raw.items.map(item => item.id)) : [];
    return {
      items: raw.items.map(item => ({ ...mapProduct(item), images: images.filter(image => image.product_id === item.id) })),
      total: raw.total,
      categories: raw.categories,
      grades: raw.grades ?? [],
    };
  },
  async getProduct(id) {
    const raw = await catalogApi.rpc<RawProduct | null>('fti_catalog_product_get', {
      p_id: id,
    });
    if (!raw) return null;
    const images = await catalogApi.publicImages([raw.id]);
    return { ...mapProduct(raw), images };
  },
};

export { unconfiguredCatalogRepository } from './unconfigured-catalog-repository';
