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
  diameterRange?: readonly [number, number];
  sideRange?: readonly [number, number];
  materials: string;
  description?: string;
  applications?: string;
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
    description: 'Roof sheets in trapezoidal, rib, corrugated, tile, deck and colour coated profiles. Advertised thicknesses range from 0.35 to 0.80 mm, with standard or modular lengths of 8–20 ft and custom cuts available. Confirm the profile, substrate, coating and coverage dimensions for your project.',
    applications: 'Trapezoidal profiles are advertised for industrial and commercial roofing; rib profiles for standard applications. Confirm the profile and performance requirements for your project.',
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
    sideRange: [25, 150],
    description: 'Square bars in LC, MS and alloy steel, with advertised square sections from 25 × 25 to 150 × 150 mm. The range is advertised for industrial applications. The stated 10 MT minimum applies to special grades only; confirm grade, length and dimensional tolerances with your enquiry.',
    applications: 'Industrial applications, subject to confirmation of the required grade, dimensions and tolerances.',
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
    description: 'Round bright bars in LC, MS and alloy steel, with an advertised size range of 12–80 mm. The poster identifies a bright bar drawing process and advertises surface finish and dimensional accuracy. Confirm the required grade, size, length, surface finish and tolerances when requesting a quote.',
    diameterRange: [12, 80],
    materials: steel,
    grades,
    details: [
      ['Process', 'Bright bar drawing'],
      ['Advertised finish', 'Superior surface finish and high dimensional accuracy; numerical limits to be confirmed'],
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
    description: 'As rolled round bars in LC, MS and alloy steel, with an advertised size range of 12–250 mm and a range of steel grades. Confirm the size and grade combination, bar length, rolling tolerances and current availability when requesting a quote.',
    diameterRange: [12, 250],
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
    description: 'Steel sheets in LC, MS and alloy steel, with an advertised 2–25 mm range, interpreted as thickness from the poster. The stated 10 MT minimum applies to special grades only. Confirm thickness, width, length, rolling condition and grade with your enquiry.',
    materials: steel,
    specialGradeMoq: '10 MT (special grade only)',
    details: [
      ['Advertised thickness range', '2–25 mm; confirm required thickness'],
      ['Sheet width & length', 'Confirm with your enquiry'],
    ],
  },
  {
    aliases: ['flat', 'flats', 'flat-bar', 'flat-bars'],
    size: '2–80 mm',
    description: 'Flat steel in LC, MS and alloy steel, with an advertised 2–80 mm range and square edges. The poster does not identify whether that range refers to width or thickness. Specify width × thickness × length and the required grade when requesting a quote. The stated 10 MT minimum applies to special grades only.',
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
  {
    aliases: ['hex-bolt', 'hex-bolts', 'hex-head-bolt', 'hex-head-bolts'],
    size: 'Cold forged: diameter 5–24 mm; hot forged: diameter 24–56 mm',
    materials: 'LC / MS / CHQ · EN-8D · Boron · SAE-4140 · EN-19',
    description: 'Hex bolts with advertised cold forging and hot forging capabilities, multiple thread systems and finishing options. Cold forged sizes cover diameters of 5–24 mm and lengths of 10–200 mm; hot forged sizes cover diameters of 24–56 mm and lengths of 50–450 mm. Confirm the property class, product standard, thread pitch and coating specification for your requirement.',
    applications: 'Industrial and OEM supply, with suitability subject to the specified property class, standard, dimensions and finish.',
    details: [
      ['Cold forging', 'Diameter 5–24 mm · Length 10–200 mm'],
      ['Hot forging', 'Diameter 24–56 mm · Length 50–450 mm'],
      ['Threading capacity', '5–56 mm'],
      ['Thread systems', 'BSW · UNC · UNF · Coarse metric and inch threads; designation and pitch to be confirmed'],
      ['Finishes', 'Auto black · Zinc plating · Hot dip galvanizing · Zinc flake'],
      ['Inspection', 'Dimensional check and quality inspection'],
      ['Required specification', 'Confirm property class, product standard, head dimensions, thread pitch and coating thickness'],
    ],
  },
  {
    aliases: ['building-material', 'building-materials'],
    size: 'Confirm product-specific dimensions',
    materials: 'LC / MS stated for the overall range; confirm the grade for each product',
    description: 'Building materials including angles, channels, square pipes, rectangular pipes and TMT bars, advertised for residential, commercial and industrial projects. Confirm product-specific dimensions, wall thickness, material grade, applicable standards and supply requirements with FTI.',
    applications: 'Residential, commercial and industrial construction, subject to project-specific material and structural requirements.',
    details: [
      ['Product range', 'Angles · Channels · Square pipes · Rectangular pipes · TMT bars'],
      ['Delivery', 'Pan-India supply advertised; confirm destination, availability and lead time'],
      ['TMT specification', 'Strength class, standard and bar diameter must be confirmed separately'],
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
