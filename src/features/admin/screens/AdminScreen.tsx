import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AccessGate, StaffMfa, useAuth } from '@features/auth/ui';
import { identityRpc, hasPermission } from '@features/auth';
import { CatalogManagement } from '@features/catalog';
import { PricingManagement } from '@features/pricing/ui';
import { SalesManagement } from '@features/quotations/ui';
import { OperationsManagement } from '@features/operations/ui';
import { CommerceManagement } from '@features/orders/ui';
import { StockReviewPanel } from '@features/business-stock/ui';
import { Heading, Card, Txt, Button, Field, Empty, Badge } from '@shared/ui';
import { selectedStaffSection } from '../model/sections';
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
    if (!decision || busy) return;
    const reviewNote = note.trim();
    if (reviewNote.length < 3 || reviewNote.length > 1000) {
      setError('Enter a review note between 3 and 1,000 characters to confirm your decision.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await identityRpc('fti_review_business', {
        p_id: application.id,
        p_revision: application.revision,
        p_decision: decision,
        p_note: reviewNote,
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
        label={`Review note for ${application.legal_name} (required, 3–1,000 characters)`}
        value={note}
        onChangeText={(value) => {
          setNote(value);
          setError('');
        }}
        placeholder="Enter the reason for approving or rejecting this business"
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
          <Button disabled={busy} onPress={submit}>
            {busy ? 'Saving decision...' : 'Confirm decision'}
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
function StaffWorkspace() {
  const auth = useAuth();
  const {section} = useLocalSearchParams<{section?: string}>();
  const selected = selectedStaffSection(auth.identity,section);
  if (!selected) return <Empty title="No staff tools assigned" description="Ask an FTI administrator to assign the permissions needed for your work."/>;
  const content = (() => {
    switch (selected.id) {
      case 'businesses': return <ReviewQueue/>;
      case 'catalogue': return <CatalogManagement/>;
      case 'pricing': return <PricingManagement/>;
      case 'sales': return <SalesManagement/>;
      case 'inventory': return <CommerceManagement section="inventory"/>;
      case 'payments': return <CommerceManagement section="payments"/>;
      case 'order-policy': return <CommerceManagement section="policy"/>;
      case 'reservations': return <CommerceManagement section="expiry"/>;
      case 'dispatch': return <OperationsManagement section="dispatch"/>;
      case 'support': return <OperationsManagement section="support"/>;
      case 'reports': return <OperationsManagement section="reports"/>;
      case 'jobs': return <OperationsManagement section="jobs"/>;
      case 'announcements': return <OperationsManagement section="content"/>;
      case 'business-stock': return <StockReviewPanel/>;
    }
  })();
  return <View style={{gap: 16}}><Txt style={{fontSize: 22, fontWeight: '700'}}>{selected.label}</Txt>{content}</View>;
}
export function Admin() {
  const auth = useAuth();
  return (
    <View>
      <Heading
        eyebrow="FTI STAFF"
        title="Staff console"
        description="Choose a staff tool from the navigation menu. Each section opens separately."
      />
      <AccessGate permission="staff.access">
        <StaffMfa>
          <StaffWorkspace key={auth.session?.user.id}/>
        </StaffMfa>
      </AccessGate>
    </View>
  );
}
