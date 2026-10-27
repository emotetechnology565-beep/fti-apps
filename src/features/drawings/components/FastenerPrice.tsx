import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CatalogFilter, Txt, s } from '@shared/ui';
import { gradeKey, loadGradeRates } from '../services/grade-api';
import { fastenerPrice } from '../model/price';
export function FastenerPrice({
  boltKg,
  nutKg,
  selectedGrade,
}: {
  selectedGrade?: string;
  boltKg: number;
  nutKg: number;
}) {
  const [localGrade, setGrade] = useState('');
  const grade = selectedGrade ?? localGrade;
  const query = useQuery({
    queryKey: gradeKey,
    queryFn: loadGradeRates,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const rate = query.data?.find((r) => r.grade === grade);
  const price = rate
    ? fastenerPrice(
        boltKg,
        nutKg,
        Number(rate.bolt_rate),
        Number(rate.nut_rate),
      )
    : null;
  return (
    <>
      {query.isPending ? (
        <Txt>Loading grade prices...</Txt>
      ) : query.isError ? (
        <Txt>Grade pricing is temporarily unavailable.</Txt>
      ) : selectedGrade !== undefined ? null : (
        <CatalogFilter
          label="Pricing grade"
          value={grade}
          onChange={setGrade}
          options={[
            { value: '', label: 'Choose grade' },
            ...(query.data ?? []).map((r) => ({
              value: r.grade,
              label: r.grade,
            })),
          ]}
        />
      )}
      {rate && price !== null && !query.isError ? (
        <>
          <Txt>
            {boltKg > 0 ? `Bolt rate: ₹${rate.bolt_rate}/kg` : ''}
            {boltKg > 0 && nutKg > 0 ? ' · ' : ''}
            {nutKg > 0 ? `Nut rate: ₹${rate.nut_rate}/kg` : ''}
          </Txt>
          <Txt style={s.h2}>
            Estimated price: ₹
            {price.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Txt>
          <Txt style={s.muted}>
            Based on approximate weight. Final quotation confirms applicable
            charges.
          </Txt>
        </>
      ) : null}
    </>
  );
}
