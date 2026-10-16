import { useState } from 'react';
import { View } from 'react-native';
import { useStore } from '@core/state/workspace-store';
import { useShallow } from 'zustand/react/shallow';
import { rfqSchema } from '../model/rfq-schema';
import {
  Heading,
  Button,
  Card,
  Field,
  Txt,
  Badge,
  Row,
  Empty,
  c,
  s,
} from '@shared/ui';
export function RFQs() {
  const { rfqs, saveRfqDraft } = useStore(
    useShallow((state) => ({
      rfqs: state.rfqs,
      saveRfqDraft: state.saveRfqDraft,
    })),
  );
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  return (
    <View>
      <Heading
        eyebrow="YOUR MATERIAL REQUIREMENTS"
        title="Requests & quotations"
        description="Prepare a request for the materials your business needs."
        action={
          <Button onPress={() => setOpen(!open)}>
            {open ? 'Close form' : 'New request'}
          </Button>
        }
      />
      {open ? (
        <Card style={{ marginBottom: 24 }}>
          <Field
            label="Material, grade and dimensions"
            value={title}
            onChangeText={setTitle}
          />
          <Field
            label="Required quantity and unit"
            value={quantity}
            onChangeText={setQuantity}
          />
          <Field
            label="Delivery requirements and notes"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <Txt style={{ ...s.muted, marginBottom: 16 }}>
            Save a local draft. Sending it to FTI requires the quotation
            service.
          </Txt>
          {error ? (
            <Txt
              accessibilityRole="alert"
              style={{ color: c.red, marginBottom: 14 }}
            >
              {error}
            </Txt>
          ) : null}
          <Button
            onPress={() => {
              const result = rfqSchema.safeParse({ title, quantity, notes });
              if (!result.success) {
                setError(result.error.issues[0].message);
                return;
              }
              saveRfqDraft(
                result.data.title,
                result.data.quantity,
                result.data.notes,
              );
              setOpen(false);
              setTitle('');
              setQuantity('');
              setNotes('');
              setError('');
            }}
          >
            Save request draft
          </Button>
        </Card>
      ) : null}
      {!rfqs.length ? (
        <Empty
          title="No quotation requests yet"
          description="Create a draft when you have a material requirement. Submitted requests and quotations need a connected service."
        />
      ) : (
        <View style={{ gap: 16 }}>
          {rfqs.map((r) => (
            <Card key={r.id}>
              <Row
                style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <Txt style={s.h2}>{r.title}</Txt>
                <Badge>
                  {r.status === 'Draft'
                    ? 'LOCAL DRAFT'
                    : 'LOCAL RECORD · NOT VERIFIED'}
                </Badge>
              </Row>
              <Txt style={{ ...s.muted, marginTop: 14 }}>{r.quantity}</Txt>
              <Txt style={s.muted}>{r.notes}</Txt>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}
