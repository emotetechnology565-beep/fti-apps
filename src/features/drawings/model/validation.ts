import { z } from 'zod';
import { drawingShapes } from './types';
import { allSubcategories, subcategoryShapes } from './subcategories';

const positive = z.number().finite().positive().max(10000);
export const dimensionSchema = z
  .object({
    diameter: positive,
    widths: z.array(positive).max(200),
    lengths: z.array(positive).max(300),
    depth: positive.optional(),
    radius: positive.optional(),
    pitch: positive.optional(),
    thread_base: positive.optional(),
    head_width: positive.optional(),
    head_height: positive.optional(),
  })
  .strict();
export const definitionSchema = z
  .object({
    subcategory: z
      .string()
      .refine(
        (value) => allSubcategories.some((item) => item.value === value),
        'Choose a valid fastener subcategory.',
      )
      .optional(),
    family: z.enum(['foundation', 'roofing', 'coach']).optional(),
    standard: z.string().regex(/^IS [1-9][0-9]{0,5}$/),
    edition: z.string().regex(/^[0-9]{4}$/),
    shape: z.enum(drawingShapes),
    size: z.string().trim().min(1).max(60),
    source: z.string().trim().min(3).max(500),
    notes: z.string().max(2000),
    dimensions: dimensionSchema,
  })
  .superRefine((value, context) => {
    if (
      value.subcategory &&
      !subcategoryShapes(value.subcategory).includes(value.shape)
    )
      context.addIssue({
        code: 'custom',
        message:
          'This drawing shape does not match the selected subcategory. A matching template must be configured first.',
      });
    if (
      value.family === 'foundation' &&
      (value.standard === 'IS 730' || value.shape === 'coach')
    )
      context.addIssue({
        code: 'custom',
        message:
          'Foundation bolts require their own applicable standard and bolt shape.',
      });
    if (
      value.family &&
      (value.family === 'coach') !== (value.shape === 'coach')
    )
      context.addIssue({
        code: 'custom',
        message: 'Coach screw shapes must use the coach screw family.',
      });
    const d = value.dimensions;
    const missing =
      value.shape === 'coach'
        ? !d.head_width || !d.head_height || !d.pitch
        : !d.thread_base ||
          (!['j-ii', 'u-round'].includes(value.shape) &&
            (!d.widths.length || !d.lengths.length || !d.radius)) ||
          (['j-i', 'l'].includes(value.shape) && !d.depth);
    if (missing)
      context.addIssue({
        code: 'custom',
        message: 'Required dimensions are missing for this shape.',
      });
    if (d.head_width && d.head_width <= d.diameter)
      context.addIssue({
        code: 'custom',
        message: 'Head width must exceed diameter.',
      });
    if (
      new Set(d.widths).size !== d.widths.length ||
      new Set(d.lengths).size !== d.lengths.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Width and length options must be unique.',
      });
  });
export function normalizeStandard(value: string) {
  const match = value
    .trim()
    .match(/^(?:IS\s*[: -]?\s*)?([1-9][0-9]{0,5})(?:\s*[:/-]\s*([0-9]{4}))?$/i);
  return match ? { standard: `IS ${match[1]}`, edition: match[2] } : null;
}
