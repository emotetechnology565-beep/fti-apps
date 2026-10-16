import React from 'react';
import { Text } from 'react-native';
import { s } from '../theme/styles';

export function Txt({
  children,
  style,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text {...props} style={[s.text, style]}>
      {children}
    </Text>
  );
}
