import type { CatalogPage, Product, Variant } from '../model/types';

export async function loadFilterVariants(
  fetchPage: (args: {
    p_category: string | null;
    p_limit: number;
    p_offset: number;
  }) => Promise<CatalogPage>,
  category: string,
  productKind: Product['product_kind'],
): Promise<Variant[]> {
  const variants: Variant[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage({
      p_category: category || null,
      p_limit: 50,
      p_offset: offset,
    });
    variants.push(
      ...page.items
        .filter((item) => item.product_kind === productKind)
        .flatMap((item) => item.variants),
    );
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) break;
  }
  return variants;
}
