import { View } from 'react-native';
import type { Business } from '@features/auth';
import { Badge, Txt, s } from '@shared/ui';

export function BusinessDetails({ business }: { business: Business }) {
  const address = (label: string) => {
    const saved = business.addresses.find(item => item.label === label);
    return saved
      ? [saved.line1, saved.city, saved.state, saved.pincode].filter(Boolean).join(', ')
      : 'Not provided';
  };
  return <View style={{ gap: 10 }}>
    <Txt style={s.h2}>{business.legal_name}</Txt>
    <Badge tone={business.verification_status === 'verified' ? 'green' : undefined}>
      {business.verification_status === 'verified' ? 'BUSINESS VERIFIED' : business.verification_status.toUpperCase()}
    </Badge>
    <Txt>Business type: {business.customer_type.replaceAll('_', ' ')}</Txt>
    <Txt>GSTIN: {business.gstin || 'Not provided'}</Txt>
    <Txt>PAN: {business.pan || 'Not provided'}</Txt>
    <Txt>Billing address: {address('billing')}</Txt>
    <Txt>Delivery address: {address('shipping')}</Txt>
    {business.review_note ? <Txt>Review note: {business.review_note}</Txt> : null}
  </View>;
}
