import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { companyCertificate } from '@shared/config/company-certificates';

export function IsoGoldBadge({
  width = 130,
  height = 52,
  onPress,
}: {
  width?: number;
  height?: number;
  onPress?: () => void;
}) {
  const content = (
    <Image
      source={{ uri: companyCertificate.badge_cdn_url || 'https://ftis.b-cdn.net/icons/iso-9001-certified-badge.png' }}
      style={{ width, height }}
      contentFit="contain"
      accessibilityLabel="ISO 9001 Certified Badge"
    />
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View ISO 9001 Certification"
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={{ width, height }}>{content}</View>;
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});

