import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { drawingApi } from '../services/drawing-api';
import { FastenerPhotoCards } from './FastenerPhotoCards';

/** Published fastener cards are maintained separately from catalogue SKU records. */
export function FastenerCatalogueCards({ search = '' }: { search?: string }) {
  const drawings = useQuery({
    queryKey: ['fastener-dimensions', 'public'],
    queryFn: drawingApi.list,
    staleTime: 30000,
    retry: false,
  });
  return (
    <FastenerPhotoCards
      selected=""
      search={search}
      drawings={drawings.data ?? []}
      onSelect={(slug) =>
        router.push({ pathname: '/fastener/[slug]', params: { slug } })
      }
    />
  );
}
