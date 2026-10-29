import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { getCategoryImage } from '@features/catalog/ui';
import { Icon } from '@shared/ui';

export function HomeCategoryImage({ category, title, imageUrl, style }: {
  category: string;
  title: string;
  imageUrl?: string;
  style: ComponentProps<typeof Image>['style'];
}) {
  // Category tiles use the reviewed category photo, rather than an arbitrary
  // product photo that may depict a different steel section.
  const source = getCategoryImage(category) ?? (imageUrl ? { uri: imageUrl } : undefined);
  return source
    ? <Image source={source} accessibilityLabel={title} contentFit="cover" style={style} />
    : <View style={[style, { backgroundColor: '#E8EDF3', alignItems: 'center', justifyContent: 'center' }]}><Icon name="image" size={22} color="#64748B" /></View>;
}
