import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Button, Txt, c, s } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import type { DrawingDefinition } from '../model/types';
import { FastenerSupplyDetails } from './FastenerSupplyDetails';
import { MatrixFastenerCard } from './MatrixFastenerCard';
import { productCard, productCardWidth } from '@shared/theme/product-card';
import {
  matchesFastenerSearch,
  subcategoryLabel,
  drawingSubcategory,
  allSubcategories,
} from '../model/subcategories';

export function FastenerPhotoCards({
  selected,
  onSelect,
  onlySelected = false,
  search = '',
  drawings = [],
  fallbackWhenEmpty = false,
  matrix = false,
  desktop = false,
}: {
  selected: string;
  onSelect: (slug: string) => void;
  onlySelected?: boolean;
  search?: string;
  drawings?: DrawingDefinition[];
  fallbackWhenEmpty?: boolean;
  matrix?: boolean;
  desktop?: boolean;
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
  if (!cards.length) {
    if (!fallbackWhenEmpty) return null;
    const categories = allSubcategories.filter((item) =>
      matchesFastenerSearch(item.value, search),
    );
    return (
      <View style={{ gap: 12 }}>
        <Txt style={s.muted}>
          {categories.length
            ? 'Choose a fastener to view sizes, standards and drawings.'
            : 'No matching fasteners. Try another search.'}
        </Txt>
        {categories.map((item) => (
          <Button
            key={item.value}
            secondary
            onPress={() => onSelect(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </View>
    );
  }
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
          if (matrix && !onlySelected) {
            const columns = desktop ? (gridWidth >= 630 ? 2 : 1) : gridWidth >= 920 ? 3 : gridWidth >= 630 ? 2 : 1;
            return (
              <View
                key={card.slug}
                style={{
                  width: gridWidth
                    ? (gridWidth - 12 * (columns - 1)) / columns
                    : '100%',
                }}
              >
                <MatrixFastenerCard
                  desktop={desktop}
                  slug={card.slug}
                  imageUrl={card.image_url}
                  drawings={productDrawings}
                  onSelect={() => onSelect(card.slug)}
                />
              </View>
            );
          }
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
                    backgroundColor: '#F8FAFC',
                    color: '#111827',
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
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: 'white',
              }}
            >
              <View style={{ height: 3, backgroundColor: c.brandBlue }} />
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
                  color: '#111827',
                  backgroundColor: '#F8FAFC',
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
