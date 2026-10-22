export const sharedMaterialSizes = [
  8, 10, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  30, 32, 34, 36, 38, 40, 42, 45, 48, 50, 51, 53, 56, 60, 63, 65,
  68, 70, 72, 75, 80,
] as const;

export const sharedMaterialGrades = [
  'MS', 'LC', 'FE-500', 'FE-550', 'FE-600', 'FE-600S', 'FE-550D', 'FE-650', 'FE-700',
  '16MNCR5', '20MNCR5', '30MNB5', '30MNCR4', '41CR4', '42CRMO4', 'A-105', 'BORON',
  'C-55', 'CK-45', 'EN-15', 'EN-18', 'EN-18D', 'EN-19', 'EN-24', 'EN-353', 'EN-36A',
  'EN-45', 'EN-45A', 'EN-8D', 'EN-8DCR', 'EN-8DLHT', 'EN-9', 'S-45C', 'S-48C',
  'SAE-1018', 'SAE-1541', 'SAE-4130', 'SAE-4140', 'SAE-8620', 'SCM-420', 'SCM-435', 'ST-52.3',
] as const;

const pmtCategorySlugs = new Set([
  'round-bar-as-rolled', 'as-rolled-round-bar', 'round-bright-bar', 'bright-bar', 'flat', 'sheet', 'square', 'tmt', 'tmt-bar',
]);

export function isSharedPmtCategory(value: string): boolean {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return pmtCategorySlugs.has(slug);
}

export function priceUnitLabel(unit: string): string {
  return unit === 'MT' ? 'PMT' : unit;
}
