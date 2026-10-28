import { supabaseCatalogRepository } from '@features/catalog/export';
import type { Product } from '@features/catalog';

export type HomeCategoryImages = Partial<Record<string, string>>;

const materialCategories: Record<string, string> = {
  'round-bar-as-rolled': 'round-bar-as-rolled',
  'as-rolled-round-bar': 'round-bar-as-rolled',
  'round-bright-bar': 'round-bright-bar',
  'bright-bar': 'round-bright-bar',
  sheet: 'sheet',
  sheets: 'sheet',
  flat: 'flat',
  'flat-bar': 'flat',
  square: 'square',
  'square-bar': 'square',
  tmt: 'tmt',
  'tmt-bar': 'tmt',
  'tmt-bars': 'tmt',
};

export function collectCategoryImages(
  images: HomeCategoryImages,
  products: Product[],
) {
  for (const product of products) {
    if (product.status !== 'published') continue;
    const url = product.images.find((image) =>
      /^https:\/\//i.test(image.url),
    )?.url;
    if (!url) continue;
    const category = product.category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const key =
      product.product_kind === 'steel'
        ? materialCategories[category]
        : product.product_kind === 'tractor_part' ||
            product.product_kind === 'fastener'
          ? product.product_kind
          : undefined;
    if (key && !images[key]) images[key] = url;
  }
  return images;
}

// The published catalogue/media API resolves admin-maintained Bunny image URLs.
// Continue past the first page so tractor parts cannot be hidden by steel stock.
export async function loadHomeCatalogue(
  repository = supabaseCatalogRepository,
) {
  const images: HomeCategoryImages = {};
  const tractorParts = new Map<
    string,
    { id: string; title: string; imageUrl?: string }
  >();
  let offset = 0;
  while (true) {
    const page = await repository.listProducts({ limit: 50, offset });
    collectCategoryImages(images, page.items);
    for (const product of page.items) {
      if (
        product.status === 'published' &&
        product.product_kind === 'tractor_part'
      ) {
        tractorParts.set(product.id, {
          id: product.id,
          title: product.name,
          imageUrl: product.images.find((image) =>
            /^https:\/\//i.test(image.url),
          )?.url,
        });
      }
    }
    offset += page.items.length;
    if (!page.items.length || offset >= page.total) break;
  }
  return { images, tractorParts: [...tractorParts.values()] };
}
