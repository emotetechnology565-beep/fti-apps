import { supabase } from '@core/api/supabase-client';
import type {
  DrawingDefinition,
  FastenerPhotoCard,
  FastenerPhotoLibrary,
} from '../model/types';
import { definitionSchema } from '../model/validation';

async function rpc<T>(
  operation: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error('Dimension library is not configured.');
  const { data, error } = await supabase.functions.invoke('catalog', {
    body: { operation, arguments: args },
  });
  if (error) {
    let message =
      'Could not load or save dimensions. Check that the dimension migration and catalogue function are deployed.';
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body.message === 'string') message = body.message;
      } catch {
        /* Retain actionable fallback. */
      }
    }
    throw new Error(message);
  }
  return data.data as T;
}

export const drawingApi = {
  photos: () =>
    rpc<Pick<FastenerPhotoCard, 'slug' | 'label' | 'image_url'>[]>(
      'fti_catalog_fastener_photos',
    ),
  photoAdmin: () =>
    rpc<FastenerPhotoLibrary>('fti_catalog_fastener_photo_admin'),
  savePhoto: (
    card: FastenerPhotoCard,
    assetId: string | null,
    published: boolean,
  ) =>
    rpc<FastenerPhotoCard>('fti_catalog_fastener_photo_save', {
      p_slug: card.slug,
      p_revision: card.revision,
      p_asset_id: assetId,
      p_published: published,
    }),
  list: () => rpc<DrawingDefinition[]>('fti_catalog_drawing_list'),
  admin: () => rpc<DrawingDefinition[]>('fti_catalog_drawing_admin'),
  save: (id: string | null, revision: number | null, value: unknown) =>
    rpc<DrawingDefinition>('fti_catalog_drawing_subcategory_save', {
      p_id: id,
      p_revision: revision,
      p_definition: definitionSchema.parse(value),
    }),
  publish: (row: DrawingDefinition, visible: boolean) =>
    rpc<DrawingDefinition>('fti_catalog_drawing_publish', {
      p_id: row.id,
      p_revision: row.revision,
      p_visible: visible,
    }),
};
