import { canViewPublicPrices, redactPublicPrices } from '@shared/lib/price-access';
import { groupTmtProducts } from '../model/tmt';
import { supabase } from '@core/api/supabase-client';
import type { CatalogImage, CatalogPage, Category, Product, Variant } from '../model/types';
import type { GradeSheet } from '../model/grade-sheet';
import type { SelectionOptions } from '../model/material-selection';
import type { ManualPreview, ManualRequest } from '../model/manual-material';

export type CatalogQuery = {
  search?: string;
  category?: string;
  size?: number;
  grade?: string;
  limit?: number;
  offset?: number;
  ids?: string[];
  groupTmt?: boolean;
  productKind?: Product['product_kind'];
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

export class CatalogRequestError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); }
  get rejected() { return !!this.code && ['22023', '42501', 'P0002', '23505', 'PGRST202', 'INVALID_OPERATION', 'UNAUTHENTICATED'].includes(this.code); }
}

async function catalogRpc<T>(operation: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Catalogue service is not configured.');
  const { data, error } = await supabase.functions.invoke('catalog', {
    body: { operation, arguments: args },
  });
  if (error) {
    let message = 'Catalogue service is unavailable. Please try again later.';
    let code: string | undefined;
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        code = typeof body.code === 'string' ? body.code : undefined;
        // Older deployed gateways reject these new operations before forwarding.
        // SQL functions enforce the same verified sign-in and staff MFA checks.
        if (body.code === 'INVALID_OPERATION' && rawMaterialOperations.has(operation)) {
          // The gateway rejected routing, but the fallback may reach the database.
          // A transport failure after that point is ambiguous, not a definite rejection.
          code = undefined;
          const result = await supabase.rpc(operation, args);
          if (result.error) {
            code = result.error.code;
            message = result.error.code === 'PGRST202'
              ? 'Raw-material ordering needs the latest database migration. Contact the FTI administrator.'
              : result.error.message;
          } else return (['fti_catalog_selection_options', 'fti_catalog_manual_preview'].includes(operation) ? (canViewPublicPrices() ? result.data : redactPublicPrices(result.data)) : result.data) as T;
        } else if (body.code === 'PGRST202') message = 'Material selection needs the latest database migration. Contact the FTI administrator.';
        else if (typeof body.message === 'string') message = body.message;
      } catch {
        // The gateway returned no structured error body.
      }
    }
    throw new CatalogRequestError(message, code);
  }
  return (['fti_catalog_list', 'fti_catalog_filtered_list', 'fti_catalog_product_get', 'fti_catalog_selection_options', 'fti_catalog_manual_preview'].includes(operation) ? (canViewPublicPrices() ? data.data : redactPublicPrices(data.data)) : data.data) as T;
}

const rawMaterialOperations = new Set([
  'fti_catalog_manual_preview', 'fti_catalog_manual_request_submit',
  'fti_catalog_selection_options', 'fti_catalog_selection_request_submit',
  'fti_catalog_selection_admin', 'fti_catalog_selection_spec_save', 'fti_catalog_selection_size_save', 'fti_catalog_selection_option_save',
  'fti_catalog_raw_order_submit', 'fti_catalog_raw_orders', 'fti_catalog_raw_recipients',
  'fti_catalog_raw_recipient_save', 'fti_catalog_raw_recipient_remove', 'fti_catalog_raw_delivery_replay',
]);

export const catalogApi = {
  rpc: catalogRpc,
  manualPreview: (material: string, size: string, grade: string, productId?: string) =>
    catalogRpc<ManualPreview>('fti_catalog_manual_preview', { p_material: material, p_size: size, p_grade: grade, p_product: productId || null }),
  submitManual: (id: string, request: ManualRequest, quantity: string, buyer: Record<string, unknown>) =>
    catalogRpc<{ id: string; reference: string; replayed: boolean }>('fti_catalog_manual_request_submit', { p_id: id, p_request: request, p_quantity: quantity, p_buyer: buyer }),
  selectionOptions: (category?: string, sizeId?: string, productId?: string) => catalogRpc<SelectionOptions>('fti_catalog_selection_options', {
    p_category: category || null, p_size_id: sizeId || null, p_product: productId || null,
  }),
  submitSelection: (id: string, optionId: string, quantity: string, buyer: Record<string, unknown>) =>
    catalogRpc<{ id: string; reference: string; replayed: boolean }>('fti_catalog_selection_request_submit', {
      p_id: id, p_option_id: optionId, p_quantity: quantity, p_buyer: buyer,
    }),
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
    const fetchPage = (offset: number, limit: number) => catalogApi.rpc<{
      items: RawProduct[];
      total: number;
      categories: Category[];
      grades?: string[];
    }>('fti_catalog_filtered_list', {
      p_search: query.search ?? '',
      p_category: query.category || null,
      p_limit: limit,
      p_offset: offset,
      p_size: query.size ?? null, p_grade: query.grade || null,
      p_ids: query.ids === undefined ? null : query.ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
    });
    let raw = await fetchPage(query.productKind ? 0 : query.offset ?? 0, query.productKind ? 50 : query.limit ?? 24);
    if (query.productKind) {
      // The deployed API has no kind parameter. Read its pages before filtering
      // so tab totals and pagination include matches beyond the first page.
      const all = [...raw.items];
      for (let offset = raw.items.length; offset < raw.total;) {
        const next = await fetchPage(offset, 50);
        if (!next.items.length) break;
        all.push(...next.items);
        offset += next.items.length;
      }
      const filtered = all.filter(item => item.product_kind === query.productKind);
      const matching = query.groupTmt ? groupTmtProducts(filtered) : filtered;
      const offset = query.offset ?? 0;
      raw = { ...raw, items: matching.slice(offset, offset + (query.limit ?? 24)), total: matching.length };
    }
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
