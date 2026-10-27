import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, CatalogFilter, Empty, Field, Txt, s } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import { DrawingPreview } from '../components/DrawingPreview';
import { CategoryWeight, DrawingWeight } from '../components/FastenerWeight';
import { DimensionSelect } from '../components/DimensionSelect';
import { FastenerPhotoCards } from '../components/FastenerPhotoCards';
import {
  shapeLabels,
  isNutShape,
  isHexShape,
  type DrawingDefinition,
  type DrawingShape,
} from '../model/types';

import {
  allSubcategories,
  drawingSubcategory,
  drawingDimensionLabel,
  matchesFastenerSearch,
  subcategoryShapes,
} from '../model/subcategories';

const unique = (values: string[]) => [...new Set(values)];
const choices = (values: string[]) =>
  values.map((value) => ({ value, label: value }));
export function FastenerDimensions({
  subcategory = '',
}: { subcategory?: string } = {}) {
  const query = useQuery({
    queryKey: ['fastener-dimensions', 'public'],
    queryFn: drawingApi.list,
    staleTime: 30000,
  });
  const [search, setSearch] = useState('');
  const type = subcategory;
  const [shape, setShape] = useState('');
  const [id, setId] = useState('');
  const [version, setVersion] = useState('');
  if (query.isPending)
    return (
      <Card>
        <Txt>Loading fastener dimensions…</Txt>
      </Card>
    );
  if (query.error)
    return (
      <Empty
        title="Dimension library unavailable"
        description={query.error.message}
        action={
          <Button onPress={() => void query.refetch()}>Retry dimensions</Button>
        }
      />
    );
  if (
    subcategory &&
    !allSubcategories.some((item) => item.value === subcategory)
  )
    return (
      <Empty
        title="Fastener unavailable"
        description="Choose a fastener from the catalogue."
        action={
          <Button onPress={() => router.navigate('/products')}>
            Browse fasteners
          </Button>
        }
      />
    );
  const all = query.data;
  const types = subcategory
    ? allSubcategories
    : allSubcategories.filter((item) =>
        matchesFastenerSearch(item.value, search),
      );
  const selectedType = types.some((item) => item.value === type) ? type : '';
  const hasPublishedType = query.data.some(
    (row) =>
      drawingSubcategory(row) === selectedType &&
      subcategoryShapes(selectedType).includes(row.shape),
  );
  const typed = all.filter(
    (row) =>
      drawingSubcategory(row) === selectedType &&
      subcategoryShapes(selectedType).includes(row.shape),
  );
  const versions = unique(typed.map((row) => `${row.standard}:${row.edition}`));
  const selectedVersion =
    versions.length === 1
      ? versions[0]
      : versions.includes(version)
        ? version
        : '';
  const standardRows = typed.filter(
    (row) => `${row.standard}:${row.edition}` === selectedVersion,
  );
  const shapes = unique(standardRows.map((row) => row.shape));
  const selectedShape =
    shapes.length === 1 ? shapes[0] : shapes.includes(shape) ? shape : '';
  const rows = standardRows.filter((row) => row.shape === selectedShape);
  const selected =
    rows.length === 1 ? rows[0] : rows.find((row) => row.id === id);
  if (!subcategory) {
    const openFastener = (slug: string) => {
      if (slug) router.push({ pathname: '/fastener/[slug]', params: { slug } });
    };
    return (
      <View style={{ gap: 20 }}>
        <CatalogFilter
          label="Fastener subcategory"
          value=""
          options={[{ value: '', label: 'Choose fastener' }, ...types]}
          onChange={openFastener}
        />
        <Txt style={s.muted}>
          Choose a fastener to view available standards, sizes and drawings.
        </Txt>
        <Field
          label="Search fasteners"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, e.g. L type bolt or U type"
        />
        <FastenerPhotoCards
          selected=""
          search={search}
          onSelect={openFastener}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Card>
        {subcategory ? (
          <Button secondary onPress={() => router.navigate('/products')}>
            Back to fasteners
          </Button>
        ) : null}
        <Txt style={s.h2}>
          {subcategory
            ? types.find((item) => item.value === selectedType)?.label
            : 'Fastener selection'}
        </Txt>
        {!subcategory ? (
          <Field
            label="Search fasteners"
            value={search}
            onChangeText={setSearch}
            placeholder="e.g. L type bolt or U type"
          />
        ) : null}
        {!subcategory ? (
          <CatalogFilter
            label="Fastener subcategory"
            value={selectedType}
            options={[
              { value: '', label: 'Choose fastener subcategory' },
              ...types,
            ]}
            onChange={(value) => {
              if (value)
                router.push({
                  pathname: '/fastener/[slug]',
                  params: { slug: value },
                });
            }}
          />
        ) : null}
        <FastenerPhotoCards
          selected={selectedType}
          onlySelected={!!subcategory}
          search={search}
          onSelect={(value) => {
            if (!subcategory)
              router.push({
                pathname: '/fastener/[slug]',
                params: { slug: value },
              });
          }}
        />
        {subcategory && selectedType ? (
          <Txt style={s.muted}>
            Choose an IS standard to load the available details for{' '}
            {types.find((item) => item.value === selectedType)?.label}.
          </Txt>
        ) : null}
        <>
          {subcategory && selectedType && !hasPublishedType ? (
            <Txt>
              No published sizes or drawings are available for this subcategory
              yet. Contact FTI for a quotation.
            </Txt>
          ) : null}
          {subcategory && selectedType && typed.length > 0 ? (
            <>
              <CatalogFilter
                label="IS standard"
                value={selectedVersion}
                options={[
                  { value: '', label: 'Choose IS standard' },
                  ...choices(versions),
                ]}
                onChange={(value) => {
                  setVersion(value);
                  setShape('');
                  setId('');
                }}
              />
              {selectedVersion && shapes.length > 1 ? (
                <CatalogFilter
                  label="Shape"
                  value={selectedShape}
                  options={[
                    { value: '', label: 'Choose shape' },
                    ...shapes.map((value) => ({
                      value,
                      label: shapeLabels[value as DrawingShape],
                    })),
                  ]}
                  onChange={(value) => {
                    setShape(value);
                    setId('');
                  }}
                />
              ) : null}
            </>
          ) : null}
          {selectedShape && selectedVersion && rows.length > 1 ? (
            <CatalogFilter
              label="Size"
              value={selected?.id ?? ''}
              options={[
                { value: '', label: 'Choose size' },
                ...rows.map((row) => ({
                  value: row.id,
                  label: row.size,
                })),
              ]}
              onChange={setId}
            />
          ) : null}
        </>
      </Card>
      {subcategory && !hasPublishedType ? (
        <CategoryWeight key={subcategory} category={subcategory} />
      ) : null}
      {selected ? (
        <ConfiguredDrawing
          key={`${selected.id}:${selected.revision}`}
          definition={selected}
          progressive
        />
      ) : null}
    </View>
  );
}

export function ConfiguredDrawing({
  definition,
  progressive = false,
}: {
  definition: DrawingDefinition;
  progressive?: boolean;
}) {
  const d = definition.dimensions,
    round = ['j-ii', 'u-round'].includes(definition.shape);
  const [width, setWidth] = useState(
    progressive && d.widths.length > 1 ? '' : String(d.widths[0] ?? ''),
  );
  const [length, setLength] = useState(
    isNutShape(definition.shape)
      ? String(d.head_height ?? '')
      : progressive && d.lengths.length !== 1
        ? ''
        : String(d.lengths[0] ?? (progressive ? '' : 120)),
  );
  const [radius, setRadius] = useState('25');
  const [returnHeight, setReturnHeight] = useState('60');
  const [pitch, setPitch] = useState('');
  const [angle, setAngle] = useState('25');
  const input = {
    length: Number(length),
    ...(d.widths.length && !round ? { width: Number(width) } : {}),
    ...(round ? { radius: Number(radius) } : {}),
    ...(definition.shape === 'j-ii'
      ? { returnHeight: Number(returnHeight) }
      : {}),
    pitch: pitch.trim() ? Number(pitch) : undefined,
    ...(definition.shape === 'j-i' ? { angle: Number(angle) } : {}),
  };
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Txt style={s.h2}>
          {shapeLabels[definition.shape]} · {definition.size}
        </Txt>
        {definition.shape === 'coach' &&
        d.head_height !== undefined &&
        ((d.head_height_min !== undefined &&
          d.head_height < d.head_height_min) ||
          (d.head_height_max !== undefined &&
            d.head_height > d.head_height_max)) ? (
          <Txt accessibilityRole="alert">
            Nominal head thickness is outside its stated limits. Confirm this
            dimension with FTI before manufacture.
          </Txt>
        ) : null}
        {d.widths.length ? (
          <DimensionSelect
            label="Width (mm)"
            value={width}
            options={choices(d.widths.map(String))}
            onChange={(value) => {
              setWidth(value);
              if (progressive) setLength('');
            }}
          />
        ) : null}
        {!isNutShape(definition.shape) &&
        (!progressive || !d.widths.length || !!width) ? (
          d.lengths.length ? (
            <DimensionSelect
              label="Length (mm)"
              value={length}
              options={choices(d.lengths.map(String))}
              onChange={setLength}
            />
          ) : (
            <Field
              label="Length L (mm)"
              value={length}
              onChangeText={setLength}
              numeric
            />
          )
        ) : null}
        {length ? (
          <>
            {round ? (
              <>
                <Txt style={s.muted}>
                  Radius 25 mm and return 60 mm start as examples. Enter the
                  purchaser’s required geometry.
                </Txt>
                <Field
                  label="Inside radius R1 (mm)"
                  value={radius}
                  onChangeText={setRadius}
                  numeric
                />
              </>
            ) : null}
            {definition.shape === 'j-ii' ? (
              <Field
                label="Return height C (mm)"
                value={returnHeight}
                onChangeText={setReturnHeight}
                numeric
              />
            ) : null}
            {definition.shape === 'j-i' ? (
              <Field
                label="Return angle (degrees, 25 is illustrative)"
                value={angle}
                onChangeText={setAngle}
                numeric
              />
            ) : null}
            {!d.pitch ? (
              <Field
                label="Thread pitch P (mm, optional)"
                value={pitch}
                onChangeText={setPitch}
                placeholder="Leave blank to show formula"
                numeric
              />
            ) : null}
          </>
        ) : null}
      </Card>
      {length ? (
        <>
          <DrawingPreview definition={definition} input={input} />
          <DrawingWeight
            key={`${definition.id}:${definition.revision}`}
            definition={definition}
            input={input}
          />
          <Card style={{ gap: 10 }}>
            <Txt style={s.h2}>Dimensions</Txt>
            <View
              accessibilityRole="summary"
              style={{
                borderWidth: 1,
                borderColor: '#E5EAF0',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: '#EAF0FC',
                  borderBottomWidth: 1,
                  borderColor: '#E5EAF0',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Txt style={{ flex: 1, fontWeight: '700' }}>Dimension</Txt>
                <Txt
                  style={{
                    width: '34%',
                    textAlign: 'right',
                    fontWeight: '700',
                  }}
                >
                  Value
                </Txt>
              </View>
              {Object.entries(d)
                .filter(
                  ([name]) =>
                    !(isHexShape(definition.shape) && name === 'widths') &&
                    !(isNutShape(definition.shape) && name === 'lengths'),
                )
                .map(([name, value], index, entries) => (
                  <View
                    key={name}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      borderBottomWidth: index === entries.length - 1 ? 0 : 1,
                      borderColor: '#E5EAF0',
                      gap: 12,
                    }}
                  >
                    <Txt style={{ flex: 1 }}>
                      {drawingDimensionLabel(
                        definition.shape,
                        name as keyof typeof d,
                      )}
                    </Txt>
                    <Txt style={{ width: '34%', textAlign: 'right' }}>
                      {Array.isArray(value)
                        ? value.join(', ') || 'Purchaser input'
                        : String(value)}
                    </Txt>
                  </View>
                ))}
            </View>
            <Txt style={s.muted}>
              {definition.standard}:{definition.edition} · Revision{' '}
              {definition.revision}
            </Txt>
            <Txt style={s.muted}>
              A drawing selection does not establish price, weight or stock
              availability. Ask FTI for a quotation.
            </Txt>
          </Card>
        </>
      ) : null}
    </View>
  );
}
