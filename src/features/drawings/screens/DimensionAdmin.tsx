import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import { Badge, Button, Card, Empty, Field, Row, Txt, s } from '@shared/ui';
import { drawingApi } from '../services/drawing-api';
import { definitionSchema, normalizeStandard } from '../model/validation';
import {
  drawingFamily,
  shapeLabels,
  type DimensionData,
  type DrawingDefinition,
  type DrawingShape,
} from '../model/types';
import { DimensionSelect } from '../components/DimensionSelect';
import { ConfiguredDrawing } from './FastenerDimensions';
import {
  allSubcategories,
  drawingSubcategory,
  subcategoryLabel,
  subcategoryShapes,
  shapeDimensionKeys,
  dimensionLabels,
} from '../model/subcategories';
import { FastenerPhotoAdmin } from '../components/FastenerPhotoAdmin';

const key = ['fastener-dimensions', 'admin'];
export function DimensionAdmin({ subcategory }: { subcategory?: string } = {}) {
  const auth = useAuth();
  const permitted = hasPermission(auth.identity, 'catalog.manage');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...key, auth.session?.user.id],
    queryFn: drawingApi.admin,
    enabled: permitted,
    retry: false,
  });
  const [selected, setSelected] = useState<
    DrawingDefinition | null | undefined
  >(undefined);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    row: DrawingDefinition;
    visible: boolean;
  } | null>(null);
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['fastener-dimensions'] });
  }
  async function publish() {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      await drawingApi.publish(confirm.row, confirm.visible);
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!permitted)
    return <Txt>Catalogue management permission is required.</Txt>;
  if (query.isPending) return <Txt>Loading dimension definitions…</Txt>;
  if (query.error)
    return (
      <Empty
        title="Dimensions unavailable"
        description={query.error.message}
        action={
          <Button onPress={() => void query.refetch()}>
            Retry dimension library
          </Button>
        }
      />
    );
  return (
    <View style={{ gap: 16 }}>
      <FastenerPhotoAdmin initialSubcategory={subcategory} />
      <Card style={{ gap: 12 }}>
        <Txt style={s.h2}>Fastener dimensions</Txt>
        <Txt style={s.muted}>
          Edit draft dimensions, preview the shape, then publish. Customer
          drawings use the last published version. Catalogue permission and
          staff MFA are enforced by the server.
        </Txt>
        <Button disabled={busy} onPress={() => setSelected(null)}>
          Add dimension definition
        </Button>
        <Field
          label="Find dimension definitions"
          value={search}
          onChangeText={setSearch}
          placeholder="Subcategory, standard, shape or size"
        />
      </Card>
      {selected !== undefined ? (
        <DefinitionEditor
          key={selected ? `${selected.id}:${selected.revision}` : 'new'}
          row={selected}
          initialSubcategory={subcategory}
          onClose={() => setSelected(undefined)}
          onSaved={async (row) => {
            setSelected(row);
            setSavedNotice('Draft saved. Publish it when ready for customers.');
            await refresh();
          }}
        />
      ) : null}
      {savedNotice ? <Txt accessibilityRole="alert">{savedNotice}</Txt> : null}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      {confirm ? (
        <Card style={{ gap: 10 }}>
          <Txt>
            {confirm.visible ? 'Publish' : 'Withdraw'}{' '}
            {subcategoryLabel(drawingSubcategory(confirm.row))} /{' '}
            {confirm.row.standard}:{confirm.row.edition} /{' '}
            {shapeLabels[confirm.row.shape]} / {confirm.row.size}?
          </Txt>
          <Txt style={s.muted}>
            {confirm.visible
              ? 'These dimensions will become visible to customers.'
              : 'This definition will be removed from customer selection.'}
          </Txt>
          <Button disabled={busy} onPress={() => void publish()}>
            Confirm dimension visibility
          </Button>
          <Button secondary disabled={busy} onPress={() => setConfirm(null)}>
            Cancel visibility change
          </Button>
        </Card>
      ) : null}
      {query.data
        .filter(
          (row) => !subcategory || drawingSubcategory(row) === subcategory,
        )
        .filter((row) =>
          `${subcategoryLabel(drawingSubcategory(row))} ${row.standard}:${row.edition} ${shapeLabels[row.shape]} ${row.size}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((row) => (
          <Card key={row.id} style={{ gap: 10 }}>
            <Txt>
              {subcategoryLabel(drawingSubcategory(row))} · {row.standard}:
              {row.edition} · {shapeLabels[row.shape]} · {row.size}
            </Txt>
            <Badge>
              {row.published_revision === null
                ? 'Draft'
                : row.published_revision === row.revision
                  ? 'Published'
                  : 'Published with draft changes'}
            </Badge>
            <Row style={{ flexWrap: 'wrap' }}>
              <Button
                secondary
                disabled={busy}
                onPress={() => setSelected(row)}
              >
                Edit dimensions
              </Button>
              <Button
                secondary
                disabled={busy}
                onPress={() => {
                  setConfirm({ row, visible: true });
                  setError('');
                }}
              >
                Publish dimensions
              </Button>
              {row.published_revision !== null ? (
                <Button
                  secondary
                  disabled={busy}
                  onPress={() => {
                    setConfirm({ row, visible: false });
                    setError('');
                  }}
                >
                  Withdraw dimensions
                </Button>
              ) : null}
            </Row>
          </Card>
        ))}
      {!query.data.some(
        (row) => !subcategory || drawingSubcategory(row) === subcategory,
      ) ? (
        <Txt>
          No definitions yet. Add a dimension definition to get started.
        </Txt>
      ) : null}
    </View>
  );
}

const scalarKeys = [
  'diameter',
  'depth',
  'radius',
  'pitch',
  'thread_base',
  'head_width',
  'head_height',
] as const;
function DefinitionEditor({
  row,
  initialSubcategory,
  onSaved,
  onClose,
}: {
  row: DrawingDefinition | null;
  initialSubcategory?: string;
  onSaved: (row: DrawingDefinition) => Promise<void>;
  onClose: () => void;
}) {
  const [standard, setStandard] = useState(row?.standard ?? '');
  const [subcategory, setSubcategory] = useState(
    row ? drawingSubcategory(row) : (initialSubcategory ?? 'j-type-bolt'),
  );
  const [edition, setEdition] = useState(row?.edition ?? '');
  const [shape, setShape] = useState<DrawingShape>(
    row?.shape ?? subcategoryShapes(subcategory)[0] ?? 'j-i',
  );
  const family =
    shape === 'coach'
      ? 'coach'
      : row && row.shape !== 'coach'
        ? drawingFamily(row)
        : 'roofing';
  const [size, setSize] = useState(row?.size ?? '');
  const source = row?.source ?? 'FTI dimension library';
  const notes = row?.notes ?? '';
  const [scalars, setScalars] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      scalarKeys.map((key) => [
        key,
        row?.dimensions[key] === undefined ? '' : String(row.dimensions[key]),
      ]),
    ),
  );
  const [widths, setWidths] = useState(row?.dimensions.widths.join(', ') ?? '');
  const [lengths, setLengths] = useState(
    row?.dimensions.lengths.join(', ') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<DrawingDefinition | null>(null);
  const supportedShapes = subcategoryShapes(subcategory);
  const activeKeys = shapeDimensionKeys(shape);
  const round = shape === 'j-ii' || shape === 'u-round';
  const dimensions = () => ({
    ...Object.fromEntries(
      scalarKeys
        .filter((key) => activeKeys.includes(key))
        .filter((key) => scalars[key].trim())
        .map((key) => [key, Number(scalars[key])]),
    ),
    widths:
      !round && shape !== 'coach' && widths.trim()
        ? widths.split(',').map((value) => Number(value.trim()))
        : [],
    lengths:
      !round && lengths.trim()
        ? lengths.split(',').map((value) => Number(value.trim()))
        : [],
  });
  function parsed() {
    return definitionSchema.parse({
      subcategory,
      family,
      standard: normalizeStandard(standard)?.standard ?? standard,
      edition,
      shape,
      size,
      source,
      notes,
      dimensions: dimensions(),
    });
  }
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const result = await drawingApi.save(
        row?.id ?? null,
        row?.revision ?? null,
        parsed(),
      );
      await onSaved(result);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function showPreview() {
    try {
      const value = parsed();
      setPreview({
        ...value,
        dimensions: value.dimensions as DimensionData,
        id: row?.id ?? 'preview',
        revision: row?.revision ?? 1,
        published_revision: null,
      });
      setMessage('');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>
        {row ? 'Edit draft dimensions' : 'New dimension definition'}
      </Txt>
      <DimensionSelect
        label="Fastener subcategory"
        value={subcategory}
        options={allSubcategories}
        onChange={(value) => {
          setSubcategory(value);
          const allowed = subcategoryShapes(value);
          if (!allowed.includes(shape)) setShape(allowed[0] ?? 'j-i');
          setPreview(null);
        }}
      />
      <Field
        label="IS standard"
        value={standard}
        onChangeText={(value) => {
          setStandard(value);
          setPreview(null);
        }}
      />
      <Field
        label="Standard edition year"
        value={edition}
        onChangeText={setEdition}
      />
      {supportedShapes.length ? (
        <>
          <DimensionSelect
            label="Shape"
            value={shape}
            options={supportedShapes.map((value) => ({
              value,
              label: shapeLabels[value],
            }))}
            onChange={(value) => {
              setShape(value as DrawingShape);
              setPreview(null);
            }}
          />
          <Field
            label="Size"
            value={size}
            onChangeText={setSize}
            placeholder="M8 or No. 10"
          />
        </>
      ) : null}
      {!supportedShapes.length ? (
        <Txt>
          No matching drawing template is configured for this subcategory yet.
          You can publish its photo, but an unrelated bolt drawing cannot be
          published here.
        </Txt>
      ) : null}
      {scalarKeys
        .filter((key) => supportedShapes.length && activeKeys.includes(key))
        .map((key) => (
          <Field
            key={key}
            label={dimensionLabels[key]}
            value={scalars[key]}
            onChangeText={(value) => {
              setScalars((previous) => ({ ...previous, [key]: value }));
              setPreview(null);
            }}
            numeric
          />
        ))}
      {supportedShapes.length && !round && shape !== 'coach' ? (
        <Field
          label="Allowed widths (mm, comma separated; blank for purchaser input)"
          value={widths}
          onChangeText={setWidths}
        />
      ) : null}
      {supportedShapes.length && !round ? (
        <Field
          label="Allowed lengths (mm, comma separated; blank for purchaser input)"
          value={lengths}
          onChangeText={setLengths}
        />
      ) : null}
      <Txt style={s.muted}>
        For hook bolts, thread_base gives b = thread_base + 2P. Round forms take
        purchaser radius. Coach screws need pitch, head width and head height.
        No prices or weights are calculated from geometry.
      </Txt>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      <Row style={{ flexWrap: 'wrap' }}>
        <Button
          disabled={busy || !supportedShapes.length}
          onPress={() => void save()}
        >
          {busy ? 'Saving dimensions…' : 'Save dimension draft'}
        </Button>
        <Button
          secondary
          disabled={busy || !supportedShapes.length}
          onPress={showPreview}
        >
          Preview draft
        </Button>
        <Button secondary disabled={busy} onPress={onClose}>
          Close dimension editor
        </Button>
      </Row>
      {preview ? (
        <ConfiguredDrawing key={JSON.stringify(preview)} definition={preview} />
      ) : null}
    </Card>
  );
}
