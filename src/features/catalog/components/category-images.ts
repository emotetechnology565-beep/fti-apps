import type { ImageSourcePropType } from 'react-native';

const images: Record<string, ImageSourcePropType> = {
  'round-bar-as-rolled': require('../../../../assets/materials/round-bar-as-rolled.jpg'),
  'as-rolled-round-bar': require('../../../../assets/materials/round-bar-as-rolled.jpg'),
  'round-bright-bar': require('../../../../assets/materials/round-bright-bar.jpg'),
  'bright-bar': require('../../../../assets/materials/round-bright-bar.jpg'),
  flat: require('../../../../assets/materials/flat-bars.jpg'),
  'flat-bar': require('../../../../assets/materials/flat-bars.jpg'),
  sheet: require('../../../../assets/materials/steel-sheets.jpg'),
  sheets: require('../../../../assets/materials/steel-sheets.jpg'),
  square: require('../../../../assets/materials/square-bars.jpg'),
  'square-bar': require('../../../../assets/materials/square-bars.jpg'),
  tmt: require('../../../../assets/materials/0.jpg'),
  'tmt-bar': require('../../../../assets/materials/0.jpg'),
  'tmt-bars': require('../../../../assets/materials/0.jpg'),
};

/** One bundled category image is shared by every grade in that category. */
export function getCategoryImage(category: string): ImageSourcePropType | undefined {
  const key = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return images[key];
}
