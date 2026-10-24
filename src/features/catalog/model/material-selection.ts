import type { Variant } from './types';

export type SelectionCategory = { id: string; slug: string; name: string; product_kind: 'steel'; dimension_label: string; dimension_keys?: string[] };
export type SelectionSize = { id: string; label: string; dimensions: Record<string, number> };
export type SelectionOption = {
  id: string; product_id: string; product_name: string; grade: string;
  uom: Variant['uom']; min_order_qty: number; variant_id: string | null; attributes: Record<string, unknown>;
};
export type SelectionOptions = {
  categories: SelectionCategory[]; category: SelectionCategory | null; sizes: SelectionSize[]; options: SelectionOption[];
};
export type SelectionDraft = {
  category: string; sizeId: string; grade: string; optionId: string; quantity: string; review: boolean; productId: string;
};
export const emptySelection = (): SelectionDraft => ({ category: '', sizeId: '', grade: '', optionId: '', quantity: '', review: false, productId: '' });

export function changeSelection(draft: SelectionDraft, field: 'category' | 'sizeId' | 'grade' | 'optionId' | 'quantity', value: string): SelectionDraft {
  if (field === 'category') return { ...emptySelection(), category: value };
  if (field === 'sizeId') return { ...draft, sizeId: value, grade: '', optionId: '', quantity: '', review: false };
  if (field === 'grade') return { ...draft, grade: value, optionId: '', quantity: '', review: false };
  if (field === 'optionId') return { ...draft, optionId: value, quantity: '', review: false };
  return { ...draft, quantity: value, review: false };
}

export function selectedOption(draft: SelectionDraft, options: SelectionOption[]): SelectionOption | undefined {
  const matches = options.filter(option => option.grade === draft.grade);
  if (draft.optionId) return matches.find(option => option.id === draft.optionId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function quantityError(value: string, option: SelectionOption | undefined): string | null {
  if (!option) return 'Choose an available size, grade and product.';
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(value) || Number(value) <= 0) return 'Enter a positive quantity with up to 3 decimal places.';
  if (Number(value) < Number(option.min_order_qty)) return `Minimum quantity is ${option.min_order_qty} ${option.uom}.`;
  return null;
}

export function selectionPrice(option: SelectionOption): { amount: string; unit: string; tax: string } | null {
  const attrs = option.attributes;
  if (attrs.quote_only === true) return null;
  const sheet = attrs.sheet_flat_net_prate;
  const amount = sheet ?? attrs.grade_list_price;
  if ((typeof amount !== 'string' && typeof amount !== 'number') || !/^\d+(\.\d+)?$/.test(String(amount))) return null;
  return {
    amount: Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 4 }),
    unit: sheet != null || option.uom === 'MT' ? 'PMT' : option.uom,
    tax: sheet != null ? 'Including 18% GST' : attrs.grade_list_gst_included === true ? `Including ${attrs.grade_list_gst_rate}% GST` : attrs.grade_list_gst_included === false ? 'Excluding GST' : 'GST inclusion to be confirmed',
  };
}
