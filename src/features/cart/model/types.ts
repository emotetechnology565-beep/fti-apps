import type { DrawingInput } from '@features/drawings/export';
import type { ManualRequest } from '@features/catalog/model/manual-material';
export type MaterialCartSelection = {
  key: string;
  name: string;
  size: string;
  grade: string;
  brand?: string;
  unit: string;
  minimum: number;
  indicativePrice?: { amount: number; unit: string; tax: string };
  fastenerRequest?: {
    definition: string;
    revision: number;
    input: DrawingInput;
    grade: string;
    withNut: boolean;
  };
  optionId?: string;
  catalogVariantId?: string;
  manualRequest?: ManualRequest;
};
export type CartLine = {
  productId: string;
  variantId?: string;
  quantity: number;
  material?: MaterialCartSelection;
};
