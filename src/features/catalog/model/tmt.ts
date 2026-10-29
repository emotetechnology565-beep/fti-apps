import { selectionPrice } from './material-selection';
import type { Variant } from './types';

export function lowestTmtPrice(variants: Variant[]) {
  let lowest: ReturnType<typeof selectionPrice> = null;
  let lowestAmount = Infinity;
  for (const variant of variants) {
    const price = selectionPrice({
      id: variant.id,
      product_id: '',
      product_name: 'TMT Bar',
      grade: '',
      variant_id: variant.id,
      uom: variant.uom,
      min_order_qty: variant.min_order_qty,
      attributes: variant.attributes,
    });
    const amount = Number(
      variant.attributes.sheet_flat_net_prate ?? variant.attributes.grade_list_price,
    );
    if (price && amount > 0 && amount < lowestAmount) {
      lowest = price;
      lowestAmount = amount;
    }
  }
  return lowest;
}

export function isTmtCategory(category: string): boolean {
  return ['tmt', 'tmt-bar', 'tmt-bars'].includes(
    category
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-'),
  );
}

// Group before pagination; retain real product/variant IDs for ordering.
export function groupTmtProducts<
  T extends {
    category: string;
    name: string;
    description: string | null;
    variants: unknown[];
  },
>(products: T[]): T[] {
  const result: T[] = [];
  let grouped: T | undefined;
  for (const product of products) {
    if (!isTmtCategory(product.category)) {
      result.push(product);
    } else if (grouped) {
      grouped.variants.push(...product.variants);
    } else {
      grouped = {
        ...product,
        name: 'TMT Bar',
        description: 'Choose size and brand. Add a grade if required.',
        variants: [...product.variants],
      };
      result.push(grouped);
    }
  }
  return result;
}

export function tmtCartKey(optionId: string, grade: string): string {
  return JSON.stringify(['tmt', optionId, grade.trim()]);
}
