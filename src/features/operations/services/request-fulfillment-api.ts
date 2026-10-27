import { supabase } from '@core/api/supabase-client';
import type {
  FulfillmentStatus,
  RequestFulfillmentState,
} from '../model/request-fulfillment';

export async function updateRequestFulfillment(
  kind: 'material' | 'fastener',
  requestId: string,
  revision: number,
  status: FulfillmentStatus,
  details: Record<string, string>,
) {
  if (!supabase) throw new Error('Order fulfillment is not configured.');
  const { data, error } = await supabase.rpc('fti_request_fulfillment_update', {
    p_kind: kind,
    p_request: requestId,
    p_revision: revision,
    p_status: status,
    p_details: details,
  });
  if (error) {
    if (error.code === '40001')
      throw new Error(
        'Another staff member updated this request. Refresh requests before continuing.',
      );
    if (error.code === 'PGRST202' || error.code === '42883')
      throw new Error(
        'The request fulfillment database update has not been deployed yet.',
      );
    throw new Error(error.message);
  }
  return data as RequestFulfillmentState;
}
