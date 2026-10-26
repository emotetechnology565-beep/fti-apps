import type { DrawingDefinition } from './types';
import { hexThreadLength } from './hex-render';

export type WeightRow = {
  chart: string;
  row_label: string;
  column_label: string;
  weight_basis: '100_pieces' | 'piece' | 'metre';
  weight_kg_per_piece: number | string | null;
  weight_kg_per_metre: number | string | null;
};
export type WeightTarget = {
  charts: string[];
  rows: string[];
  columns: string[];
  description: string;
};
const coarsePitch: Record<number, number> = {
  5: 0.8,
  6: 1,
  8: 1.25,
  10: 1.5,
  12: 1.75,
  14: 2,
  16: 2,
  18: 2.5,
  20: 2.5,
  22: 2.5,
  24: 3,
  27: 3,
  30: 3.5,
  33: 3.5,
  36: 4,
  39: 4,
};

// Match only the standards, editions and coarse pitches covered by the import.
export function drawingWeightTarget(
  definition: DrawingDefinition,
  length: number,
  withNut: boolean,
): WeightTarget | null {
  const { diameter, pitch } = definition.dimensions;
  if (
    definition.standard !== 'IS 1363' ||
    /fine/i.test(definition.size) ||
    pitch !== coarsePitch[diameter]
  )
    return null;
  if (
    definition.shape === 'hex-nut' &&
    ['1967', '1992'].includes(definition.edition)
  ) {
    return {
      charts: ['18 Nuts'],
      rows: [`M${diameter}`],
      columns: [
        definition.edition === '1967'
          ? 'OLD SPEC IS 1363/67'
          : 'NEW SPEC IS 1363/92',
      ],
      description: `Hex nut · ${definition.standard}:${definition.edition}`,
    };
  }
  if (
    definition.edition !== '1967' ||
    !['hex-bolt', 'hex-screw'].includes(definition.shape)
  )
    return null;
  try {
    hexThreadLength(definition, length);
  } catch {
    return null;
  }
  const full = definition.shape === 'hex-screw';
  const charts = full
    ? withNut
      ? ['04 Full bolts+nuts Metric 1', '05 Full bolts+nuts Metric 2']
      : ['09 Full bolts only Metric 1', '10 Full bolts only Metric 2']
    : withNut
      ? ['01 Half bolts+nuts Metric 1', '02 Half bolts+nuts Metric 2']
      : ['07 Half bolts only Metric'];
  return {
    charts,
    rows: [`${length}mm`, `${length} mm`],
    columns: [
      `DIAMETER / M ${diameter}`,
      `DIAMETER / M${diameter}`,
      `M ${diameter}`,
      `M${diameter}`,
    ],
    description: `Mild steel · ${full ? 'Full' : 'Half'} thread · ${withNut ? 'With nut' : 'Without nut'} · IS 1363:1967`,
  };
}

export function categoryWeightChart(category: string): string | null {
  if (['heavy-hex-nut', 'square-nut'].includes(category)) return '18 Nuts';
  if (
    [
      'plain-washer',
      'machined-washer',
      'spring-washer',
      'square-washer',
    ].includes(category)
  )
    return '19 Washers';
  return null;
}
export function categoryWeightColumn(
  category: string,
  column: string,
): boolean {
  if (category === 'heavy-hex-nut')
    return column === 'ASTM A-194 / UNC HEAVY HEX NUTS';
  if (category === 'square-nut') return column === 'SQUARE NUTS - BSW';
  if (category === 'plain-washer')
    return column.startsWith('PLAIN PUNCHED WASHER');
  if (category === 'machined-washer')
    return column.startsWith('MACHINED WASHER');
  if (category === 'spring-washer') return column.startsWith('SPRING WASHER');
  if (category === 'square-washer')
    return column.startsWith('SQUARE TAPER WASHERS');
  return false;
}
export function weightQuantity(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 1_000_000
    ? quantity
    : null;
}
export function calculateWeight(
  matches: WeightRow[],
  quantity: number | null,
): { each: number; total: number } | null {
  if (
    matches.length !== 1 ||
    quantity === null ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 1_000_000
  )
    return null;
  const row = matches[0];
  if (
    !['100_pieces', 'piece'].includes(row.weight_basis) ||
    row.weight_kg_per_piece === null
  )
    return null;
  // The generated database column already converts kg/100 to kg/piece.
  const each = Number(row.weight_kg_per_piece);
  if (!Number.isFinite(each) || each <= 0 || !Number.isFinite(each * quantity))
    return null;
  return { each, total: each * quantity };
}
