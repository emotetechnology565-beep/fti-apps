import { supabase } from '@core/api/supabase-client';
import type { FastenerDetail } from '../model/fastener-requirement';

export async function loadFastenerDetail(subcategory: string): Promise<FastenerDetail> {
  if (!supabase) throw new Error('Fastener catalogue is not configured.');
  const { data, error } = await supabase.rpc('fti_catalog_fastener_detail', { p_subcategory: subcategory });
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Fastener details need the latest catalogue database update. Please contact FTI.'
    : 'Fastener details could not be loaded. Please retry.');
  if (!data) throw new Error('This fastener is unavailable.');
  return data as FastenerDetail;
}
