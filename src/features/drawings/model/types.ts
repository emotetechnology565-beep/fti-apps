export const drawingShapes = [
  'j-i',
  'j-ii',
  'u-square',
  'u-round',
  'l',
  'coach',
  'hex-bolt',
  'hex-screw',
  'hex-nut',
  'lock-nut',
] as const;
export type DrawingShape = (typeof drawingShapes)[number];
export const isHexShape = (shape: DrawingShape) =>
  ['hex-bolt', 'hex-screw', 'hex-nut', 'lock-nut'].includes(shape);
export const isNutShape = (shape: DrawingShape) =>
  shape === 'hex-nut' || shape === 'lock-nut';
export type FastenerPhotoCard = {
  slug: string;
  label: string;
  image_url: string | null;
  asset_id: string | null;
  published: boolean;
  revision: number;
};
export type FastenerPhotoLibrary = {
  cards: FastenerPhotoCard[];
  photos: { id: string; product_name: string; image_url: string }[];
};
export type DimensionData = {
  diameter: number;
  widths: number[];
  lengths: number[];
  depth?: number;
  radius?: number;
  pitch?: number;
  thread_base?: number;
  head_width?: number;
  head_height?: number;
  diameter_min?: number;
  diameter_max?: number;
  head_width_min?: number;
  head_width_max?: number;
  head_height_min?: number;
  head_height_max?: number;
  across_corners_min?: number;
  fillet_radius_max?: number;
  pitch_diameter_min?: number;
  pitch_diameter_max?: number;
  minor_diameter_min?: number;
  minor_diameter_max?: number;
  thread_add_short?: number;
  thread_add_medium?: number;
  thread_add_long?: number;
  thread_end_allowance?: number;
};
export type DrawingDefinition = {
  subcategory?: string;
  family?: 'foundation' | 'roofing' | 'coach' | 'hex';
  id: string;
  standard: string;
  edition: string;
  shape: DrawingShape;
  size: string;
  source: string;
  notes: string;
  dimensions: DimensionData;
  revision: number;
  published_revision: number | null;
};
export const familyLabels = {
  foundation: 'Foundation bolts',
  roofing: 'Roofing hook bolts',
  coach: 'Coach screws',
  hex: 'Hex fasteners',
} as const;
export function drawingFamily(
  row: Pick<DrawingDefinition, 'family' | 'shape'>,
): keyof typeof familyLabels {
  return (
    row.family ??
    (isHexShape(row.shape)
      ? 'hex'
      : row.shape === 'coach'
        ? 'coach'
        : 'roofing')
  );
}
export type DrawingInput = {
  length: number;
  width?: number;
  pitch?: number;
  radius?: number;
  returnHeight?: number;
  angle?: number;
};
export const shapeLabels: Record<DrawingShape, string> = {
  'j-i': 'J Type I — tilted return',
  'j-ii': 'J Type II — round return',
  'u-square': 'U — square bend',
  'u-round': 'U — round bend',
  l: 'L hook bolt',
  coach: 'Coach screw',
  'hex-bolt': 'Hex bolt',
  'hex-screw': 'Hex screw',
  'hex-nut': 'Hex nut',
  'lock-nut': 'Lock nut',
};
