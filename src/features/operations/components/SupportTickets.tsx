import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Field, Txt, s } from '@shared/ui';
import { PrivateDocuments } from './PrivateDocuments';
import { Pages, useAction, usePage } from './shared';
import {
  operationsRpc as rpc,
  type Ticket,
  type Message,
} from '../services/operations-api';

function Thread({ ticket, staff }: { ticket: Ticket; staff: boolean }) {
  const [offset, setOffset] = useState(0);
  const [body, setBody] = useState('');
  const action = useAction();
  const auth = useAuth();
  const messages = usePage<Message[]>('thread', {
    p_ticket: ticket.id,
    p_offset: offset,
  });
  return (
    <Card style={{ gap: 10 }}>
      <Txt style={s.h2}>{ticket.subject}</Txt>
      <Txt>
        {ticket.status} ? {ticket.id}
      </Txt>
      {messages.isPending ? (
        <Txt>Loading conversation?</Txt>
      ) : messages.error ? (
        <Txt accessibilityRole="alert">{messages.error.message}</Txt>
      ) : (
        <>
          {messages.data.map((m) => (
            <Card key={m.id}>
              <Txt>
                {m.author_id === auth.session?.user.id ? 'You' : 'Participant'}{' '}
                ? {new Date(m.created_at).toLocaleString()}
              </Txt>
              <Txt>{m.body}</Txt>
            </Card>
          ))}
          <Pages
            offset={offset}
            setOffset={setOffset}
            count={messages.data.length}
          />
        </>
      )}
      {ticket.status === 'open' && (
        <>
          <Field
            label="Reply (up to 4000 characters)"
            placeholder="e.g. Please share the invoice and a photo of the issue."
            value={body}
            onChangeText={setBody}
            multiline
          />
          <Button
            disabled={action.busy || !body.trim() || body.length > 4000}
            onPress={() =>
              void action.run(
                () =>
                  rpc('fti_operations_reply', {
                    p_ticket: ticket.id,
                    p_body: body,
                  }),
                () => setBody(''),
              )
            }
          >
            Send reply
          </Button>
          {staff && (
            <Button
              secondary
              disabled={action.busy || !body.trim() || body.length > 4000}
              onPress={() =>
                void action.run(
                  () =>
                    rpc('fti_operations_reply', {
                      p_ticket: ticket.id,
                      p_body: body,
                      p_resolve: true,
                    }),
                  () => setBody(''),
                )
              }
            >
              Send reply and resolve ticket
            </Button>
          )}
        </>
      )}
      <PrivateDocuments
        kind="support_ticket"
        entityId={ticket.id}
        canUpload={ticket.status === 'open'}
      />
      {!!action.message && (
        <Txt accessibilityRole="alert">{action.message}</Txt>
      )}
    </Card>
  );
}
export function SupportTickets({ staff = false }: { staff?: boolean }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const params = useLocalSearchParams<{
    order?: string;
    subject?: string;
    body?: string;
  }>();
  const [subject, setSubject] = useState(
    typeof params.subject === 'string' ? params.subject : '',
  );
  const [body, setBody] = useState(
    typeof params.body === 'string' ? params.body : '',
  );
  const [order, setOrder] = useState(
    typeof params.order === 'string' ? params.order : '',
  );
  const action = useAction();
  const list = usePage<Ticket[]>('tickets', {
    p_staff: staff,
    p_offset: offset,
  });
  const ticket = list.data?.find((t) => t.id === selected);
  return (
    <View style={{ gap: 12 }}>
      <Txt style={s.h2}>{staff ? 'Support queue' : 'Your support tickets'}</Txt>
      <Button secondary onPress={() => void list.refetch()}>
        Refresh tickets
      </Button>
      {list.isPending ? (
        <Txt>Loading tickets?</Txt>
      ) : list.error ? (
        <Txt accessibilityRole="alert">{list.error.message}</Txt>
      ) : (
        <>
          {!list.data.length && <Txt>No tickets yet.</Txt>}
          {list.data.map((t) => (
            <Button key={t.id} secondary onPress={() => setSelected(t.id)}>
              {t.subject} ? {t.status}
            </Button>
          ))}
          <Pages
            offset={offset}
            setOffset={(n) => {
              setSelected(null);
              setOffset(n);
            }}
            count={list.data.length}
          />
        </>
      )}
      {ticket && <Thread key={ticket.id} ticket={ticket} staff={staff} />}
      {!staff && (
        <Card style={{ gap: 10 }}>
          <Txt style={s.h2}>Request help</Txt>
          <Field
            label="Subject"
            placeholder="e.g. Missing items in my delivery"
            value={subject}
            onChangeText={setSubject}
          />
          <Field
            label="Order ID (optional, from your order details)"
            placeholder="Paste the order ID from your order details"
            value={order}
            onChangeText={setOrder}
          />
          <Field
            label="Describe the issue"
            placeholder="e.g. Two boxes were missing from the delivery."
            value={body}
            onChangeText={setBody}
            multiline
          />
          <Button
            disabled={
              action.busy ||
              subject.trim().length < 5 ||
              subject.length > 160 ||
              !body.trim() ||
              body.length > 4000
            }
            onPress={() =>
              void action.run(
                () =>
                  rpc('fti_operations_ticket_create', {
                    p_subject: subject,
                    p_body: body,
                    p_order: order.trim() || null,
                  }),
                () => {
                  setSubject('');
                  setBody('');
                  setOrder('');
                  setOffset(0);
                },
              )
            }
          >
            Create ticket
          </Button>
          {!!action.message && (
            <Txt accessibilityRole="alert">{action.message}</Txt>
          )}
        </Card>
      )}
    </View>
  );
}
