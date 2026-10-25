import source from '../data/fastener-references.json';
import squareSizes from '../data/square-bar-sizes.json';

export type ReferenceGroup = { id: string; label: string; standard?: string };
export type ReferenceChart = {
  id: string; title: string; standard: string; unit: string; filename?: string;
  sha256?: string; page?: number; date?: string; pdfUrl?: string; groups: ReferenceGroup[]; notes: string[];
};
export type ReferenceRow = {
  chartId: string; groupId: string; size: string; length?: string;
  weightKgPer1000?: number; dimensions?: Record<string,string>; reviewNote?: string;
  areaMm2?: number; weightKgPerMetre?: number;
};
const dataset = source as { charts: ReferenceChart[]; rows: ReferenceRow[] };
const squareChart: ReferenceChart = {
  id: 'square-bar-sizes', title: 'Detailed square bar sizes',
  standard: 'Size and approximate weight from the supplied square bar chart', unit: 'kg/m',
  groups: [{ id: 'square-bar', label: 'Square bar — MS / Alloy' }],
  notes: ['Dimensions are in mm; cross-sectional area is in mm²; approximate weight is in kg per metre.',
    'MS and alloy rates were blank in the source. Request a quote for pricing.',
    'Weights are retained as printed. Confirm material grade, tolerances and availability when ordering.'],
};
const squareRows: ReferenceRow[] = squareSizes.map(row => ({
  chartId: squareChart.id, groupId: 'square-bar', size: `${row.sideMm} × ${row.sideMm}`,
  areaMm2: row.areaMm2, weightKgPerMetre: row.weightKgPerMetre,
}));

type ProductReference = { chartId: string; groupIds: string[] };
const hexReferences: ProductReference[] = [
  { chartId: 'bolt-dimensions', groupIds: ['hex-bolt'] },
  { chartId: 'metric-weights', groupIds: ['hex-bolt','hex-nut'] },
  { chartId: 'unc-weights', groupIds: ['hex-bolt','hex-nut'] },
];
const productReferences: Record<string, ProductReference[]> = {
  'full-thread-hex-screw': hexReferences,
  'half-thread-hex-bolt': hexReferences,
  'plain-washers': [{ chartId: 'washer-weights', groupIds: ['plain-washer','machined-washer'] }],
  'spring-washers': [{ chartId: 'washer-weights', groupIds: ['spring-washer'] }],
};

export function chartsForProduct(slug: string, category?: string): ReferenceChart[] {
  if (['square', 'square-bar', 'square-bars'].includes((category ?? '').toLowerCase().trim()) ||
    ['square', 'square-bar', 'square-bar-ms', 'square-bar-alloy', 'square-grade-list'].includes(slug)) return [squareChart];
  return (productReferences[slug] ?? []).flatMap(reference => {
    const chart = dataset.charts.find(item => item.id === reference.chartId);
    return chart ? [{ ...chart, groups: chart.groups.filter(group => reference.groupIds.includes(group.id)) }] : [];
  });
}

function normalizedMeasure(value: string): string {
  return value.trim().toLowerCase().replace(/^m-?/, '').replace(/mm$/, '')
    .replace(/["\u2033]/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

export function referenceRows(chartId: string, groupId: string, size = '', length = ''): ReferenceRow[] {
  if (chartId === squareChart.id) {
    const measure = (value: string) => {
      const parts = value.toLowerCase().replace(/mm/g, '').replace(/\s/g, '').split(/[x×]/);
      return parts.length === 2 && parts[0] === parts[1] ? parts[0] : parts.join('x');
    };
    return squareRows.filter(row => row.groupId === groupId && !length && (!size.trim() || measure(row.size) === measure(size)));
  }
  const wantedSize = normalizedMeasure(size);
  const wantedLength = normalizedMeasure(length);
  return dataset.rows.filter(row => row.chartId === chartId && row.groupId === groupId &&
    (!wantedSize || normalizedMeasure(row.size) === wantedSize) &&
    (!wantedLength || normalizedMeasure(row.length ?? '') === wantedLength));
}

export function referenceSizes(chartId: string, groupId: string): string[] {
  return [...new Set(referenceRows(chartId, groupId).map(row => row.size))];
}
