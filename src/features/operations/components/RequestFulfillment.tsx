import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '@features/auth';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Field, Icon, Row, Txt, c } from '@shared/ui';
import {
  fulfillmentSteps,
  initialFulfillment,
  type RequestFulfillmentState,
} from '../model/request-fulfillment';
import { updateRequestFulfillment } from '../services/request-fulfillment-api';

export function RequestFulfillment({
  kind,
  requestId,
  initial,
}: {
  kind: 'material' | 'fastener';
  requestId: string;
  initial?: RequestFulfillmentState | null;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const [saved, setSaved] = useState<RequestFulfillmentState | null>(null);
  const workflow =
    saved && saved.revision > (initial?.revision ?? 0)
      ? saved
      : (initial ?? initialFulfillment);
  const index = fulfillmentSteps.findIndex(
    (step) => step.status === workflow.status,
  );
  const next = fulfillmentSteps[index + 1];
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(false);
  const [reviewedRevision, setReviewedRevision] = useState(-1);
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [proof, setProof] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const permission =
    next?.status === 'shipped' || next?.status === 'delivered'
      ? 'operations.manage'
      : 'order.manage';
  const permitted =
    hasPermission(auth.identity, 'order.manage') &&
    hasPermission(auth.identity, permission);
  const valid =
    next?.status === 'confirmed'
      ? /^\d{1,14}(\.\d{1,2})?$/.test(total) &&
        Number(total) > 0 &&
        note.trim().length >= 5 &&
        note.trim().length <= 1000
      : next?.status === 'shipped'
        ? carrier.trim().length >= 2 &&
          carrier.trim().length <= 120 &&
          tracking.trim().length >= 2 &&
          tracking.trim().length <= 120 &&
          vehicle.trim().length <= 40
        : next?.status === 'delivered'
          ? proof.trim().length >= 5 && proof.trim().length <= 1000
          : !!next;
  const actionLabel =
    next?.status === 'confirmed'
      ? 'Confirm order'
      : next?.status === 'processing'
        ? 'Start processing'
        : next?.status === 'shipped'
          ? 'Record dispatch'
          : 'Mark delivered';
  async function submit() {
    if (!next || !permitted || !valid || busy || !review) return;
    if (reviewedRevision !== workflow.revision) {
      setError(
        'This request changed while you were reviewing it. Review the current step again.',
      );
      setReview(false);
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await updateRequestFulfillment(
        kind,
        requestId,
        workflow.revision,
        next.status,
        {
          confirmed_total: total.trim(),
          confirmation_note: note.trim(),
          carrier: carrier.trim(),
          tracking_number: tracking.trim(),
          vehicle_number: vehicle.trim(),
          delivery_note: proof.trim(),
        },
      );
      setSaved(result);
      setEditing(false);
      setReview(false);
      setSuccess(`${next.label} saved.`);
      void client.invalidateQueries({
        queryKey: [kind === 'material' ? 'raw-orders' : 'fastener-orders'],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.panel}>
      <Row style={styles.heading}>
        <Txt style={styles.title}>Order fulfillment</Txt>
        <Badge tone={workflow.status === 'delivered' ? 'green' : 'blue'}>
          {fulfillmentSteps[index]?.label ?? workflow.status}
        </Badge>
      </Row>
      <View accessibilityLabel="Fulfillment progress" style={styles.steps}>
        {fulfillmentSteps.map((step, stepIndex) => (
          <View key={step.status} style={styles.step}>
            <View
              style={[styles.dot, stepIndex <= index ? styles.activeDot : null]}
            >
              {stepIndex < index ? (
                <Icon name="check" size={12} color="white" />
              ) : (
                <Txt
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: stepIndex === index ? 'white' : '#58697C',
                  }}
                >
                  {stepIndex + 1}
                </Txt>
              )}
            </View>
            <Txt
              style={{
                fontSize: 11,
                lineHeight: 17,
                color: stepIndex <= index ? c.ink : '#58697C',
                fontWeight: stepIndex === index ? '700' : '400',
              }}
            >
              {step.label}
            </Txt>
          </View>
        ))}
      </View>
      {workflow.confirmed_total ? (
        <Txt>
          Agreed order total: INR{' '}
          {Number(workflow.confirmed_total).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
          })}
        </Txt>
      ) : (
        <Txt style={styles.muted}>
          Confirm availability, pricing, taxes and payment terms with the buyer
          before accepting this request.
        </Txt>
      )}
      {workflow.confirmation_note ? (
        <Txt style={styles.muted}>
          Confirmation: {workflow.confirmation_note}
        </Txt>
      ) : null}
      {workflow.carrier ? (
        <View style={{ gap: 5 }}>
          <Txt>Transporter: {workflow.carrier}</Txt>
          <Txt selectable>LR / tracking: {workflow.tracking_number}</Txt>
          {workflow.vehicle_number ? (
            <Txt>Vehicle: {workflow.vehicle_number}</Txt>
          ) : null}
        </View>
      ) : null}
      {workflow.delivery_note ? (
        <Txt selectable>Delivery confirmation: {workflow.delivery_note}</Txt>
      ) : null}
      {workflow.status !== 'pending_confirmation' ? (
        <Txt style={styles.muted}>
          Fulfillment tracking does not confirm receipt of payment. Verify
          agreed payment terms separately before dispatch.
        </Txt>
      ) : null}
      {next && !editing ? (
        <Button
          disabled={!permitted}
          icon={next.status === 'shipped' ? 'truck' : 'check'}
          style={{ alignSelf: 'flex-start' }}
          onPress={() => {
            setEditing(true);
            setSuccess('');
            setError('');
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
      {next && !permitted ? (
        <Txt style={styles.muted}>
          An authorized staff member with{' '}
          {permission === 'operations.manage'
            ? 'dispatch and delivery'
            : 'order management'}{' '}
          permission must complete this step.
        </Txt>
      ) : null}
      {editing && next ? (
        <View style={styles.editor}>
          <Txt style={styles.title}>{actionLabel}</Txt>
          {next.status === 'confirmed' ? (
            <>
              <Field
                label="Agreed order total (INR)"
                numeric
                value={total}
                onChangeText={(v) => {
                  setTotal(v);
                  setReview(false);
                }}
                placeholder="Total including agreed taxes and delivery"
              />
              <Field
                label="Order confirmation note"
                value={note}
                onChangeText={(v) => {
                  setNote(v);
                  setReview(false);
                }}
                placeholder="Record agreed availability, pricing and payment terms"
                multiline
              />
            </>
          ) : next.status === 'processing' ? (
            <Txt>Confirm that this order is being prepared for dispatch.</Txt>
          ) : next.status === 'shipped' ? (
            <>
              <Field
                label="Transporter / carrier"
                value={carrier}
                onChangeText={(v) => {
                  setCarrier(v);
                  setReview(false);
                }}
                placeholder="Transport company name"
              />
              <Field
                label="LR / tracking reference"
                value={tracking}
                onChangeText={(v) => {
                  setTracking(v);
                  setReview(false);
                }}
                placeholder="Consignment or LR number"
              />
              <Field
                label="Vehicle number (optional)"
                value={vehicle}
                onChangeText={(v) => {
                  setVehicle(v);
                  setReview(false);
                }}
                placeholder="Vehicle registration"
              />
              <Txt style={styles.muted}>
                Record dispatch after the material has left with the transporter
                and agreed payment terms have been checked.
              </Txt>
            </>
          ) : (
            <Field
              label="Delivery evidence / recipient confirmation"
              value={proof}
              onChangeText={(v) => {
                setProof(v);
                setReview(false);
              }}
              placeholder="Signed POD reference or recipient confirmation"
              multiline
            />
          )}
          {review ? (
            <View style={styles.review}>
              <Txt style={styles.title}>Review before saving</Txt>
              <Txt>
                {next.status === 'confirmed'
                  ? `Confirm this order for INR ${total} with note: ${note}`
                  : next.status === 'shipped'
                    ? `Dispatch with ${carrier}, LR / tracking ${tracking}${vehicle ? `, vehicle ${vehicle}` : ''}.`
                    : next.status === 'delivered'
                      ? `Confirm delivery against: ${proof}`
                      : 'Move this order to processing.'}
              </Txt>
              <Txt style={styles.muted}>
                This change will be recorded in the order history.
              </Txt>
              <Button
                disabled={busy || !valid || !permitted}
                onPress={() => void submit()}
              >
                {busy
                  ? 'Saving fulfillment...'
                  : `Save ${next.label.toLowerCase()}`}
              </Button>
            </View>
          ) : (
            <Button
              disabled={!valid || busy || !permitted}
              onPress={() => {
                setReviewedRevision(workflow.revision);
                setReview(true);
              }}
            >
              Review {next.label.toLowerCase()}
            </Button>
          )}
          <Button
            secondary
            disabled={busy}
            onPress={() => {
              setEditing(false);
              setReview(false);
              setError('');
            }}
          >
            Cancel change
          </Button>
        </View>
      ) : null}
      {error ? (
        <Txt accessibilityRole="alert" style={{ color: c.red }}>
          {error}
        </Txt>
      ) : null}
      {success ? (
        <Txt accessibilityLiveRegion="polite" style={{ color: c.green }}>
          {success}
        </Txt>
      ) : null}
      {workflow.history.length ? (
        <View style={styles.history}>
          <Txt style={styles.title}>Activity</Txt>
          {workflow.history.map((event) => (
            <Txt key={event.status} style={styles.muted}>
              {fulfillmentSteps.find((step) => step.status === event.status)
                ?.label ?? event.status}{' '}
              - {new Date(event.at).toLocaleString('en-IN')}
            </Txt>
          ))}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    padding: 20,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: '#FAFBFD',
  },
  heading: { justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 21 },
  muted: { color: '#58697C', fontSize: 12, lineHeight: 20 },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingVertical: 6,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5EAF0',
  },
  activeDot: { backgroundColor: c.green },
  editor: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 10,
    backgroundColor: c.paper,
  },
  review: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDC6CB',
    backgroundColor: c.pink,
    borderRadius: 8,
  },
  history: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 14,
  },
});
