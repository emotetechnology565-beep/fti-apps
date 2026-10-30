import type { Product } from '@features/catalog/model/types';

export type HomeKind = 'steel' | 'fastener' | 'tractor_part';
export const homeDivisions: { kind: HomeKind; name: string }[] = [
  { kind: 'steel', name: 'Raw Materials' }, { kind: 'fastener', name: 'Fasteners' }, { kind: 'tractor_part', name: 'Tractor Parts' },
];
export const rawHomeCategories = [
  { label: 'Round Bright Bars', slug: 'round-bright-bar', aliases: ['round-bright-bar', 'bright-bar', 'round-bright-bars'] },
  { label: 'As-Rolled Bars', slug: 'round-bar-as-rolled', aliases: ['round-bar-as-rolled', 'as-rolled-round-bar', 'as-rolled-bars'] },
  { label: 'Square Bars', slug: 'square', aliases: ['square', 'square-bar', 'square-bars'] },
  { label: 'Flat Bars', slug: 'flat', aliases: ['flat', 'flat-bar', 'flat-bars'] },
  { label: 'Steel Sheets', slug: 'sheet', aliases: ['sheet', 'sheets', 'steel-sheet', 'steel-sheets'] },
];
export const normalizeCategory = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Search keeps the current division unless actual published records or the
// published fastener library identify a better match. No synthetic part numbers.
export function homeSearchKind(query: string, current: HomeKind, products: Product[], fastenerLabels: string[]): HomeKind {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return current;
  const score = (text: string) => tokens.filter(token => text.toLowerCase().includes(token)).length;
  const matches = products.map(product => ({ kind: product.product_kind, score: score([product.name, product.category, product.grade, ...product.variants.flatMap(variant => [variant.sku, variant.size_label ?? '', ...Object.entries(variant.attributes).filter(([key]) => /grade|part|model|compatib/i.test(key)).map(([, value]) => String(value))])].join(' ')) }));
  const best = matches.filter(match => ['steel', 'fastener', 'tractor_part'].includes(match.kind)).sort((a, b) => b.score - a.score)[0];
  const fastenerScore = Math.max(0, ...fastenerLabels.map(score));
  if (fastenerScore > (best?.score ?? 0)) return 'fastener';
  return best && best.score > 0 ? best.kind as HomeKind : current;
}
