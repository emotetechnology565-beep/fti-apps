import { useState } from 'react';
import { Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Badge, Button, Card, Txt, s } from '@shared/ui';
import { salesApi } from '../services/sales-api';
import type { SalesDetail } from '../model/sales-types';

const supported = ['application/pdf','image/jpeg','image/png'];
const extension = (mime: string) => mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
export function AttachmentsPanel({ detail, refresh }: { detail: SalesDetail; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = ['submitted','reviewing','quoted'].includes(detail.status);
  async function upload() {
    setError('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: supported, copyToCacheDirectory: true, base64: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset || !asset.mimeType || !supported.includes(asset.mimeType) || !asset.size || asset.size > 3*1024*1024)
        throw new Error('Choose a PDF, JPEG or PNG file up to 3 MB.');
      setBusy(true);
      const base64 = Platform.OS === 'web' ? asset.base64 ?? await asset.file?.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer); let raw = ''; bytes.forEach(b => { raw += String.fromCharCode(b); }); return btoa(raw);
      }) : await new File(asset.uri).base64();
      if (!base64) throw new Error('Could not read this file. Please choose it again.');
      await salesApi.uploadAttachment(detail.id, asset.mimeType, base64);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function download(id: string) {
    setBusy(true); setError('');
    try {
      const data = await salesApi.downloadAttachment(id);
      if (!supported.includes(data.mimeType)) throw new Error('Unsupported attachment type.');
      if (Platform.OS === 'web') {
        const raw = atob(data.base64);
        const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
        const link = document.createElement('a'); link.href = url; link.download = `fti-rfq-${id}.${extension(data.mimeType)}`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new File(Paths.cache, `fti-rfq-${id}.${extension(data.mimeType)}`);
        await file.write(data.base64, { encoding: 'base64' });
        if (!await Sharing.isAvailableAsync()) throw new Error('No document viewer is available.');
        await Sharing.shareAsync(file.uri, { mimeType: data.mimeType });
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Card style={{ gap: 10 }}><Txt style={s.h2}>Private attachments</Txt>
    <Txt style={s.muted}>PDF, JPEG or PNG up to 3 MB. Files are retrieved only after account authorization.</Txt>
    {!detail.attachments.length && <Txt>No attachments yet.</Txt>}
    {detail.attachments.map(a => <View key={a.id} style={{ gap: 6 }}><Badge>{a.mime_type}</Badge><Txt>{Math.ceil(a.size_bytes/1024)} KB · {new Date(a.created_at).toLocaleString()}</Txt>
      <Button secondary disabled={busy} onPress={() => void download(a.id)}>Open attachment</Button></View>)}
    {open && detail.attachments.length < 10 && <Button secondary disabled={busy} onPress={() => void upload()}>{busy ? 'Working…' : 'Add attachment'}</Button>}
    {!!error && <Txt accessibilityRole="alert">{error}</Txt>}
  </Card>;
}
