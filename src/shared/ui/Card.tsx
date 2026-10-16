import { type ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import { s } from '../theme/styles';

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
