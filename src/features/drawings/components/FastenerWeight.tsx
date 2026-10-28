import {
  MaterialSectionTitle,
  MaterialQuantity,
  MaterialSpecFilter,
} from '@features/catalog/ui';
import { FastenerOrder } from './FastenerOrder';
import { gradeKey, loadGradeRates } from '../services/grade-api';
import { FastenerPrice } from './FastenerPrice';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, CatalogFilter, Field, Txt, s } from '@shared/ui';
import type { DrawingDefinition, DrawingInput } from '../model/types';
import {
  calculateWeight,
  categoryWeightChart,
  categoryWeightColumn,
  drawingWeightTarget,
  weightQuantity,
  type WeightRow,
} from '../model/weight';
import {
  listCategoryWeights,
  lookupDrawingWeight,
} from '../services/weight-api';

const formatKg = (kg: number) =>
  kg.toLocaleString('en-IN', { maximumFractionDigits: 6 });
const options = (items: string[]) =>
  [...new Set(items)]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((value) => ({ value, label: value }));
function WeightResult({
  matches,
  quantity,
  setQuantity,
  priceKind,
  boltMatches,
  selectedGrade,
}: {
  selectedGrade?: string;
  priceKind?: 'bolt' | 'nut' | 'assembly';
  boltMatches?: WeightRow[];
  matches: WeightRow[];
  quantity: string;
  setQuantity: (value: string) => void;
}) {
  const amount = weightQuantity(quantity);
  const result = calculateWeight(matches, amount);
  const bolt = calculateWeight(boltMatches ?? [], amount);
  if (!matches.length)
    return (
      <Txt style={s.muted}>Weight available on request for this size.</Txt>
    );
  if (matches.length !== 1)
    return (
      <Txt style={s.muted}>
        Multiple weights match this selection. Contact FTI to confirm.
      </Txt>
    );
  return (
    <>
      {selectedGrade === undefined ? (
        <Field
          label="Quantity (pieces)"
          numeric
          value={quantity}
          onChangeText={setQuantity}
        />
      ) : null}
      {amount === null ? (
        <Txt accessibilityRole="alert">
          Enter a whole number from 1 to 1,000,000.
        </Txt>
      ) : null}
      {result ? (
        <>
          <Txt>Weight per piece: {formatKg(result.each)} kg</Txt>
          <Txt style={s.h2}>
            Approximate total weight: {formatKg(result.total)} kg
          </Txt>
          {priceKind && result ? (
            priceKind === 'assembly' ? (
              bolt && result.total > bolt.total ? (
                <FastenerPrice
                  selectedGrade={selectedGrade}
                  boltKg={bolt.total}
                  nutKg={result.total - bolt.total}
                />
              ) : (
                <Txt>
                  Separate bolt and nut weights are required for pricing.
                </Txt>
              )
            ) : (
              <FastenerPrice
                selectedGrade={selectedGrade}
                boltKg={priceKind === 'bolt' ? result.total : 0}
                nutKg={priceKind === 'nut' ? result.total : 0}
              />
            )
          ) : null}
          <Txt style={s.muted}>
            Estimated weight; confirm final weight with FTI.
          </Txt>
        </>
      ) : amount !== null ? (
        <Txt style={s.muted}>Weight available on request.</Txt>
      ) : null}
    </>
  );
}

export function DrawingWeight({
  definition,
  input,
}: {
  definition: DrawingDefinition;
  input: DrawingInput;
}) {
  const length = input.length;
  const [grade, setGrade] = useState('');
  const grades = useQuery({ queryKey: gradeKey, queryFn: loadGradeRates });
  const [assembly, setAssembly] = useState('without');
  const [quantity, setQuantity] = useState('1');
  const target = drawingWeightTarget(definition, length, assembly === 'with');
  const query = useQuery({
    queryKey: ['fastener-weight', target],
    queryFn: () => lookupDrawingWeight(target!),
    enabled: target !== null,
    staleTime: 30000,
    retry: 1,
  });
  const boltTarget =
    assembly === 'with' ? drawingWeightTarget(definition, length, false) : null;
  const boltQuery = useQuery({
    queryKey: ['fastener-weight', boltTarget],
    queryFn: () => lookupDrawingWeight(boltTarget!),
    enabled: !!boltTarget,
    staleTime: 30000,
    retry: 1,
  });
  return (
    <Card style={{ gap: 12, padding: 12, borderWidth: 0, borderRadius: 8 }}>
      <MaterialSectionTitle number={2} title="Consignment Quantity" />
      <MaterialSpecFilter
        label="Grade"
        value={grade}
        onChange={setGrade}
        options={[
          { value: '', label: 'Choose grade' },
          ...(grades.data ?? []).map((r) => ({
            value: r.grade,
            label: r.grade,
          })),
        ]}
      />
      {grades.isError ? (
        <Txt>Grade rates unavailable. Please retry later.</Txt>
      ) : null}
      <MaterialQuantity
        value={quantity}
        onChange={setQuantity}
        unit="piece"
        minimum={1}
        disabled={false}
      />

      {target ? (
        <>
          {['hex-bolt', 'hex-screw'].includes(definition.shape) ? (
            <CatalogFilter
              label="Bolt supply"
              value={assembly}
              onChange={setAssembly}
              options={[
                { value: 'without', label: 'Without nut' },
                { value: 'with', label: 'With nut' },
              ]}
            />
          ) : null}
          <Txt style={s.muted}>{target.description}</Txt>
          {query.isPending ? (
            <Txt>Loading weight...</Txt>
          ) : query.isError ? (
            <>
              <Txt>Weight lookup is temporarily unavailable.</Txt>
              <Button secondary onPress={() => void query.refetch()}>
                Retry weight lookup
              </Button>
            </>
          ) : (
            <WeightResult
              selectedGrade={grade}
              priceKind={
                ['hex-nut', 'lock-nut'].includes(definition.shape)
                  ? 'nut'
                  : assembly === 'with'
                    ? 'assembly'
                    : 'bolt'
              }
              boltMatches={boltQuery.isError ? [] : boltQuery.data}
              matches={query.data ?? []}
              quantity={quantity}
              setQuantity={setQuantity}
            />
          )}
        </>
      ) : (
        <Txt style={s.muted}>
          Weight available on request for this standard and size.
        </Txt>
      )}
      <FastenerOrder
        definition={definition}
        input={input}
        grade={grade}
        quantity={quantity}
        withNut={assembly === 'with'}
      />
    </Card>
  );
}

export function CategoryWeight({ category }: { category: string }) {
  const chart = categoryWeightChart(category);
  const [column, setColumn] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('1');
  const query = useQuery({
    queryKey: ['fastener-category-weights', chart],
    queryFn: ({ signal }) => listCategoryWeights(chart!, signal),
    enabled: !!chart,
    staleTime: 30000,
    retry: 1,
  });
  const rows = (query.data ?? []).filter((row) =>
    categoryWeightColumn(category, row.column_label),
  );
  const specs = options(rows.map((row) => row.column_label));
  const selectedColumn =
    specs.length === 1
      ? specs[0].value
      : specs.some((item) => item.value === column)
        ? column
        : '';
  const sizes = options(
    rows
      .filter((row) => row.column_label === selectedColumn)
      .map((row) => row.row_label),
  );
  const selectedSize = sizes.some((item) => item.value === size) ? size : '';
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Approximate weight</Txt>
      {!chart ? (
        <Txt style={s.muted}>
          Weight available on request for this fastener.
        </Txt>
      ) : query.isPending ? (
        <Txt>Loading available sizes...</Txt>
      ) : query.isError ? (
        <>
          <Txt>Weight lookup is temporarily unavailable.</Txt>
          <Button secondary onPress={() => void query.refetch()}>
            Retry weight lookup
          </Button>
        </>
      ) : !rows.length ? (
        <Txt style={s.muted}>Weight available on request.</Txt>
      ) : (
        <>
          <CatalogFilter
            label="Weight specification"
            value={selectedColumn}
            options={[{ value: '', label: 'Choose specification' }, ...specs]}
            onChange={(value) => {
              setColumn(value);
              setSize('');
            }}
          />
          {selectedColumn ? (
            <CatalogFilter
              label="Weight size"
              value={selectedSize}
              options={[{ value: '', label: 'Choose size' }, ...sizes]}
              onChange={setSize}
            />
          ) : null}
          {selectedSize ? (
            <WeightResult
              priceKind={category.endsWith('nut') ? 'nut' : undefined}
              matches={rows.filter(
                (row) =>
                  row.column_label === selectedColumn &&
                  row.row_label === selectedSize,
              )}
              quantity={quantity}
              setQuantity={setQuantity}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
