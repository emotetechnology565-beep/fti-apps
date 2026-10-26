import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Field, Txt, s, c } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import { DimensionSelect } from './DimensionSelect';
import type { FastenerPhotoCard, FastenerPhotoLibrary } from '../model/types';
import { allSubcategories, subcategoryLabel } from '../model/subcategories';

export function FastenerPhotoAdmin({
  initialSubcategory = '',
}: { initialSubcategory?: string } = {}) {
  const auth = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['fastener-photos', 'admin', auth.session?.user.id],
    queryFn: drawingApi.photoAdmin,
    retry: false,
  });
  const [slug, setSlug] = useState(initialSubcategory);
  const [notice, setNotice] = useState('');
  const selected = query.data?.cards.find((card) => card.slug === slug);
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Subcategory photos</Txt>
      <Txt style={s.muted}>
        Publish a photo card without creating a size or SKU. Clicking it opens
        the subcategory’s filters. Choose the correct product photo; no photo is
        assigned automatically.
      </Txt>
      {query.isPending ? (
        <Txt>Loading photo library…</Txt>
      ) : query.error ? (
        <>
          <Txt accessibilityRole="alert">{query.error.message}</Txt>
          <Button secondary onPress={() => void query.refetch()}>
            Retry photo library
          </Button>
        </>
      ) : (
        <>
          <DimensionSelect
            label="Fastener subcategory"
            value={slug}
            options={allSubcategories.filter((item) =>
              query.data.cards.some((card) => card.slug === item.value),
            )}
            onChange={(value) => {
              setSlug(value);
              setNotice('');
            }}
          />
          {selected ? (
            <PhotoEditor
              key={`${selected.slug}:${selected.revision}`}
              card={selected}
              photos={query.data.photos}
              onSaved={async (published) => {
                await client.invalidateQueries({
                  queryKey: ['fastener-photos'],
                });
                setNotice(
                  published
                    ? 'Subcategory photo published.'
                    : 'Subcategory photo withdrawn.',
                );
              }}
            />
          ) : null}
        </>
      )}
      {notice ? <Txt accessibilityRole="alert">{notice}</Txt> : null}
    </Card>
  );
}
function PhotoEditor({
  card,
  photos,
  onSaved,
}: {
  card: FastenerPhotoCard;
  photos: FastenerPhotoLibrary['photos'];
  onSaved: (published: boolean) => Promise<void>;
}) {
  const [assetId, setAssetId] = useState(card.asset_id ?? '');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(published: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await drawingApi.savePhoto(
        card,
        published ? assetId : card.asset_id,
        published,
      );
      await onSaved(published);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = photos.find((photo) => photo.id === assetId);
  return (
    <View style={{ gap: 12 }}>
      <Txt>
        {subcategoryLabel(card.slug)} ·{' '}
        {card.published ? 'Published' : 'Not published'}
      </Txt>
      {selected ? (
        <Image
          source={{ uri: selected.image_url }}
          style={{ width: '100%', height: 200 }}
          contentFit="contain"
          accessibilityLabel={`${card.label} selected photo`}
        />
      ) : null}
      <Field
        label="Find a fastener photo"
        value={search}
        onChangeText={setSearch}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {photos
          .filter((photo) =>
            photo.product_name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((photo, index) => (
            <Pressable
              key={photo.id}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityLabel={`Photo ${photo.product_name} ${index + 1}`}
              accessibilityState={{ checked: assetId === photo.id }}
              onPress={() => setAssetId(photo.id)}
              style={{
                width: 140,
                borderWidth: assetId === photo.id ? 2 : 1,
                borderColor: assetId === photo.id ? c.red : c.line,
                borderRadius: 6,
                padding: 8,
              }}
            >
              <Image
                source={{ uri: photo.image_url }}
                style={{ width: '100%', height: 100 }}
                contentFit="contain"
              />
              <Txt style={{ fontSize: 12 }}>{photo.product_name}</Txt>
            </Pressable>
          ))}
      </View>
      {!photos.length ? (
        <Txt>
          Upload fastener product photos through the catalogue Photos tab, then
          reload this library. The product may remain a draft.
        </Txt>
      ) : null}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      <Button disabled={busy || !assetId} onPress={() => void save(true)}>
        {busy ? 'Updating photo…' : 'Publish subcategory photo'}
      </Button>
      {card.published ? (
        <Button secondary disabled={busy} onPress={() => void save(false)}>
          Withdraw subcategory photo
        </Button>
      ) : null}
    </View>
  );
}
