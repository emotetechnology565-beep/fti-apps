export const drawingShapes = [
  'j-i',
  'j-ii',
  'u-square',
  'u-round',
  'l',
  'coach',
] as const;
export type DrawingShape = (typeof drawingShapes)[number];
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
};
export type DrawingDefinition = {
  subcategory?: string;
  family?: 'foundation' | 'roofing' | 'coach';
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
} as const;
export function drawingFamily(
  row: Pick<DrawingDefinition, 'family' | 'shape'>,
): keyof typeof familyLabels {
  return row.family ?? (row.shape === 'coach' ? 'coach' : 'roofing');
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
};
