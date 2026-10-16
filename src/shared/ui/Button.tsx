import Feather from '@expo/vector-icons/Feather';
import React, { type ReactNode } from 'react';
import { Pressable, ViewStyle } from 'react-native';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Icon } from './Icon';
import { Txt } from './Txt';
export function Button({
  children,
  onPress,
  secondary = false,
  icon,
  disabled = false,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  secondary?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary ? s.secondary : null,
        disabled
          ? { backgroundColor: c.line, borderColor: c.line }
          : { opacity: pressed ? 0.78 : 1 },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={16} color={secondary ? c.ink : 'white'} />
      ) : null}
      <Txt
        style={{
          color: disabled ? c.muted : secondary ? c.ink : 'white',
          fontSize: 12,
          fontWeight: '700',
        }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}
