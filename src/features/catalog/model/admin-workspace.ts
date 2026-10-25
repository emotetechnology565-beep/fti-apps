import type { AdminCategory, AdminProduct } from '../data/catalog-repository';

export const catalogSections = [
  { kind: 'steel', label: 'Raw Materials' },
  { kind: 'fastener', label: 'Fasteners' },
  { kind: 'tractor_part', label: 'Tractor Parts' },
  { kind: 'other', label: 'Other' },
] as const;
export type CatalogSection = AdminProduct['product_kind'];
export type ProductStatusFilter = 'all' | AdminProduct['status'];

export function workspaceCategories(
  categories: AdminCategory[],
  products: AdminProduct[],
  kind: CatalogSection,
  search: string,
) {
  const term = search.trim().toLowerCase();
  return categories.filter((category) => {
    const members = products.filter(
      (product) => product.category_id === category.id,
    );
    // Empty categories remain accessible in every section until their first product is added.
    return (
      (!members.length ||
        members.some((product) => product.product_kind === kind)) &&
      (!term ||
        `${category.name} ${category.slug}`.toLowerCase().includes(term))
    );
  });
}

export function workspaceProducts(
  products: AdminProduct[],
  categoryId: string,
  kind: CatalogSection,
  search: string,
  status: ProductStatusFilter,
) {
  const term = search.trim().toLowerCase();
  return products.filter(
    (product) =>
      product.category_id === categoryId &&
      product.product_kind === kind &&
      (status === 'all' || product.status === status) &&
      (!term ||
        [
          product.name,
          product.slug,
          ...product.variants.flatMap((variant) => [
            variant.sku,
            variant.size_label ?? '',
            String(variant.attributes.grade ?? ''),
            String(variant.attributes.brand ?? ''),
          ]),
        ].some((value) => value.toLowerCase().includes(term))),
  );
}
