import { type ReactNode } from 'react';
import { s } from '../theme/styles';
import { c } from '../theme/tokens';
import { Card } from './Card';
import { Icon } from './Icon';
import { Txt } from './Txt';
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card style={{ alignItems: 'center', padding: 40, gap: 14 }}>
      <Icon name="inbox" size={32} />
      <Txt style={s.h2}>{title}</Txt>
      <Txt style={{ color: c.muted, textAlign: 'center', lineHeight: 22 }}>
        {description}
      </Txt>
      {action}
    </Card>
  );
}
