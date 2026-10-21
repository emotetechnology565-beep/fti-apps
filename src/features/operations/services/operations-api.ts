import { supabase } from '@core/api/supabase-client';
import { readOperationsResponse } from './operations-response';
export async function operationsRpc<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase || !url || !key) throw new Error('Operations service is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Your session expired. Sign in again to update your preferences.');
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/operations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, arguments: args }),
    });
  } catch {
    throw new Error('Could not reach the operations service. Check your connection and refresh your updates before trying again.');
  }
  return readOperationsResponse<T>(response, operation);
}


export type Ticket = {id:string;subject:string;status:string;order_id:string|null;created_at:string};
export type Message = {id:string;author_id:string;body:string;created_at:string};
export type DispatchOrder = {id:string;order_no:string;status:string};
export type Shipment = {id:string;carrier:string;tracking_number:string;vehicle_number:string|null;status:string;delivery_note:string|null};
export type Notice = {id:string;payload:{title?:string;entity_id?:string;request_type?:string;request_state?:string};read_at:string|null;created_at:string};
export type Report = {orders_by_status:Record<string,number>;open_tickets:number;transfers_awaiting_review:number;failed_outbox_events:number};

export type PrivateDocument = { id: string; mime_type: string; size_bytes: number; created_at: string };
async function operationsMedia<T>(body: Record<string, unknown>): Promise<T> {
 if (!supabase) throw new Error('Private document service is not configured.');
 const { data, error } = await supabase.functions.invoke('operations-media', { body });
 if (error) {
  let message = 'Private document service is unavailable. Please try again.';
  if (error.context instanceof Response) {
   try { const details = await error.context.json(); if (typeof details.message === 'string') message = details.message; }
   catch { /* No structured response. */ }
  }
  throw new Error(message);
 }
 return data.data as T;
}
export const operationsMediaApi = {
 list: (kind: string, entityId: string) => operationsRpc<PrivateDocument[]>('fti_operations_media_list',{p_kind:kind,p_entity:entityId}),
 upload: (kind: string, entityId: string, mimeType: string, base64: string) => operationsMedia<{id:string}>({operation:'upload',kind,entityId,mimeType,base64}),
 download: (assetId: string) => operationsMedia<{mimeType:string;base64:string}>({operation:'download',assetId}),
};

export type FailedEvent = {id:string;event_type:string;attempts:number;last_error:string|null;created_at:string};

export type WhatsAppJob = {id:string;template_code:string;status:string;attempts:number;last_error:string|null;created_at:string};

export type AuditRow = {id:number;actor_id:string|null;action:string;resource_type:string;resource_id:string|null;created_at:string};
export type DailyReport = {orders:{report_day:string;orders_created:number;quoted_order_value:string}[];tickets:{report_day:string;tickets_created:number}[];payments:{report_day:string;transfer_claims:number;verified_transfers:number}[]};

export type Announcement = {id:string;title:string;body:string;status?:string;created_at?:string;published_at:string|null};
