import { supabase } from '@core/api/supabase-client';
import type { WeightRow, WeightTarget } from '../model/weight';

const columns =
  'chart,row_label,column_label,weight_basis,weight_kg_per_piece,weight_kg_per_metre';
export async function lookupDrawingWeight(
  target: WeightTarget,
): Promise<WeightRow[]> {
  const client = supabase;
  if (!client) throw new Error('Weight lookup is unavailable.');
  const { data, error } = await client
    .from('fastener_weight_reference')
    .select(columns)
    .eq('source_key', 'approximate-weight')
    .eq('review_required', false)
    .in('chart', target.charts)
    .in('row_label', target.rows)
    .in('column_label', target.columns);
  if (error) throw new Error('Weight lookup is temporarily unavailable.');
  return (data ?? []) as WeightRow[];
}
export async function listCategoryWeights(
  chart: string,
  signal: AbortSignal,
): Promise<WeightRow[]> {
  if (!supabase) throw new Error('Weight lookup is unavailable.');
  const rows: WeightRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('fastener_weight_reference')
      .select(columns)
      .eq('source_key', 'approximate-weight')
      .eq('chart', chart)
      .eq('review_required', false)
      .order('workbook_row')
      .range(from, from + 999)
      .abortSignal(signal);
    if (error) throw new Error('Weight lookup is temporarily unavailable.');
    rows.push(...((data ?? []) as WeightRow[]));
    if (!data || data.length < 1000) return rows;
  }
}
