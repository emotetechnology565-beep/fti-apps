import type { DrawingInput } from '@features/drawings/export';
import type { ManualRequest } from '@features/catalog/model/manual-material';
import type { FastenerRequirement } from '@features/drawings/model/fastener-requirement';
export type MaterialCartSelection = {
  key: string;
  name: string;
  size: string;
  grade: string;
  brand?: string;
  imageUrl?: string;
  unit: string;
  minimum: number;
  indicativePrice?: { amount: number; unit: string; tax: string };
  fastenerRequirement?: FastenerRequirement;
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
