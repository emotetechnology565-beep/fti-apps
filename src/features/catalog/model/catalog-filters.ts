import type { Variant } from './types';

export function matchesSize(variant: Pick<Variant, 'diameter_mm' | 'size_label' | 'attributes'>, size?: number): boolean {
  if (size === undefined) return true;
  if (variant.diameter_mm !== null && variant.diameter_mm !== undefined) return Number(variant.diameter_mm) === size;
  const label = String(variant.attributes.size_group ?? variant.size_label ?? '').trim().toUpperCase();
  if (label === 'ALL SIZES') return true;
  const range = label.match(/^(\d+(?:\.\d+)?)\s*(?:MM)?\s*(?:TO|[-–])\s*(\d+(?:\.\d+)?)\s*(?:MM)?$/);
  if (range) return size >= Number(range[1]) && size <= Number(range[2]);
  const exact = label.match(/^(\d+(?:\.\d+)?)\s*MM$/);
  return !!exact && size === Number(exact[1]);
}
export function matchesGrade(variant: Variant, grade?: string): boolean {
  return !grade || String(variant.attributes.grade ?? '').trim().toUpperCase() === grade.trim().toUpperCase();
}
