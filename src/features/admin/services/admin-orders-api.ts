import { supabase } from '@core/api/supabase-client';
import {
  orderFilterError,
  type AdminOrdersResult,
  type OrderFilters,
} from '../model/admin-orders';

export async function fetchAdminOrders(
  filters: OrderFilters,
  offset = 0,
  limit = 24,
): Promise<AdminOrdersResult> {
  const validation = orderFilterError(filters);
  if (validation) throw new Error(validation);
  if (!supabase) throw new Error('Ordering service is not configured.');
  const { data, error } = await supabase.rpc('fti_admin_orders', {
    p_search: filters.search.trim(),
    p_kind: filters.kind,
    p_status: filters.status,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_offset: offset,
    p_limit: limit,
  });
  if (error)
    throw new Error(
      error.code === 'PGRST202'
        ? 'Orders overview needs the latest database update. Please contact your administrator.'
        : error.message,
    );
  return data as AdminOrdersResult;
}
