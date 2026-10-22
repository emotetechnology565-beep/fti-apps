import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Card, Chip, Txt, WhatsAppButton, s } from '@shared/ui';
import { salesApi } from '../services/sales-api';

const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const value = Math.floor(Math.random() * 16); return (ch === 'x' ? value : (value & 3) | 8).toString(16);
});
async function openPdf(id: string) {
  const data = await salesApi.downloadCategoryPdf(id);
  if (data.mimeType !== 'application/pdf') throw new Error('The quotation is not a PDF.');
  if (Platform.OS === 'web') {
    const bytes = Uint8Array.from(atob(data.base64), value => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = 'FTI-quotation.pdf';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const file = new File(Paths.cache, `FTI-quotation-${id}.pdf`);
    await file.write(data.base64, { encoding: 'base64' });
    if (!await Sharing.isAvailableAsync()) throw new Error('No document viewer is available.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
  }
}
const statusText = (status: string) => ({ awaiting_pdf: 'Waiting for staff to upload a PDF', pending: 'WhatsApp delivery queued', claimed: 'Sending to WhatsApp', sent: 'Accepted by WhatsApp', failed: 'Delivery needs staff attention', manual_review: 'Delivery needs staff review' }[status] ?? status);

export function CategoryQuotationPdfs({ admin = false }: { admin?: boolean }) {
  const auth = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [completed, setCompleted] = useState('');
  const request = useRef({ category: '', id: newId() });
  const categories = useQuery({ queryKey: ['sales', 'category-pdfs', auth.session?.user.id], queryFn: salesApi.categoryPdfs, retry: false });
  const requests = useQuery({ queryKey: ['sales', 'category-pdf-requests', auth.session?.user.id, admin], queryFn: () => salesApi.categoryRequests(admin), refetchInterval: 15000, retry: false });
  const versionKey = `${selected}:${categories.data?.find(item => item.id === selected)?.updated_at ?? 'pending'}`;
  async function refresh() { await client.invalidateQueries({ queryKey: ['sales'] }); }
  async function send() {
    if (!selected || busy) return;
    if (request.current.category !== versionKey) request.current = { category: versionKey, id: newId() };
    setBusy(true); setMessage('');
    try {
      const result = await salesApi.requestCategoryPdf(request.current.id, selected);
      setMessage(result.queued ? 'Your quotation PDF is queued for your verified WhatsApp number. Staff have been notified.' : 'Staff have been notified. Your PDF will be sent automatically when it is uploaded.');
      setCompleted(versionKey);
      // Retain the request ID for retries; a replacement PDF can be requested separately.
      await refresh();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!selected || busy) return;
    setBusy(true); setMessage('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, base64: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset || !asset.size || asset.size > 3 * 1024 * 1024) throw new Error('Choose a PDF up to 3 MB.');
      const encoded = Platform.OS === 'web' ? asset.base64 ?? await asset.file?.arrayBuffer().then(buffer => {
        let raw = ''; new Uint8Array(buffer).forEach(value => { raw += String.fromCharCode(value); }); return btoa(raw);
      }) : await new File(asset.uri).base64();
      const base64 = encoded?.replace(/^data:[^,]*;base64,/i, '');
      if (!base64) throw new Error('Could not read this PDF.');
      await salesApi.uploadCategoryPdf(selected, base64);
      setMessage('Category quotation PDF uploaded. New requests use this version; waiting requests are queued for delivery.');
      await refresh();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function download(id: string) {
    setBusy(true); setMessage('');
    try { await openPdf(id); } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  const category = categories.data?.find(item => item.id === selected);
  return <Card style={{ gap: 12 }}>
    <Txt style={s.h2}>{admin ? 'Fastener category quotation PDFs' : 'Get a fastener quotation PDF'}</Txt>
    <Txt style={s.muted}>{admin ? 'Upload or replace one PDF per category. PDFs do not expire automatically. Replace the PDF whenever prices change.' : 'Choose a fastener category to receive its current uploaded PDF on your verified WhatsApp number. Staff are notified of your request.'}</Txt>
    {categories.isPending ? <Txt>Loading categories...</Txt> : categories.error ? <Txt accessibilityRole="alert">{categories.error.message}</Txt> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {categories.data.map(item => <Chip key={item.id} selected={selected === item.id} onPress={() => { setSelected(item.id); setMessage(''); }}>{item.name}</Chip>)}
      {!categories.data.length ? <Txt>No fastener categories available.</Txt> : null}
    </View>}
    {category ? <>
      <Txt>{category.updated_at ? `PDF updated ${new Date(category.updated_at).toLocaleString()}` : 'No PDF uploaded yet. Staff can still receive your request.'}</Txt>
      {admin ? <>
        <Button disabled={busy} onPress={() => void upload()}>{category.asset_id ? 'Replace category PDF' : 'Upload category PDF'}</Button>
        {category.asset_id ? <Button secondary disabled={busy} onPress={() => void download(category.asset_id!)}>Open current PDF</Button> : null}
      </> : <>
        <Txt style={s.muted}>Send this requested PDF to {auth.identity?.profile.phone || 'my verified phone number'}. This does not subscribe you to other WhatsApp updates.</Txt>
        <WhatsAppButton
          label={busy ? 'Requesting quotation...' : completed === versionKey ? 'Requested on WhatsApp' : 'Get quotation on WhatsApp'}
          disabled={busy || completed === versionKey}
          onPress={() => void send()}
        />
      </>}
    </> : null}
    {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    <Txt style={s.h2}>{admin ? 'Category quotation requests' : 'Your category PDF requests'}</Txt>
    <Button secondary onPress={() => void refresh()}>Refresh PDF requests</Button>
    {requests.isPending ? <Txt>Loading PDF requests...</Txt> : requests.error ? <Txt accessibilityRole="alert">{requests.error.message}</Txt> : <>
      {!requests.data.length ? <Txt>No category PDF requests yet.</Txt> : null}
      {requests.data.map(item => <View key={item.id} style={{ gap: 6, paddingVertical: 8 }}>
        <Txt>{item.category}</Txt>
        {admin ? <Txt>{item.buyer_phone}</Txt> : null}
        <Badge>{statusText(item.delivery_status)}</Badge>
        <Txt style={s.muted}>{new Date(item.created_at).toLocaleString()}</Txt>
        {item.asset_id ? <Button secondary disabled={busy} onPress={() => void download(item.asset_id!)}>Open requested PDF</Button> : null}
      </View>)}
    </>}
  </Card>;
}
