import { useState } from 'react';
import { View } from 'react-native';
import { AccessGate, useAuth } from '@features/auth/ui';
import type { Business } from '@features/auth';
import {
  Heading,
  Card,
  Field,
  Button,
  Txt,
  Chip,
  Row,
  Badge,
  s,
  c,
} from '@shared/ui';
import {
  profileSchema,
  businessSchema,
  type BusinessApplication,
} from '../model/identity-schema';
import {
  saveProfile,
  applyBusiness,
  requestDeletion,
} from '../services/account-api';
const emptyAddress = { line1: '', city: '', state: '', pincode: '' };
function BusinessForm({ business }: { business?: Business }) {
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
      return;
    }
    setBusy(true);
    try {
      await applyBusiness(result.data);
      await refresh();
      setMessage('Application submitted for review.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (business?.verification_status === 'verified')
    return (
      <Card>
        <Badge tone="green">BUSINESS VERIFIED</Badge>
        <Txt>{business.legal_name}</Txt>
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
      <Field
        label="Legal business name"
        value={legal}
        onChangeText={setLegal}
      />
      <Field label="GSTIN (optional)" value={gstin} onChangeText={setGstin} />
      <Field label="PAN (optional)" value={pan} onChangeText={setPan} />
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
      <Txt>Billing address</Txt>
      {Object.keys(emptyAddress).map((field) => (
        <Field
          key={field}
          label={`Billing ${field === 'line1' ? 'address' : field}`}
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
              label={`Delivery ${field === 'line1' ? 'address' : field}`}
              value={shipping[field as keyof typeof emptyAddress]}
              onChangeText={(v) => setShipping({ ...shipping, [field]: v })}
            />
          ))}
        </>
      ) : null}
      <Chip selected={consent} onPress={() => setConsent(!consent)}>
        I confirm these details are accurate and authorize verification
      </Chip>
      <Button disabled={busy} onPress={submit}>
        {busy ? 'Submitting' : 'Submit business application'}
      </Button>
      {message ? (
        <Txt accessibilityRole="alert" style={{ color: c.red }}>
          {message}
        </Txt>
      ) : null}
    </Card>
  );
}
function AccountDetails() {
  const auth = useAuth();
  const identity = auth.identity!;
  const [name, setName] = useState(identity.profile.full_name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await auth.refresh();
      setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Card style={{ gap: 12 }}>
        <Txt>Verified phone: {identity.profile.phone}</Txt>
        <Field label="Full name" value={name} onChangeText={setName} />
        <Button
          disabled={busy}
          onPress={() => {
            const parsed = profileSchema.safeParse({ full_name: name });
            if (!parsed.success) {
              setMessage('Enter your full name (2–120 characters).');
              return;
            }
            void run(
              () => saveProfile(parsed.data.full_name),
              'Profile saved.',
            );
          }}
        >
          Save profile
        </Button>
        <Button
          secondary
          disabled={busy}
          onPress={() =>
            void auth.signOut().catch((e) => setMessage(e.message))
          }
        >
          Sign out on this device
        </Button>
        {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      </Card>
      <BusinessForm
        key={
          identity.businesses.find(
            (b) => b.submitted_by === identity.profile.id,
          )?.revision ?? 'new'
        }
        business={identity.businesses.find(
          (b) => b.submitted_by === identity.profile.id,
        )}
      />
      <Card style={{ gap: 12 }}>
        <Txt>Account deletion</Txt>
        {identity.deletion_requested ? (
          <Txt>
            Your deletion request has been received. FTI will review retention
            requirements before completing it.
          </Txt>
        ) : (
          <>
            <Txt style={s.muted}>
              Request deletion of your account and eligible personal data. This
              does not immediately delete business records.
            </Txt>
            <Chip
              selected={confirmDelete}
              onPress={() => setConfirmDelete(!confirmDelete)}
            >
              I want to request account deletion
            </Chip>
            <Button
              secondary
              disabled={!confirmDelete || busy}
              onPress={() =>
                void run(requestDeletion, 'Deletion request received.')
              }
            >
              Request account deletion
            </Button>
          </>
        )}
      </Card>
    </View>
  );
}
export function Account() {
  return (
    <View>
      <Heading
        eyebrow="YOUR FTI ACCOUNT"
        title="Your account"
        description="Manage your verified identity and business application."
      />
      <AccessGate>
        <AccountDetails />
      </AccessGate>
    </View>
  );
}
