import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { supabase } from '@core/api/supabase-client';
import { Button, Card, Chip, Field, Txt, s } from '@shared/ui';
import { drawingSvg } from '../model/render';
import { weightQuantity } from '../model/weight';
import type { DrawingDefinition, DrawingInput } from '../model/types';

export function FastenerOrder({
  definition,
  input,
  grade,
  quantity,
  withNut,
}: {
  definition: DrawingDefinition;
  input: DrawingInput;
  grade: string;
  quantity: string;
  withNut: boolean;
}) {
  const auth = useAuth();
  const [name, setName] = useState(auth.identity?.profile.full_name ?? '');
  const [business, setBusiness] = useState(
    auth.identity?.businesses[0]?.legal_name ?? '',
  );
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const request = useRef<{ id: string; payload: string } | null>(null);
  async function submit() {
    if (busy || sent || !auth.session || !supabase) return;
    try {
      drawingSvg(definition, input);
    } catch {
      setMessage('Complete valid drawing dimensions before submitting.');
      return;
    }
    const count = weightQuantity(quantity);
    if (
      !count ||
      !grade ||
      name.trim().length < 2 ||
      name.trim().length > 80 ||
      !business.trim() ||
      business.trim().length > 80 ||
      location.trim().length < 5 ||
      location.trim().length > 100 ||
      !consent
    ) {
      setMessage(
        'Choose grade and quantity, complete buyer details and agree to WhatsApp updates.',
      );
      return;
    }
    const payload = {
      p_definition: definition.id,
      p_revision: definition.published_revision ?? definition.revision,
      p_input: input,
      p_grade: grade,
      p_quantity: count,
      p_with_nut: withNut,
      p_buyer: {
        name: name.trim(),
        business: business.trim(),
        location: location.trim(),
        whatsapp_consent: consent,
      },
    };
    const serialized = JSON.stringify(payload);
    if (!request.current)
      request.current = {
        id:
          globalThis.crypto?.randomUUID?.() ??
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const n = Math.floor(Math.random() * 16);
            return (c === 'x' ? n : (n & 3) | 8).toString(16);
          }),
        payload: serialized,
      };
    if (request.current.payload !== serialized) {
      setMessage(
        'Retry with the original details to avoid a duplicate request.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await supabase.rpc(
        'fti_catalog_fastener_order_submit',
        { ...payload, p_id: request.current.id },
      );
      if (error) throw new Error(error.message);
      setSent(true);
      setMessage(
        `Order request received: ${data.reference}. Drawing and order notifications are queued for you and FTI. FTI will confirm availability, price and delivery.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Card>
        <Txt accessibilityLiveRegion="polite">{message}</Txt>
      </Card>
    );
  if (!auth.session)
    return (
      <Button disabled={!auth.ready} onPress={() => router.push('/login')}>
        Sign in to order fastener
      </Button>
    );
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Order fastener</Txt>
      <Txt>
        {definition.standard}:{definition.edition} · {definition.size} ·{' '}
        {grade || 'Choose grade above'} · {quantity} pieces
      </Txt>
      <Field label="Buyer name" value={name} onChangeText={setName} />
      <Field
        label="Business / buyer type"
        value={business}
        onChangeText={setBusiness}
      />
      <Txt>
        Verified WhatsApp:{' '}
        {auth.identity?.profile.phone ?? auth.session.user.phone}
      </Txt>
      <Field
        label="Delivery location (up to 100 characters)"
        value={location}
        onChangeText={setLocation}
        multiline
      />
      <Chip selected={consent} onPress={() => setConsent(!consent)}>
        Send me WhatsApp updates for this order request
      </Chip>
      <Txt style={s.muted}>
        The selected drawing and order details will be shared with you and FTI’s
        configured order recipients. FTI will confirm the final quotation.
      </Txt>
      <Button disabled={busy} onPress={() => void submit()}>
        {busy ? 'Submitting...' : 'Submit order request'}
      </Button>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}
