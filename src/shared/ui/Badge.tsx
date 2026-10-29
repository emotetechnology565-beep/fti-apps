import { type ReactNode } from 'react';
import { View } from 'react-native';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Txt } from './Txt';

export function Badge({
  children,
  tone = 'blue',
}: {
  children: ReactNode;
  tone?: 'blue' | 'green' | 'red' | 'gray' | 'gold';
}) {
  const isGreen = tone === 'green';
  const isRed = tone === 'red';
  const isGray = tone === 'gray';

  const backgroundColor = isGreen
    ? c.greenBg
    : isRed
      ? c.brandRedLight
      : isGray
        ? c.bgSubtle
        : c.brandBlueLight;

  const borderColor = isGreen
    ? 'rgba(21, 128, 61, 0.2)'
    : isRed
      ? c.brandRedBorder
      : isGray
        ? c.line
        : c.brandBlueBorder;

  const textColor = isGreen
    ? c.green
    : isRed
      ? c.brandRed
      : isGray
        ? c.muted
        : c.brandBlue;

  return (
    <View
      style={[
        s.badge,
        {
          backgroundColor,
          borderWidth: 1,
          borderColor,
        },
      ]}
    >
      <Txt
        style={{
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.6,
          color: textColor,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Txt>
    </View>
  );
}
