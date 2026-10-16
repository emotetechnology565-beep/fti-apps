import { type ReactNode } from 'react';
import { View } from 'react-native';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Row } from './Row';
import { Txt } from './Txt';
export function Section({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt accessibilityRole="header" style={s.h2}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt style={{ color: c.muted, fontSize: 12 }}>{subtitle}</Txt>
        ) : null}
      </View>
      {action}
    </Row>
  );
}
