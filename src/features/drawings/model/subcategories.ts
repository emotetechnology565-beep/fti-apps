import type { DrawingDefinition, DrawingShape, DimensionData } from './types';

export const fastenerSubcategories = [
  { value: 'hex-bolt', label: 'Hex bolt' },
  { value: 'heavy-hex-bolt', label: 'Heavy Hex bolt' },
  { value: 'hex-nut', label: 'Hex nut' },
  { value: 'heavy-hex-nut', label: 'Heavy Hex nut' },
  { value: 'u-bolt', label: 'U bolt' },
  { value: 'j-type-bolt', label: 'J type bolt' },
  { value: 'j-hook', label: 'J hook' },
  { value: 'square-j-bolt', label: 'Sq type J bolt' },
  { value: 'plain-washer', label: 'Plain washer' },
  { value: 'machined-washer', label: 'Machined washer' },
  { value: 'spring-washer', label: 'Spring washer' },
  { value: 'square-washer', label: 'Square washer' },
  { value: 'dti-washer', label: 'DTI washer' },
  { value: 'square-nut', label: 'Square nut' },
  { value: 'square-plate', label: 'Sq.plate' },
] as const;
export const additionalSubcategories = [
  { value: 'l-bolt', label: 'L type bolt' },
  { value: 'coach-screw', label: 'Coach screw' },
] as const;
export const allSubcategories = [
  ...fastenerSubcategories,
  ...additionalSubcategories,
];
export function subcategoryLabel(value: string) {
  return allSubcategories.find((item) => item.value === value)?.label ?? value;
}
export function matchesFastenerSearch(slug: string, search: string) {
  const plain = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const term = plain(search);
  if (!term) return true;
  return [
    subcategoryLabel(slug),
    slug,
    slug.replace(/-bolt$/, '-type-bolt'),
  ].some((value) => plain(value).includes(term));
}
export function subcategoryShapes(value: string): DrawingShape[] {
  if (value === 'u-bolt') return ['u-square', 'u-round'];
  if (value === 'j-type-bolt' || value === 'j-hook') return ['j-i', 'j-ii'];
  if (value === 'l-bolt') return ['l'];
  if (value === 'coach-screw') return ['coach'];
  return [];
}
export const dimensionLabels: Record<keyof DimensionData, string> = {
  diameter: 'Diameter (mm)',
  widths: 'Width (mm)',
  lengths: 'Length (mm)',
  depth: 'Hook depth (mm)',
  radius: 'Bend radius (mm)',
  pitch: 'Thread pitch P (mm)',
  thread_base: 'Thread length base (mm)',
  head_width: 'Head across flats (mm)',
  head_height: 'Head height (mm)',
};
export function shapeDimensionKeys(
  shape: DrawingShape,
): (keyof DimensionData)[] {
  if (shape === 'coach')
    return ['diameter', 'pitch', 'head_width', 'head_height'];
  if (shape === 'j-ii' || shape === 'u-round')
    return ['diameter', 'pitch', 'thread_base'];
  return [
    'diameter',
    ...(['j-i', 'l'].includes(shape) ? ['depth' as const] : []),
    'radius',
    'pitch',
    'thread_base',
  ];
}
export function drawingSubcategory(
  row: Pick<DrawingDefinition, 'subcategory' | 'shape'>,
) {
  return (
    row.subcategory ??
    (row.shape.startsWith('u-')
      ? 'u-bolt'
      : row.shape.startsWith('j-')
        ? 'j-type-bolt'
        : row.shape === 'l'
          ? 'l-bolt'
          : 'coach-screw')
  );
}
