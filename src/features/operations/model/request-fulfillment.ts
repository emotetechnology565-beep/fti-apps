export const fulfillmentSteps = [
  { status: 'pending_confirmation', label: 'Awaiting confirmation' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'processing', label: 'Processing' },
  { status: 'shipped', label: 'Dispatched' },
  { status: 'delivered', label: 'Delivered' },
] as const;
export type FulfillmentStatus = (typeof fulfillmentSteps)[number]['status'];
export type RequestFulfillmentState = {
  status: FulfillmentStatus;
  revision: number;
  confirmed_total?: string | null;
  confirmation_note?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  vehicle_number?: string | null;
  delivery_note?: string | null;
  history: { status: FulfillmentStatus; at: string; actor_id: string }[];
};
export const initialFulfillment: RequestFulfillmentState = {
  status: 'pending_confirmation',
  revision: 0,
  history: [],
};
