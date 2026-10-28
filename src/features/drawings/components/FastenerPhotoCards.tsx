import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Button, Txt, c, s } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import type { DrawingDefinition } from '../model/types';
import { FastenerSupplyDetails } from './FastenerSupplyDetails';
import { productCard, productCardWidth } from '@shared/theme/product-card';
import {
  matchesFastenerSearch,
  subcategoryLabel,
  drawingSubcategory,
} from '../model/subcategories';

export function FastenerPhotoCards({
  selected,
  onSelect,
  onlySelected = false,
  search = '',
  drawings = [],
}: {
  selected: string;
  onSelect: (slug: string) => void;
  onlySelected?: boolean;
  search?: string;
  drawings?: DrawingDefinition[];
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const [sectionHeights, setSectionHeights] = useState<Record<string, number>>(
    {},
  );
  const measureSection = useCallback((section: string, height: number) => {
    setSectionHeights((previous) =>
      height > (previous[section] ?? 0) + 0.5
        ? { ...previous, [section]: height }
        : previous,
    );
  }, []);
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
      {!onlySelected ? (
        <Txt style={s.muted}>{cards.length} fasteners</Txt>
      ) : null}
      <View
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (Math.abs(width - gridWidth) > 0.5) {
            setGridWidth(width);
            setSectionHeights({});
          }
        }}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          gap: 12,
        }}
      >
        {cards.map((card) => {
          const productDrawings = drawings.filter(
            (row) => drawingSubcategory(row) === card.slug,
          );
          if (onlySelected)
            return (
              <View
                key={card.slug}
                style={{
                  width: '100%',
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <Txt
                  style={{
                    padding: 16,
                    backgroundColor: '#e6f2ff',
                    color: '#075299',
                    fontWeight: '700',
                    fontSize: 17,
                  }}
                >
                  {subcategoryLabel(card.slug)}
                </Txt>
                <View
                  style={{
                    flexDirection: gridWidth >= 600 ? 'row' : 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <Image
                    source={{ uri: card.image_url! }}
                    contentFit="contain"
                    accessibilityLabel={`${subcategoryLabel(card.slug)} product photo`}
                    style={{
                      width: gridWidth >= 600 ? '38%' : '100%',
                      height: gridWidth >= 600 ? 300 : 210,
                    }}
                  />
                  <View
                    style={{
                      flex: gridWidth >= 600 ? 1 : undefined,
                      width: gridWidth >= 600 ? undefined : '100%',
                      padding: 4,
                    }}
                  >
                    <FastenerSupplyDetails
                      sectionHeights={{}}
                      onMeasureSection={measureSection}
                      subcategory={card.slug}
                      drawings={productDrawings}
                    />
                  </View>
                </View>
              </View>
            );
          return (
            <Pressable
              key={card.slug}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${subcategoryLabel(card.slug)} photo`}
              accessibilityState={{ selected: selected === card.slug }}
              onPress={() => onSelect(card.slug)}
              style={{
                width: productCardWidth(gridWidth) ?? '47%',
                minHeight: productCard.minHeight,
                borderWidth: 1,
                borderColor: selected === card.slug ? c.red : c.line,
                borderRadius: productCard.radius,
                overflow: 'hidden',
                backgroundColor: 'white',
              }}
            >
              <View style={{ height: 4, flexDirection: 'row' }}>
                <View style={{ flex: 1, backgroundColor: c.red }} />
                <View style={{ flex: 2, backgroundColor: '#075299' }} />
              </View>
              <Image
                source={{ uri: card.image_url! }}
                style={{ width: '100%', height: productCard.imageHeight }}
                contentFit="contain"
                accessibilityLabel={`${subcategoryLabel(card.slug)} product photo`}
              />
              <Txt
                onLayout={(event) =>
                  measureSection('title', event.nativeEvent.layout.height)
                }
                style={{
                  padding: 12,
                  minHeight: sectionHeights.title ?? productCard.titleHeight,
                  color: '#075299',
                  backgroundColor: '#e6f2ff',
                  fontWeight: '700',
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {subcategoryLabel(card.slug)}
              </Txt>
              <FastenerSupplyDetails
                compact
                sectionHeights={sectionHeights}
                onMeasureSection={measureSection}
                subcategory={card.slug}
                drawings={productDrawings}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
