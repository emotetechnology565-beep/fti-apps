import type { Product } from './types';

// Transcribed from the supplied FTI product posters in
// assets/fastener-uploads/WhatsApp Unknown 2026-10-28 at 8.28.19 AM/extracted-details.md.
// Advertised ranges are capabilities, not stock schedules or order validation rules.
const steel = 'LC / MS / Alloy Steel';
const grades = [
  'C-45C',
  'C-48C',
  'CK-45',
  'C-55',
  'EN-8',
  'EN-9',
  'EN-15',
  'EN-18',
  'EN-19',
  'EN-24',
  'EN-31',
  'EN-45',
  'EN-45A',
  'EN-353',
  '41CR4',
  'SAE-1541',
  'A-105',
  'ST-52.3',
  'Boron',
  '16MNCR5',
  '20MNCR5',
  '42CRMO4',
  'SAE4140',
  'SCM-435',
  'SCM420',
  'SAE/AISI 8620',
];
export type RawMaterialDetails = {
  aliases: string[];
  size: string;
  materials: string;
  specialGradeMoq?: string;
  grades?: string[];
  details: [string, string][];
};
const profiles: RawMaterialDetails[] = [
  {
    aliases: [
      'roof-sheet',
      'roof-sheets',
      'roofing-sheet',
      'roofing-sheets',
      'colour-coated-roof-sheet',
    ],
    size: 'Thickness 0.35–0.80 mm',
    materials: 'Grade confirmed on enquiry',
    details: [
      [
        'Profiles',
        'Trapezoidal · Rib type · Corrugated · Tile · Deck · Colour coated',
      ],
      ['Standard thickness', '0.45–0.50 mm'],
      ['Overall width', '1060–1142 mm'],
      ['Effective cover width', '1000–1060 mm'],
      ['Lengths', 'Standard / modular 8–20 ft; custom cuts available'],
      [
        'Specification',
        'Confirm substrate, coating grade and profile when enquiring.',
      ],
    ],
  },
  {
    aliases: ['square', 'square-bar', 'square-bars'],
    size: '25 × 25 to 150 × 150 mm',
    materials: steel,
    specialGradeMoq: '10 MT (special grade only)',
    details: [
      ['Dimensions', 'Square section: 25 × 25 mm to 150 × 150 mm'],
      ['Lengths & tolerances', 'Confirm with your enquiry'],
    ],
  },
  {
    aliases: [
      'round-bright-bar',
      'round-bright-bars',
      'bright-bar',
      'bright-bars',
    ],
    size: '12–80 mm',
    materials: steel,
    grades,
    details: [
      ['Process', 'Bright bar drawing'],
      ['Lengths & tolerances', 'Confirm with your enquiry'],
    ],
  },
  {
    aliases: [
      'round-bar-as-rolled',
      'as-rolled-round-bar',
      'as-rolled-round-bars',
      'round-bars-as-rolled',
    ],
    size: '12–250 mm',
    materials: steel,
    grades,
    details: [
      ['Condition', 'As rolled'],
      ['Lengths & tolerances', 'Confirm with your enquiry'],
    ],
  },
  {
    aliases: ['sheet', 'sheets', 'steel-sheet', 'steel-sheets'],
    size: '2–25 mm',
    materials: steel,
    specialGradeMoq: '10 MT (special grade only)',
    details: [
      ['Advertised range', '2–25 mm'],
      ['Sheet width & length', 'Confirm with your enquiry'],
    ],
  },
  {
    aliases: ['flat', 'flats', 'flat-bar', 'flat-bars'],
    size: '2–80 mm',
    materials: steel,
    grades,
    specialGradeMoq: '10 MT (special grade only)',
    details: [
      [
        'Advertised range',
        '2–80 mm; confirm width × thickness for your requirement',
      ],
      ['Lengths & tolerances', 'Confirm with your enquiry'],
    ],
  },
];
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export function rawMaterialDetails(
  product: Pick<Product, 'category' | 'slug' | 'name'>,
): RawMaterialDetails | undefined {
  for (const value of [product.slug, product.category, product.name].map(
    normalize,
  )) {
    const profile = profiles.find((item) =>
      item.aliases.some(
        (alias) =>
          value === alias ||
          (alias.length > 6 && value.startsWith(alias + '-')),
      ),
    );
    if (profile) return profile;
  }
  return undefined;
}
