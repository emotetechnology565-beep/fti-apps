import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import type { Business } from '@features/auth';
import { Heading, Card, Field, Button, Txt, Chip, Row, Badge, s, c } from '@shared/ui';
import type { AccountSection } from '../model/sections';
import { businessSchema, type BusinessApplication } from '../model/identity-schema';
import { applyBusiness } from '../services/account-api';
import { BusinessDetails } from './BusinessDetails';
const emptyAddress = { line1: '', city: '', state: '', pincode: '' };
export function BusinessForm({ business, section, onSubmitted }: { business?: Business; section: AccountSection; onSubmitted: () => void }) {
  const { refresh } = useAuth();
  const [legal, setLegal] = useState(business?.legal_name ?? '');
  const [gstin, setGstin] = useState(business?.gstin ?? '');
  const [pan, setPan] = useState(business?.pan ?? '');
  const [kind, setKind] = useState<BusinessApplication['customer_type']>(
    business?.customer_type ?? 'industrial_buyer',
  );
  const [billing, setBilling] = useState(
    business?.addresses.find((a) => a.label === 'billing') ?? emptyAddress,
  );
  const [shipping, setShipping] = useState(
    business?.addresses.find((a) => a.label === 'shipping') ?? emptyAddress,
  );
  const [same, setSame] = useState(!business);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit() {
    if (busy) return;
    setMessage('');
    const result = businessSchema.safeParse({
      legal_name: legal,
      gstin,
      pan,
      customer_type: kind,
      billing,
      shipping: same ? billing : shipping,
      consent,
      revision: business?.revision,
    });
    if (!result.success) {
      setMessage(result.error.issues[0].message);
      const field = result.error.issues[0].path[0];
      router.setParams({section: field === 'billing' || field === 'shipping' ? 'addresses' : field === 'consent' ? 'review' : 'business'});
      return;
    }
    setBusy(true);
    try {
      await applyBusiness(result.data);
      onSubmitted();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (business?.verification_status === 'verified')
    return (
      <Card style={{ gap: 12 }}>
        <BusinessDetails business={business}/>
        <Txt style={s.muted}>
          Contact FTI to request changes to verified business details.
        </Txt>
      </Card>
    );
  return (
    <Card style={{ gap: 12 }}>
      <Heading
        title="Business application"
        description="Submit your company details for review. Verification does not grant staff access or credit."
      />
      {business ? (
        <>
          <Badge>{business.verification_status.toUpperCase()}</Badge>
          {business.review_note ? <Txt>{business.review_note}</Txt> : null}
        </>
      ) : null}
      {section === 'business' ? <>
      <Field
        label="Legal business name" placeholder="e.g. Acme Fasteners Pvt Ltd"
        value={legal}
        onChangeText={setLegal}
      />
      <Field label="GSTIN (optional)" placeholder="e.g. 07ABCDE1234F1Z5" value={gstin} onChangeText={setGstin} />
      <Field label="PAN (optional)" placeholder="e.g. ABCDE1234F" value={pan} onChangeText={setPan} />
      <Row style={{ flexWrap: 'wrap' }}>
        {(
          [
            'retailer',
            'dealer',
            'distributor',
            'manufacturer',
            'industrial_buyer',
          ] as const
        ).map((value) => (
          <Chip
            key={value}
            selected={kind === value}
            onPress={() => setKind(value)}
          >
            {value.replace('_', ' ')}
          </Chip>
        ))}
      </Row>
      <Button onPress={() => router.setParams({section: 'addresses'})}>Continue to addresses</Button>
      </> : null}
      {section === 'addresses' ? <>
      <Txt>Billing address</Txt>
      {Object.keys(emptyAddress).map((field) => (
        <Field
          key={field}
          label={`Billing ${field === 'line1' ? 'address' : field}`} placeholder={{ line1: 'e.g. 123 Industrial Road', city: 'e.g. Delhi', state: 'e.g. Delhi', pincode: 'e.g. 110001' }[field]}
          value={billing[field as keyof typeof emptyAddress]}
          onChangeText={(v) => setBilling({ ...billing, [field]: v })}
        />
      ))}
      <Chip selected={same} onPress={() => setSame(!same)}>
        Use billing address for delivery
      </Chip>
      {!same ? (
        <>
          <Txt>Delivery address</Txt>
          {Object.keys(emptyAddress).map((field) => (
            <Field
              key={field}
              label={`Delivery ${field === 'line1' ? 'address' : field}`} placeholder={{ line1: 'e.g. 123 Industrial Road', city: 'e.g. Delhi', state: 'e.g. Delhi', pincode: 'e.g. 110001' }[field]}
              value={shipping[field as keyof typeof emptyAddress]}
              onChangeText={(v) => setShipping({ ...shipping, [field]: v })}
            />
          ))}
        </>
      ) : null}
      <Row><Button secondary onPress={() => router.setParams({section: 'business'})}>Back to business details</Button><Button onPress={() => router.setParams({section: 'review'})}>Review application</Button></Row>
      </> : null}
      {section === 'review' ? <>
      <Txt style={s.h2}>{legal || 'Business name not entered'}</Txt>
      <Txt>Business type: {kind.replace('_', ' ')}</Txt>
      <Txt>GSTIN: {gstin || 'Not provided'} | PAN: {pan || 'Not provided'}</Txt>
      <Txt>Billing: {[billing.line1, billing.city, billing.state, billing.pincode].filter(Boolean).join(', ') || 'Not entered'}</Txt>
      <Txt>Delivery: {same ? 'Same as billing' : [shipping.line1, shipping.city, shipping.state, shipping.pincode].filter(Boolean).join(', ') || 'Not entered'}</Txt>
      <Button secondary onPress={() => router.setParams({section: 'business'})}>Edit business details</Button>
      <Button secondary onPress={() => router.setParams({section: 'addresses'})}>Edit addresses</Button>
      <Chip selected={consent} onPress={() => setConsent(!consent)}>
        I confirm these details are accurate and authorize verification
      </Chip>
      <Button disabled={busy} onPress={submit}>
        {busy ? 'Submitting' : 'Submit business application'}
      </Button>
      </> : null}
      {message ? (
        <Txt accessibilityRole="alert" style={{ color: c.red }}>
          {message}
        </Txt>
      ) : null}
    </Card>
  );
}
