import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AccessGate, StaffMfa, useAuth } from '@features/auth/ui';
import { identityRpc, hasPermission } from '@features/auth';
import { CatalogManagement } from '@features/catalog';
import { PricingManagement } from '@features/pricing/ui';
import { Heading, Card, Txt, Button, Field, Empty, Badge } from '@shared/ui';
type Review = {
  id: string;
  legal_name: string;
  gstin: string | null;
  pan: string | null;
  customer_type: string;
  revision: number;
};
function ReviewCard({
  application,
  refresh,
}: {
  application: Review;
  refresh: () => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'verified' | 'rejected' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!decision) return;
    setBusy(true);
    try {
      await identityRpc('fti_review_business', {
        p_id: application.id,
        p_revision: application.revision,
        p_decision: decision,
        p_note: note,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 14 }}>
      <Txt>{application.legal_name}</Txt>
      <Badge>{application.customer_type}</Badge>
      <Txt>GSTIN: {application.gstin ?? 'Not supplied'}</Txt>
      <Txt>PAN: {application.pan ?? 'Not supplied'}</Txt>
      <Field
        label={`Review note for ${application.legal_name}`}
        value={note}
        onChangeText={setNote}
      />
      <Button secondary disabled={busy} onPress={() => setDecision('verified')}>
        Approve business
      </Button>
      <Button secondary disabled={busy} onPress={() => setDecision('rejected')}>
        Reject application
      </Button>
      {decision ? (
        <>
          <Txt>
            Confirm {decision === 'verified' ? 'approval' : 'rejection'} of{' '}
            {application.legal_name}?
          </Txt>
          <Button disabled={busy || note.trim().length < 3} onPress={submit}>
            Confirm decision
          </Button>
          <Button secondary disabled={busy} onPress={() => setDecision(null)}>
            Cancel decision
          </Button>
        </>
      ) : null}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
    </Card>
  );
}
function ReviewQueue() {
  const auth = useAuth();
  const permitted = hasPermission(auth.identity, 'business.review');
  const query = useQuery({
    queryKey: ['business-review', auth.session?.user.id],
    queryFn: () => identityRpc<Review[]>('fti_review_queue'),
    enabled: permitted,
    retry: false,
  });
  if (!permitted)
    return (
      <Empty
        title="Staff account verified"
        description="Your role has no dealer-review permission. Other operations will be added in later phases."
      />
    );
  if (query.isPending) return <Txt>Loading applications...</Txt>;
  if (query.error)
    return (
      <Empty
        title="Could not load applications"
        description={query.error.message}
        action={<Button onPress={() => void query.refetch()}>Retry</Button>}
      />
    );
  return (
    <View style={{ gap: 16 }}>
      <Button secondary onPress={() => void query.refetch()}>
        Refresh applications
      </Button>
      {query.data.length ? (
        query.data.map((row) => (
          <ReviewCard
            key={row.id + row.revision}
            application={row}
            refresh={() => query.refetch()}
          />
        ))
      ) : (
        <Empty
          title="No pending applications"
          description="Submitted business applications will appear here."
        />
      )}
    </View>
  );
}
export function Admin() {
  const auth = useAuth();
  return (
    <View>
      <Heading
        eyebrow="FTI STAFF"
        title="Staff console"
        description="Review business applications with your authorized staff account."
      />
      <AccessGate permission="staff.access">
        <StaffMfa>
          <View style={{ gap: 28 }}>
            <ReviewQueue />
            {hasPermission(auth.identity, 'catalog.manage') ? <CatalogManagement /> : null}
            {hasPermission(auth.identity, 'price.manage') ? <PricingManagement key={auth.session?.user.id} /> : null}
          </View>
        </StaffMfa>
      </AccessGate>
    </View>
  );
}
