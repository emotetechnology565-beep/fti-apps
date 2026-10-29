export type FastenerRequirement = {
  subcategory: string;
  definition_id: string | null;
  revision: number | null;
  standard: string;
  shape: string;
  dimensions: Record<string, number>;
  material: string;
  grade: string;
  thread: string;
  pitch: string;
  finish: string;
  with_nut: boolean;
  notes: string;
  custom: boolean;
};

export type FastenerDetail = {
  subcategory: string;
  title: string;
  description: string;
  specifications: { label: string; value: string }[];
  materials: string[];
  grades: string[];
  threads: string[];
  finishes: string[];
  revision: number;
};

export type FastenerDraft = {
  standard: string; definitionId: string; shape: string;
  dimensions: Record<string, string>;
  material: string; grade: string; thread: string; pitch: string; finish: string;
  withNut: boolean; quantity: string; notes: string;
};
export const customStandard = 'Not sure / Custom requirement';
export const requirementSteps = ['Standard', 'Dimensions', 'Material & grade', 'Thread & finish', 'Quantity & notes', 'Review'] as const;

export function initialFastenerDraft(requirement?: FastenerRequirement, quantity = 1): FastenerDraft {
  return {
    standard: requirement?.custom ? customStandard : requirement?.standard ?? '',
    definitionId: requirement?.definition_id ?? '', shape: requirement?.shape ?? '',
    dimensions: Object.fromEntries(Object.entries(requirement?.dimensions ?? {}).map(([key, value]) => [key, String(value)])),
    material: requirement?.material ?? '', grade: requirement?.grade ?? '', thread: requirement?.thread ?? '',
    pitch: requirement?.pitch ?? '', finish: requirement?.finish ?? '', withNut: requirement?.with_nut ?? false,
    quantity: String(quantity), notes: requirement?.notes ?? '',
  };
}

export function fastenerStepError(step: number, draft: FastenerDraft): string | null {
  const custom = draft.standard === customStandard;
  if (step === 0 && !draft.standard) return 'Choose a standard or select a custom requirement.';
  if (step === 1) {
    if (!custom && !draft.definitionId) return 'Choose a published drawing size.';
    const values = Object.values(draft.dimensions).filter(value => value.trim());
    if (values.some(value => !/^\d+(\.\d{1,3})?$/.test(value) || Number(value) <= 0 || Number(value) > 10000)) return 'Enter positive dimensions up to 10,000 with at most 3 decimal places.';
    if (draft.dimensions.angle_deg && Number(draft.dimensions.angle_deg) > 360) return 'Enter an angle of 360 degrees or less.';
    if (!custom && !['hex-nut', 'lock-nut'].includes(draft.shape) && !draft.dimensions.length_mm?.trim()) return 'Enter the required length.';
    if (!custom && ['u-square', 'l', 'j-i'].includes(draft.shape) && !draft.dimensions.width_mm?.trim()) return 'Enter the required width.';
    if (!custom && ['u-round', 'j-ii'].includes(draft.shape) && !draft.dimensions.radius_mm?.trim()) return 'Enter the required bend radius.';
    if (!custom && draft.shape === 'j-ii' && !draft.dimensions.return_height_mm?.trim()) return 'Enter the required return height.';
    if (!custom && draft.shape === 'j-i' && !draft.dimensions.angle_deg?.trim()) return 'Enter the required return angle.';
  }
  if (step === 2 && (!draft.material.trim() || !draft.grade.trim())) return 'Choose a material and grade, or select Not sure.';
  if (step === 3 && (!draft.thread.trim() || !draft.finish.trim())) return 'Choose a thread and finish, or select Not sure.';
  if (step === 4) {
    if (!/^\d+$/.test(draft.quantity) || Number(draft.quantity) < 1 || Number(draft.quantity) > 1000000) return 'Enter a whole quantity from 1 to 1,000,000 pieces.';
    if (custom && !Object.values(draft.dimensions).some(value => value.trim()) && draft.notes.trim().length < 5) return 'Describe your custom dimensions or requirement in the notes.';
    if (draft.notes.length > 2000) return 'Keep notes within 2,000 characters.';
  }
  if ([draft.material, draft.grade, draft.thread, draft.finish, draft.pitch].some(value => value.length > 120)) return 'Keep each specification within 120 characters.';
  return null;
}

export const dimensionNames: Record<string, string> = {
  diameter_mm: 'Diameter (mm)', length_mm: 'Length (mm)', width_mm: 'Width (mm)', radius_mm: 'Bend radius (mm)',
  return_height_mm: 'Return height (mm)', angle_deg: 'Return angle (degrees)', thickness_mm: 'Thickness (mm)',
};
