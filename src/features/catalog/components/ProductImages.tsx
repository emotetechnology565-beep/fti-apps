import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Row, Txt } from '@shared/ui';
import { catalogApi } from '../data/catalog-repository';

export function ProductImages({ productId }: { productId: string }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['catalog', 'admin-images', productId],
    queryFn: () => catalogApi.adminImages(productId),
    retry: false,
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['catalog'] });
  }
  async function upload() {
    setError('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.8, base64: true,
      });
      if (picked.canceled) return;
      const encoded = picked.assets[0]?.base64;
      if (!encoded || encoded.length > Math.ceil(3 * 1024 * 1024 * 4 / 3)) {
        setError('Choose a JPEG photo up to 3 MB after cropping.');
        return;
      }
      setBusy(true);
      await catalogApi.media('upload', { productId, base64: encoded });
      await refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(assetId: string) {
    setBusy(true); setError('');
    try {
      await catalogApi.media('remove', { assetId });
      setConfirmRemove(null);
      await refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 12 }}>
    <Txt>Product photos ({query.data?.length ?? 0}/8)</Txt>
    {query.isPending ? <Txt>Loading photos…</Txt> : query.error ? <Txt accessibilityRole="alert">{query.error.message}</Txt> : <>
      <Row style={{ flexWrap: 'wrap' }}>
        {query.data.map(image => <Card key={image.id} style={{ width: 160, gap: 8 }}>
          <Image source={{ uri: image.url }} contentFit="cover" style={{ width: 130, height: 105, borderRadius: 6 }} />
          {confirmRemove === image.id ? <>
            <Txt>Remove this photo from the catalogue?</Txt>
            <Button disabled={busy} onPress={() => void remove(image.id)}>Confirm remove</Button>
            <Button secondary disabled={busy} onPress={() => setConfirmRemove(null)}>Cancel</Button>
          </> : <Button secondary disabled={busy} onPress={() => setConfirmRemove(image.id)}>Remove photo</Button>}
        </Card>)}
      </Row>
      <Button secondary disabled={busy || query.data.length >= 8} onPress={() => void upload()}>
        {busy ? 'Updating photos…' : 'Choose product photo'}
      </Button>
      <Txt>JPEG photos up to 3 MB. Photos are public after upload.</Txt>
    </>}
    {!!error && <Txt accessibilityRole="alert">{error}</Txt>}
  </View>;
}
