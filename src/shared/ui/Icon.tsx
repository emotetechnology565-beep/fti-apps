import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { c } from '../theme/tokens';

export function Icon({
  name,
  size = 19,
  color = c.muted,
}: {
  name: React.ComponentProps<typeof Feather>['name'];
  size?: number;
  color?: string;
}) {
  return (
    <Feather
      name={name}
      size={size}
      color={color}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
