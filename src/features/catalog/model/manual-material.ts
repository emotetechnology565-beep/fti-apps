import {
  selectionPrice,
  type SelectionOption,
  type SelectionSize,
} from './material-selection';
import type { Variant } from './types';

export type ManualPreview = {
  status:
    | 'available'
    | 'unlisted_material'
    | 'unlisted_grade'
    | 'ambiguous_product'
    | 'out_of_range'
    | 'dimensions_required';
  size_status:
    | 'exact'
    | 'rounded'
    | 'unlisted_material'
    | 'out_of_range'
    | 'dimensions_required';
  category: {
    id: string;
    name: string;
    slug: string;
    dimension_label: string;
    dimension_keys: string[];
  } | null;
  matched_size: SelectionSize | null;
  grades: string[];
  option: SelectionOption | null;
};
export type ManualRequest = {
  grade_entry: 'manual' | 'list';
  material: string;
  size: string;
  grade: string;
  uom: Variant['uom'];
  product_id: string | null;
  expected_match: ManualPreview;
};
export function manualQuantityError(
  quantity: string,
  preview: ManualPreview | undefined,
): string | null {
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0)
    return 'Enter a positive quantity with up to 3 decimal places.';
  if (preview?.option && Number(quantity) < preview.option.min_order_qty)
    return `Minimum quantity is ${preview.option.min_order_qty} ${preview.option.uom}.`;
  return null;
}

export function manualEstimate(
  preview: ManualPreview | undefined,
  quantity: string,
) {
  const option = preview?.option;
  if (!option) return null;
  const price = selectionPrice(option);
  if (!price) return null;
  const raw =
    option.attributes.sheet_flat_net_prate ??
    option.attributes.grade_list_price;
  const rate = Number(raw);
  const perTonne = price.unit === 'PMT';
  if (
    !Number.isFinite(rate) ||
    rate < 0 ||
    (perTonne && !['kg', 'MT'].includes(option.uom))
  )
    return null;
  const factor = perTonne && option.uom === 'kg' ? 0.001 : 1;
  return {
    ...price,
    total: manualQuantityError(quantity, preview)
      ? null
      : (rate * Number(quantity) * factor).toLocaleString('en-IN', {
          maximumFractionDigits: 4,
        }),
  };
}
