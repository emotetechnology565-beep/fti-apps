import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { drawingApi } from '../services/drawing-api';
import { FastenerPhotoCards } from './FastenerPhotoCards';
import { Button, Card, Txt } from '@shared/ui';

/** Published fastener cards are maintained separately from catalogue SKU records. */
export function FastenerCatalogueCards({ search = '' }: { search?: string }) {
  const drawings = useQuery({
    queryKey: ['fastener-dimensions', 'public'],
    queryFn: drawingApi.list,
    staleTime: 30000,
    retry: false,
  });
  if (drawings.isPending)
    return (
      <Card>
        <Txt>Loading fastener catalogue…</Txt>
      </Card>
    );
  if (drawings.error)
    return (
      <Card>
        <Txt accessibilityRole="alert">{drawings.error.message}</Txt>
        <Button secondary onPress={() => void drawings.refetch()}>
          Retry fastener catalogue
        </Button>
      </Card>
    );
  return (
    <FastenerPhotoCards
      selected=""
      search={search}
      fallbackWhenEmpty
      matrix
      drawings={drawings.data ?? []}
      onSelect={(slug) =>
        router.push({ pathname: '/fastener/[slug]', params: { slug } })
      }
    />
  );
}
