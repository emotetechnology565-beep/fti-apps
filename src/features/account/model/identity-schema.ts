import { z } from 'zod';
export const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
});
export const addressSchema = z.object({
  line1: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a six-digit PIN code.'),
});
export const businessSchema = z.object({
  legal_name: z.string().trim().min(3).max(200),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
      'Enter a valid GSTIN or leave it empty.',
    ),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
      'Enter a valid PAN or leave it empty.',
    ),
  customer_type: z.enum([
    'retailer',
    'dealer',
    'distributor',
    'manufacturer',
    'industrial_buyer',
  ]),
  billing: addressSchema,
  shipping: addressSchema,
  consent: z.literal(true),
  revision: z.number().int().nonnegative().optional(),
});
export type BusinessApplication = z.infer<typeof businessSchema>;
