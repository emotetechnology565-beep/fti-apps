import type { CartLine } from '@features/cart';
export type Order = {
  id: string;
  lines: CartLine[];
  total: number;
  address: string;
  status: 'Confirmed' | 'Dispatched' | 'Delivered';
  created: string;
  market: string;
};
