import type { Variant } from './types';
import { sharedMaterialSizes } from './shared-material-options';
import { matchesSize } from './catalog-filters';

// Keep matching consistent with internal.catalog_size_matches in Postgres.
export function matchesCatalogSize(variant: Variant, size: number): boolean {
  return matchesSize(variant, size);
}

export function availableCatalogFilters(variants: Variant[], size?: number) {
  const explicitSizes = variants.flatMap(variant => Array.isArray(variant.attributes.available_sizes)
    ? variant.attributes.available_sizes.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    : []);
  const candidates = [...new Set<number>([...sharedMaterialSizes, ...explicitSizes])].sort((a, b) => a - b);
  return {
    sizes: candidates.filter(candidate => variants.some(variant => matchesCatalogSize(variant, candidate))),
    grades: [...new Set(variants.filter(variant => size === undefined || matchesCatalogSize(variant, size))
      .map(variant => String(variant.attributes.grade ?? '').trim().toUpperCase()).filter(Boolean))].sort(),
  };
}
