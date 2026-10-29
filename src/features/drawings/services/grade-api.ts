import { supabase } from '@core/api/supabase-client';
export type GradeRate = {
  grade: string;
  bolt_rate: number;
  nut_rate: number;
  revision: number;
};
export const gradeKey = ['fastener-grade-rates'];
export async function loadGradeRates(): Promise<GradeRate[]> {
  if (!supabase) throw new Error('Grade rates are unavailable.');
  const { data, error } = await supabase
    .from('fastener_grade_rates')
    .select('grade,bolt_rate,nut_rate,revision')
    .order('grade');
  if (error) throw new Error('Grade rates are unavailable.');
  return (data ?? []) as GradeRate[];
}
export async function saveGradeRate(row: GradeRate, bolt: number, nut: number) {
  if (!supabase) throw new Error('Grade rates are unavailable.');
  const { error } = await supabase.rpc('fti_fastener_grade_save', {
    p_grade: row.grade,
    p_bolt: bolt,
    p_nut: nut,
    p_revision: row.revision,
  });
  if (error) throw new Error(error.message);
}


export async function loadPublicGrades(): Promise<{ grade: string }[]> {
  if (!supabase) throw new Error('Grades are unavailable.');
  const { data, error } = await supabase.rpc('fti_fastener_grades');
  if (error) throw new Error('Grades are unavailable. Please try again later.');
  return ((data ?? []) as string[]).map(grade => ({ grade }));
}
