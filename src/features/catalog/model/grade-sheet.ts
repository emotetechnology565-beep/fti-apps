export type GradeSizeGroup = { id?: string; label: string; add_price: string };
export type GradeRow = {
  grade: string;
  base_price: string;
  base_charge: string;
  profile: string;
  rolling: string;
  size_groups: GradeSizeGroup[];
};
export type GradeSheet = {
  category_id: string;
  product_id: string | null;
  product_kind: 'steel' | 'fastener' | 'other';
  uom: 'kg' | 'MT' | 'piece' | 'box' | 'bundle';
  min_order_qty: string;
  gst_included?: boolean;
  gst_rate?: string | null;
  revision: number;
  published_revision: number | null;
  product_status?: 'draft' | 'published' | 'archived' | null;
  rows: GradeRow[];
};
export const gradePriceFields = [
  ['base_price', 'Base price'], ['base_charge', 'BASE charge'],
  ['profile', 'Profile'], ['rolling', 'Rolling'],
] as const;
export function newGradeRow(): GradeRow {
  return { grade: '', base_price: '', base_charge: '', profile: '', rolling: '', size_groups: [{ label: '', add_price: '' }] };
}
const amountPattern = /^\d{1,12}(\.\d{1,4})?$/;
export function gradeAmount(value: string): bigint | null {
  if (!amountPattern.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
export function gradeNet(row: GradeRow, addition?: string): string | null {
  const parts = gradePriceFields.map(([key]) => gradeAmount(row[key]));
  if (addition !== undefined) parts.push(gradeAmount(addition));
  if (parts.some(part => part === null)) return null;
  const total = parts.reduce<bigint>((sum, part) => sum + part!, 0n);
  return `${total / 10000n}.${String(total % 10000n).padStart(4, '0')}`;
}
export function gradeRowsError(rows: GradeRow[], publish = false): string | null {
  if (rows.length < 1 || rows.length > 100) return 'Add between 1 and 100 grades.';
  const grades = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const prefix = `Entry ${index + 1}: `;
    const grade = row.grade.trim().toUpperCase();
    if (!grade || grade.length > 80) return `${prefix}enter a grade of up to 80 characters.`;
    if (grades.has(grade)) return `${prefix}${grade} is listed twice.`;
    grades.add(grade);
    for (const [key, label] of gradePriceFields) {
      if (!row[key].trim() && !publish) continue;
      if (gradeAmount(row[key]) === null) return `${prefix}${label} needs a non-negative number with up to 12 whole digits and 4 decimals.`;
    }
    if (publish && (gradeNet(row) === null || gradeAmount(gradeNet(row)!) === 0n))
      return `${prefix}net price must be greater than zero.`;
    if (row.size_groups.length < 1 || row.size_groups.length > 10) return `${prefix}add between 1 and 10 size groups.`;
    const labels = new Set<string>();
    for (const group of row.size_groups) {
      const label = group.label.trim().toUpperCase();
      if (!label || label.length > 100) return `${prefix}enter a size group of up to 100 characters.`;
      if (labels.has(label)) return `${prefix}size group ${label} is listed twice.`;
      labels.add(label);
      if ((group.add_price.trim() || publish) && gradeAmount(group.add_price) === null)
        return `${prefix}enter a valid additional price; use 0 for no addition.`;
    }
  }
  return null;
}

export function gradeGstError(included: boolean, rate: string): string | null {
  return included && (!/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100)
    ? 'Enter a GST percentage from 0 to 100 (up to 2 decimals).' : null;
}
