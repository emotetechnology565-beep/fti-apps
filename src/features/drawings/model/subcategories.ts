import {
  isNutShape,
  type DrawingDefinition,
  type DrawingShape,
  type DimensionData,
} from './types';

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
  if (value === 'hex-bolt') return ['hex-bolt', 'hex-screw'];
  if (value === 'hex-nut') return ['hex-nut', 'lock-nut'];
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
  diameter_min: 'Diameter d minimum (mm)',
  diameter_max: 'Diameter d maximum (mm)',
  head_width_min: 'Head across flats s minimum (mm)',
  head_width_max: 'Head across flats s maximum (mm)',
  head_height_min: 'Head thickness k minimum (mm)',
  head_height_max: 'Head thickness k maximum (mm)',
  across_corners_min: 'Head across corners e minimum (mm)',
  fillet_radius_max: 'Under-head radius r maximum (mm)',
  pitch_diameter_min: 'Pitch diameter minimum (mm)',
  pitch_diameter_max: 'Pitch diameter maximum (mm)',
  minor_diameter_min: 'Nut minor diameter minimum (mm)',
  minor_diameter_max: 'Nut minor diameter maximum (mm)',
  thread_add_short: 'Thread allowance for L up to 130 mm (mm)',
  thread_add_medium: 'Thread allowance for L over 130 to 200 mm (mm)',
  thread_add_long: 'Thread allowance for L over 200 mm (mm)',
  thread_end_allowance: 'Hex screw unthreaded allowance (mm)',
};
export const coachToleranceKeys = [
  'diameter_min',
  'diameter_max',
  'head_width_min',
  'head_width_max',
  'head_height_min',
  'head_height_max',
  'across_corners_min',
  'fillet_radius_max',
] as const;
export const hexDimensionKeys = [
  'pitch_diameter_min',
  'pitch_diameter_max',
  'minor_diameter_min',
  'minor_diameter_max',
  'thread_add_short',
  'thread_add_medium',
  'thread_add_long',
  'thread_end_allowance',
] as const;
export function drawingDimensionLabel(
  shape: DrawingShape,
  key: keyof DimensionData,
) {
  if (isNutShape(shape) && key.startsWith('head_height')) {
    const symbol = shape === 'lock-nut' ? 'm1' : 'm';
    return `Nut height ${symbol}${key.endsWith('_min') ? ' minimum' : key.endsWith('_max') ? ' maximum' : ''} (mm)`;
  }
  return dimensionLabels[key];
}
export function shapeDimensionKeys(
  shape: DrawingShape,
): (keyof DimensionData)[] {
  if (shape === 'hex-nut' || shape === 'lock-nut')
    return [
      'diameter',
      'pitch',
      'head_width',
      'head_height',
      'head_width_min',
      'head_width_max',
      'head_height_min',
      'head_height_max',
      'across_corners_min',
      'minor_diameter_min',
      'minor_diameter_max',
    ];
  if (shape === 'hex-bolt' || shape === 'hex-screw')
    return [
      'diameter',
      'pitch',
      'head_width',
      'head_height',
      'diameter_min',
      'diameter_max',
      'head_width_min',
      'head_width_max',
      'head_height_min',
      'head_height_max',
      'across_corners_min',
      'pitch_diameter_min',
      'pitch_diameter_max',
      ...(shape === 'hex-bolt'
        ? ([
            'thread_add_short',
            'thread_add_medium',
            'thread_add_long',
          ] as const)
        : (['thread_end_allowance'] as const)),
    ];
  if (shape === 'coach')
    return [
      'diameter',
      'pitch',
      'head_width',
      'head_height',
      ...coachToleranceKeys,
    ];
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
    (['hex-bolt', 'hex-screw'].includes(row.shape)
      ? 'hex-bolt'
      : ['hex-nut', 'lock-nut'].includes(row.shape)
        ? 'hex-nut'
        : row.shape.startsWith('u-')
          ? 'u-bolt'
          : row.shape.startsWith('j-')
            ? 'j-type-bolt'
            : row.shape === 'l'
              ? 'l-bolt'
              : 'coach-screw')
  );
}
