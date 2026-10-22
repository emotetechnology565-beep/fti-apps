import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Txt, WhatsAppButton, s } from '@shared/ui';
import { salesApi } from '../services/sales-api';

const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const value = Math.floor(Math.random() * 16); return (ch === 'x' ? value : (value & 3) | 8).toString(16);
});

export function CategoryQuotationButton({ categoryId }: { categoryId: string }) {
  const auth = useAuth();
  return <CategoryQuotationAction key={`${categoryId}:${auth.session?.user.id ?? 'guest'}`} categoryId={categoryId} />;
}

function CategoryQuotationAction({ categoryId }: { categoryId: string }) {
  const auth = useAuth();
  const client = useQueryClient();
  const requestId = useRef(newId());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  async function request() {
    if (busy || sent) return;
    if (!auth.session) { router.push('/login'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await salesApi.requestCategoryPdf(requestId.current, categoryId);
      setSent(true);
      setMessage(result.queued ? 'Quotation PDF queued for your verified WhatsApp number. FTI staff have been notified.' : 'FTI staff have been notified. The quotation PDF will be sent to your WhatsApp when it is uploaded.');
      await client.invalidateQueries({ queryKey: ['sales'] });
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <WhatsAppButton disabled={!auth.ready || busy || sent} label={busy ? 'Requesting quotation...' : sent ? 'Requested on WhatsApp' : 'Get quotation on WhatsApp'} onPress={() => void request()} />
    {message ? <Txt accessibilityRole="alert" style={s.muted}>{message}</Txt> : null}
  </View>;
}
