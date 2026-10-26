import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Button, Txt, c, s } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import {
  matchesFastenerSearch,
  subcategoryLabel,
} from '../model/subcategories';

export function FastenerPhotoCards({
  selected,
  onSelect,
  onlySelected = false,
  search = '',
}: {
  selected: string;
  onSelect: (slug: string) => void;
  onlySelected?: boolean;
  search?: string;
}) {
  const query = useQuery({
    queryKey: ['fastener-photos', 'public'],
    queryFn: drawingApi.photos,
    staleTime: 30000,
    retry: false,
  });
  if (query.isPending)
    return <Txt style={s.muted}>Loading fastener photos…</Txt>;
  if (query.error)
    return (
      <View style={{ gap: 8 }}>
        <Txt style={s.muted}>
          Fastener photos could not be loaded. You can still choose a
          subcategory below.
        </Txt>
        <Button secondary onPress={() => void query.refetch()}>
          Retry fastener photos
        </Button>
      </View>
    );
  const cards = query.data.filter((card) =>
    onlySelected
      ? card.slug === selected
      : matchesFastenerSearch(card.slug, search),
  );
  if (!cards.length) return null;
  return (
    <View style={{ gap: 12, marginBottom: 18 }}>
      {!onlySelected ? <Txt style={s.h2}>Browse fasteners</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {cards.map((card) => (
          <Pressable
            key={card.slug}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${subcategoryLabel(card.slug)} photo`}
            accessibilityState={{ selected: selected === card.slug }}
            onPress={() => onSelect(card.slug)}
            style={{
              width: '47%',
              maxWidth: 250,
              borderWidth: selected === card.slug ? 2 : 1,
              borderColor: selected === card.slug ? c.red : c.line,
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: 'white',
            }}
          >
            <Image
              source={{ uri: card.image_url! }}
              style={{ width: '100%', height: 155 }}
              contentFit="contain"
              accessibilityLabel={`${subcategoryLabel(card.slug)} product photo`}
            />
            <Txt style={{ padding: 12, color: c.ink, fontWeight: '700' }}>
              {subcategoryLabel(card.slug)}
            </Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
