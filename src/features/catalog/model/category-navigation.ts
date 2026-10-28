export function isFastenerCategory(value: string) {
  return /^(industrial[-\s]*)?fasteners?$/.test(value.trim().toLowerCase());
}
export function catalogueCategoryLabel(name: string) {
  return isFastenerCategory(name) ? 'Fastener' : name;
}
