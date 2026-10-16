import { type ReactNode } from 'react';
import { View } from 'react-native';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Row } from './Row';
import { Txt } from './Txt';
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 24 }}>
      {eyebrow ? <Txt style={s.eyebrow}>{eyebrow}</Txt> : null}
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt accessibilityRole="header" style={s.h1}>
          {title}
        </Txt>
        {action}
      </Row>
      {description ? (
        <Txt style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>
          {description}
        </Txt>
      ) : null}
    </View>
  );
}
