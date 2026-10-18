import source from '../data/fastener-references.json';

export type ReferenceGroup = { id: string; label: string; standard?: string };
export type ReferenceChart = {
  id: string; title: string; standard: string; unit: string; filename: string;
  sha256: string; page: number; date?: string; pdfUrl?: string; groups: ReferenceGroup[]; notes: string[];
};
export type ReferenceRow = {
  chartId: string; groupId: string; size: string; length?: string;
  weightKgPer1000?: number; dimensions?: Record<string,string>; reviewNote?: string;
};
const dataset = source as { charts: ReferenceChart[]; rows: ReferenceRow[] };

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

export function chartsForProduct(slug: string): ReferenceChart[] {
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
  const wantedSize = normalizedMeasure(size);
  const wantedLength = normalizedMeasure(length);
  return dataset.rows.filter(row => row.chartId === chartId && row.groupId === groupId &&
    (!wantedSize || normalizedMeasure(row.size) === wantedSize) &&
    (!wantedLength || normalizedMeasure(row.length ?? '') === wantedLength));
}

export function referenceSizes(chartId: string, groupId: string): string[] {
  return [...new Set(referenceRows(chartId, groupId).map(row => row.size))];
}
