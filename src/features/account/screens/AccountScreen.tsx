import { BusinessForm } from '../components/BusinessForm';
import { BusinessDetails } from '../components/BusinessDetails';
import { AccountHub, RateSubscription } from '../components/AccountHub';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { selectedAccountSection } from '../model/sections';
import { AccessGate, useAuth } from '@features/auth/ui';
import { Notifications } from '@features/operations/ui';
import {
  Heading,
  Card,
  Field,
  Button,
  Txt,
  Chip,
  Badge,
  c,
  s,
} from '@shared/ui';
import {
  profileSchema,
} from '../model/identity-schema';
import {
  saveProfile,
  requestDeletion,
} from '../services/account-api';
function AccountDetails() {
  const auth = useAuth();
  const identity = auth.identity!;
  const {section: requested} = useLocalSearchParams<{section?: string}>();
  const section = selectedAccountSection(requested);
  const [name, setName] = useState(identity.profile.full_name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [businessSubmitted, setBusinessSubmitted] = useState(false);
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
      {section !== 'overview' ? (
        <Button secondary onPress={() => router.setParams({ section: 'overview' })}>
          Back to account overview
        </Button>
      ) : null}
      {section === 'overview' ? <AccountHub /> : null}
      {section === 'subscription' ? <RateSubscription /> : null}
      {section === 'profile' ? <Card style={{ gap: 12 }}>
        <Txt style={s.h2}>Personal profile</Txt>
        <Txt>Verified phone: {identity.profile.phone}</Txt>
        <Field label="Full name" placeholder="e.g. Rahul Sharma" value={name} onChangeText={setName} />
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
        <Button secondary onPress={() => router.setParams({section: 'business'})}>Continue to business details</Button>
        {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      </Card> : null}
      {section === 'profile' ? <Card style={{ gap: 16 }}>
        <Txt style={s.h2}>Saved account details</Txt>
        <Txt>Full name: {identity.profile.full_name || 'Not provided'}</Txt>
        <Txt>Verified phone: {identity.profile.phone || 'Not provided'}</Txt>
        {identity.businesses.length ? identity.businesses.map(business => (
          <BusinessDetails key={business.id} business={business}/>
        )) : <Txt>No business application saved yet. Complete business details and addresses, then submit your application to save them.</Txt>}
      </Card> : null}
      <View style={{display: ['business', 'addresses', 'review'].includes(section) ? 'flex' : 'none'}}>
      {businessSubmitted ? (
        <Card style={{ gap: 8, marginBottom: 16 }}>
          <Badge tone="green">APPLICATION SUBMITTED</Badge>
          <Txt accessibilityRole="alert" style={{ color: c.green }}>
            Application submitted for review.
          </Txt>
          <Txt>FTI will review your business details. You can check your verification status here.</Txt>
        </Card>
      ) : null}
      <BusinessForm
        section={section}
        onSubmitted={() => setBusinessSubmitted(true)}
        key={
          identity.businesses.find(
            (b) => b.submitted_by === identity.profile.id,
          )?.revision ?? 'new'
        }
        business={identity.businesses.find(
          (b) => b.submitted_by === identity.profile.id,
        )}
      />
      </View>
      {section === 'settings' ? <><AccountHub settings /><Notifications/><Card style={{ gap: 12 }}>
        <Txt style={s.h2}>Account settings</Txt>
        <Button secondary disabled={busy} onPress={() => void auth.signOut().catch((e) => setMessage(e.message))}>Sign out on this device</Button>
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
        {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      </Card></> : null}
    </View>
  );
}
export function Account() {
  return (
    <View>
      <Heading
        eyebrow="YOUR FTI ACCOUNT"
        title="Your account"
        description="Your profile, orders, business details and rate subscription in one place."
      />
      <AccessGate>
        <AccountDetails />
      </AccessGate>
    </View>
  );
}
