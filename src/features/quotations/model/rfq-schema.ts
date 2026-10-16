import { z } from 'zod';
export const rfqSchema = z.object({
  title: z.string().trim().min(3, 'Describe the required material.'),
  quantity: z
    .string()
    .trim()
    .regex(
      /^\d+(\.\d+)?\s*(MT|kg|pieces?|boxes?|bundles?)$/i,
      'Use a quantity and unit, such as 10 MT or 100 pieces.',
    )
    .refine((v) => parseFloat(v) > 0, 'Quantity must be positive.'),
  notes: z.string().max(1500),
});
