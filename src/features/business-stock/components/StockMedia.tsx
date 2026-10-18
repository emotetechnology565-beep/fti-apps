import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Txt, s } from '@shared/ui';
import { stockApi } from '../services/stock-api';
import type { StockAsset, StockListing, StockMediaKind } from '../model/types';
import { useStockAction } from './shared';

const supported = ['application/pdf', 'image/jpeg', 'image/png'];
function Photo({asset}: {asset: StockAsset}) {
  const auth = useAuth();
  const query = useQuery({queryKey: ['business-stock', 'photo', auth.session?.user.id, asset.id], queryFn: () => stockApi.mediaDownload(asset.id), retry: false, gcTime: 0});
  if (query.isPending) return <Txt>Loading photo...</Txt>;
  if (query.error) return <Txt accessibilityRole="alert">{query.error.message}</Txt>;
  return <Image source={{uri: `data:${query.data.mimeType};base64,${query.data.base64}`}} accessibilityLabel="Photo of seller-owned stock" contentFit="contain" cachePolicy="none" style={{width: '100%', height: 210, backgroundColor: '#F5F7FB'}}/>;
}
export function StockMedia({listing, kind, canUpload = false}: {listing: StockListing; kind: StockMediaKind; canUpload?: boolean}) {
  const auth = useAuth();
  const action = useStockAction();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const docs = useQuery({queryKey: ['business-stock', 'media', auth.session?.user.id, listing.id, kind], queryFn: () => stockApi.mediaList(listing.id, kind), retry: false});
  const photo = kind === 'stock_photo';
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({type: photo ? ['image/jpeg','image/png'] : supported, copyToCacheDirectory: true, base64: true});
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.size || asset.size > 3 * 1024 * 1024 || !asset.mimeType || !supported.includes(asset.mimeType) || photo && asset.mimeType === 'application/pdf') throw new Error('Choose a supported file up to 3 MB.');
    const base64 = Platform.OS === 'web' ? asset.base64 ?? await asset.file?.arrayBuffer().then(buffer => {
      let raw = ''; new Uint8Array(buffer).forEach(byte => { raw += String.fromCharCode(byte); }); return btoa(raw);
    }) : await new File(asset.uri).base64();
    if (!base64) throw new Error('Could not read the selected file.');
    await stockApi.mediaUpload(listing.id, kind, asset.mimeType, base64.replace(/^data:[^,]*;base64,/, ''));
  }
  async function open(id: string) {
    const data = await stockApi.mediaDownload(id);
    if (!supported.includes(data.mimeType)) throw new Error('Unsupported document type.');
    const extension = data.mimeType === 'application/pdf' ? 'pdf' : data.mimeType === 'image/png' ? 'png' : 'jpg';
    const name = `fti-business-stock-${id}.${extension}`;
    if (Platform.OS === 'web') {
      const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], {type: data.mimeType}));
      const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      if (!await Sharing.isAvailableAsync()) throw new Error('Document sharing is unavailable on this device.');
      const file = new File(Paths.cache, name);
      try { await file.write(data.base64, {encoding: 'base64'}); await Sharing.shareAsync(file.uri, {mimeType: data.mimeType}); }
      finally { if (file.exists) file.delete(); }
    }
  }
  return <Card style={{gap: 10}}>
    <Txt style={s.h2}>{photo ? 'Stock photos' : 'Supporting certificates'}</Txt>
    <Txt>{photo ? 'JPEG or PNG' : 'PDF, JPEG or PNG'} · Up to 3 MB each. Maximum 10 attachments per listing.</Txt>
    {!photo ? <Txt>Certificates are shared with the seller, FTI reviewers, and buyers who submitted an enquiry.</Txt> : null}
    {docs.isPending ? <Txt>Loading attachments...</Txt> : docs.error ? <Txt accessibilityRole="alert">{docs.error.message}</Txt> : <>
      {!docs.data.length ? <Txt>No {photo ? 'photos' : 'certificates'} added.</Txt> : null}
      {docs.data.map(asset => <View key={asset.id} style={{gap: 8}}>
        {photo ? <Photo asset={asset}/> : <Txt>{asset.mime_type} · {Math.ceil(asset.size_bytes / 1024)} KB</Txt>}
        <Button secondary disabled={action.busy} onPress={() => void action.run(() => open(asset.id), 'File opened.')}>Open {photo ? 'photo' : 'certificate'}</Button>
        {canUpload ? confirmRemove === asset.id ? <>
          <Txt>Remove this attachment from the listing?</Txt>
          <Button disabled={action.busy} onPress={() => void action.run(() => stockApi.mediaRemove(asset.id, listing.version), 'Attachment removed.', () => setConfirmRemove(null))}>Confirm removal</Button>
          <Button secondary onPress={() => setConfirmRemove(null)}>Keep attachment</Button>
        </> : <Button secondary disabled={action.busy} onPress={() => setConfirmRemove(asset.id)}>Remove attachment</Button> : null}
      </View>)}
      {canUpload ? <Button secondary disabled={action.busy} onPress={() => void action.run(pick, 'Attachment upload finished.')}>Add {photo ? 'stock photo' : 'certificate'}</Button> : null}
    </>}
    {action.message ? <Txt accessibilityRole="alert">{action.message}</Txt> : null}
  </Card>;
}
