export const materialDimensionLabels = {
  diameter_mm: 'Diameter (mm)',
  thickness_mm: 'Thickness (mm)',
  width_mm: 'Width (mm)',
  height_mm: 'Height (mm)',
  length_mm: 'Length (mm)',
  side_mm: 'Side (mm)',
  size_mm: 'Size (mm)',
} as const;

export type MaterialDimensionKey = keyof typeof materialDimensionLabels;

export function parseMaterialDimensions(keys: readonly string[], values: Record<string, string>): Record<string, number> {
  if (keys.length < 1 || keys.length > 4 || new Set(keys).size !== keys.length ||
    keys.some(key => !Object.hasOwn(materialDimensionLabels, key))) {
    throw new Error('Choose one to four different dimension fields.');
  }
  return Object.fromEntries(keys.flatMap((key, index) => {
    const value = (values[key] ?? '').trim();
    if (!value && index > 0) return [];
    if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(value) || Number(value) <= 0) {
      throw new Error(`${materialDimensionLabels[key as MaterialDimensionKey]} must be positive with up to 9 whole digits and 3 decimal places.`);
    }
    return [[key, Number(value)]];
  }));
}

export function materialMinimumError(value: string, linkedMinimum?: number): string | null {
  if (!/^\d{1,12}(?:\.\d{1,3})?$/.test(value.trim()) || Number(value) <= 0) {
    return 'Enter a positive minimum quantity with up to 3 decimal places.';
  }
  if (linkedMinimum !== undefined && Number(value) < linkedMinimum) {
    return `Minimum quantity must be at least ${linkedMinimum} for the linked price.`;
  }
  return null;
}
