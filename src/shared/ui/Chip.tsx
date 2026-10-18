import { type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Icon } from './Icon';
import { Txt } from './Txt';
export function Chip({
  children,
  selected,
  onPress,
}: {
  children: ReactNode;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        s.chip,
        s.row,
        selected ? { backgroundColor: c.dark, borderColor: c.dark } : null,
      ]}
    >
      <Icon
        name={selected ? 'check-square' : 'square'}
        size={16}
        color={selected ? 'white' : c.muted}
      />
      <Txt
        style={{
          fontSize: 13,
          color: selected ? 'white' : c.muted,
          fontWeight: '600',
        }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}
