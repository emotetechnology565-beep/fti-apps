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
  tone?: 'blue' | 'green' | 'red' | 'gray';
}) {
  return (
    <View
      style={[
        s.badge,
        {
          backgroundColor:
            tone === 'green'
              ? '#E8F7F0'
              : tone === 'red'
                ? c.pink
                : tone === 'gray'
                  ? '#EEF1F5'
                  : c.blue,
        },
      ]}
    >
      <Txt
        style={{
          fontSize: 10,
          fontWeight: '700',
          color:
            tone === 'green'
              ? c.green
              : tone === 'red'
                ? c.red
                : tone === 'gray'
                  ? c.muted
                  : '#48638C',
        }}
      >
        {children}
      </Txt>
    </View>
  );
}
