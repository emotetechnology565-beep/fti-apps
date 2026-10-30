import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { getCategoryImage } from './category-images';

// The supplied design board contains the approved bright-bar photograph.
// Display its photo region as an image sprite; the surrounding screen is never
// displayed or used as a replacement for native UI.
const brightPhoto = { x: 25, y: 180, width: 186, height: 128 };
export function MaterialPhoto({ category, height = 130 }: { category: string; height?: number }) {
  const [width, setWidth] = useState(180);
  const bright = ['round-bright-bar', 'bright-bar', 'round-bar-as-rolled'].includes(category);
  const source = getCategoryImage(category);
  const scale = Math.max(width / brightPhoto.width, height / brightPhoto.height);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} accessibilityLabel={bright ? 'Bright steel round bars' : category} style={{ height, width: '100%', overflow: 'hidden', backgroundColor: '#FFFFFF', borderRadius: 4 }}>
    {bright ? <Image source={require('../../../../assets/fastener-uploads/raw/745b9566-afe6-4a89-80d8-7a3b3c941e17.png')} contentFit="fill" style={{ position: 'absolute', width: 1024 * scale, height: 1536 * scale, left: -brightPhoto.x * scale + (width - brightPhoto.width * scale) / 2, top: -brightPhoto.y * scale + (height - brightPhoto.height * scale) / 2 }} /> : source ? <Image source={source} contentFit="cover" style={{ width: '100%', height }} /> : null}
  </View>;
}
