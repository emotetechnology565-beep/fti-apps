import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { hasPermission } from '@features/auth';
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Row,
  Txt,
  s,
} from '@shared/ui';
import { catalogApi, type AdminCategory } from '../data/catalog-repository';
import {
  gradeGstError,
  gradeNet,
  gradePriceFields,
  gradeRowsError,
  newGradeRow,
  type GradeRow,
  type GradeSheet,
} from '../model/grade-sheet';
import {
  isSharedPmtCategory,
  priceUnitLabel,
} from '../model/shared-material-options';

function SheetForm({
  category,
  initial,
  onSaved,
  onDirty,
  onBusy,
}: {
  category: AdminCategory;
  initial: GradeSheet | null;
  onSaved: (sheet: GradeSheet) => Promise<void>;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}) {
  const pmtOnly = isSharedPmtCategory(category.slug || category.name);
  const auth = useAuth();
  const [sheet, setSheet] = useState(initial);
  const [rows, setRows] = useState<GradeRow[]>(
    initial?.rows ?? [newGradeRow()],
  );
  const [kind, setKind] = useState<GradeSheet['product_kind']>(
    initial?.product_kind ?? 'steel',
  );
  const [unit, setUnit] = useState<GradeSheet['uom'] | ''>(
    pmtOnly ? 'MT' : (initial?.uom ?? ''),
  );
  const [moq, setMoq] = useState(initial?.min_order_qty ?? '1');
  const [gstIncluded, setGstIncluded] = useState(
    initial?.gst_included ?? false,
  );
  const [gstRate, setGstRate] = useState(initial?.gst_rate ?? '');
  const [open, setOpen] = useState(0);
  const [dirty, setDirty] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [remove, setRemove] = useState<number | null>(null);
  const canPublish = hasPermission(auth.identity, 'price.publish');
  function changed() {
    setDirty(true);
    onDirty(true);
    setReview(false);
    setMessage('');
    setRemove(null);
  }
  function update(index: number, patch: Partial<GradeRow>) {
    changed();
    setRows((previous) =>
      previous.map((row, n) => (n === index ? { ...row, ...patch } : row)),
    );
  }
  async function save() {
    if (busy) return;
    const error = gradeRowsError(rows) ?? gradeGstError(gstIncluded, gstRate);
    if (error) {
      setMessage(error);
      return;
    }
    if (!unit || !/^\d{1,12}(\.\d{1,3})?$/.test(moq) || Number(moq) <= 0) {
      setMessage(
        'Choose a price unit and enter a positive minimum order quantity (up to 3 decimals).',
      );
      return;
    }
    setBusy(true);
    onBusy(true);
    setMessage('');
    try {
      const result = await catalogApi.saveGradeSheet(
        category.id,
        sheet?.revision ?? null,
        {
          product_kind: kind,
          uom: unit,
          min_order_qty: moq,
          rows,
          gst_included: gstIncluded,
          gst_rate: gstIncluded ? gstRate : null,
        },
      );
      setSheet(result);
      setRows(result.rows);
      setDirty(false);
      onDirty(false);
      setReview(false);
      setMessage(
        'Draft saved. Review and publish when all prices are complete.',
      );
      await onSaved(result);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function publish() {
    if (!sheet || busy || dirty) return;
    setBusy(true);
    onBusy(true);
    setMessage('');
    try {
      const result = await catalogApi.publishGradeSheet(
        category.id,
        sheet.revision,
      );
      setSheet(result);
      setReview(false);
      setMessage(
        `${category.name} list published. Customers can see its grades, sizes, base prices and net prices.`,
      );
      await onSaved(result);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const completeError = gradeRowsError(rows, true);
  return (
    <View style={{ gap: 16 }}>
      <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Txt style={s.h2}>{category.name} list</Txt>
        <Badge>
          {dirty
            ? 'UNSAVED'
            : sheet?.product_status === 'published' &&
                sheet.published_revision === sheet.revision
              ? 'PUBLISHED'
              : 'DRAFT'}
        </Badge>
      </Row>
      <Txt style={s.muted}>
        Add brands or grades under this category. Serial numbers are automatic.
        Save incomplete prices as a draft; enter 0 where a charge does not
        apply.
      </Txt>
      <View
        pointerEvents={busy ? 'none' : 'auto'}
        style={{ gap: 12, opacity: busy ? 0.6 : 1 }}
      >
        <Txt style={s.label}>Product type</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['steel', 'fastener', 'other'] as const).map((value) => (
            <Chip
              key={value}
              selected={kind === value}
              onPress={() => {
                changed();
                setKind(value);
              }}
            >
              {value === 'steel'
                ? 'Steel (round / TMT / bright bar)'
                : value === 'fastener'
                  ? 'Fasteners'
                  : 'Other'}
            </Chip>
          ))}
        </Row>
        <Txt style={s.label}>
          Price unit — applies to every price and charge below
        </Txt>
        {pmtOnly ? (
          <Badge>PMT (per metric tonne)</Badge>
        ) : (
          <Row style={{ flexWrap: 'wrap' }}>
            {(['kg', 'MT', 'piece', 'box', 'bundle'] as const).map((value) => (
              <Chip
                key={value}
                selected={unit === value}
                onPress={() => {
                  changed();
                  setUnit(value);
                }}
              >
                {priceUnitLabel(value)}
              </Chip>
            ))}
          </Row>
        )}
        <Field
          label="Minimum order quantity for this list"
          placeholder="e.g. 1"
          numeric
          value={moq}
          onChangeText={(value) => {
            changed();
            setMoq(value);
          }}
        />
        <Txt style={s.label}>Do the entered prices include GST?</Txt>
        <Row>
          <Chip
            selected={!gstIncluded}
            onPress={() => {
              changed();
              setGstIncluded(false);
            }}
          >
            Excluding GST
          </Chip>
          <Chip
            selected={gstIncluded}
            onPress={() => {
              changed();
              setGstIncluded(true);
            }}
          >
            Including GST
          </Chip>
        </Row>
        {gstIncluded ? (
          <>
            <Field
              label="Included GST (%)"
              placeholder="e.g. 18"
              numeric
              value={gstRate}
              onChangeText={(value) => {
                changed();
                setGstRate(value);
              }}
            />
            <Txt style={s.muted}>
              GST is already included in the entered prices and will not be
              added again.
            </Txt>
          </>
        ) : null}
        <Txt style={s.muted}>
          Net price = base price + BASE charge + profile + rolling. The final
          price for each size group includes its additional charge.
        </Txt>
        {rows.map((row, index) => (
          <Card key={index} style={{ gap: 12 }}>
            <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 120 }}>
                <Txt style={s.h2}>
                  {index + 1}. {row.grade || 'New brand / grade'}
                </Txt>
                <Txt style={s.muted}>
                  {gradeNet(row) === null
                    ? 'Price incomplete'
                    : `Net: INR ${gradeNet(row)} / ${unit ? priceUnitLabel(unit) : 'select unit'}`}{' '}
                  · {row.size_groups.length} size group(s)
                </Txt>
              </View>
              <Button
                secondary
                disabled={busy}
                onPress={() => setOpen(open === index ? -1 : index)}
              >
                {open === index ? 'Collapse' : `Edit entry ${index + 1}`}
              </Button>
            </Row>
            {open === index ? (
              <>
                <Field
                  label={`Brand / grade ${index + 1}`}
                  placeholder="e.g. EN-8D, 16MNCR5 or ZARA TMT"
                  value={row.grade}
                  onChangeText={(value) => update(index, { grade: value })}
                />
                <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {gradePriceFields.map(([key, label]) => (
                    <View key={key} style={{ flex: 1, minWidth: 130 }}>
                      <Field
                        label={`${label} — entry ${index + 1} (INR / ${unit ? priceUnitLabel(unit) : 'unit'})`}
                        placeholder={
                          key === 'base_price'
                            ? 'Enter base price'
                            : '0 if not applicable'
                        }
                        numeric
                        value={row[key]}
                        onChangeText={(value) =>
                          update(index, { [key]: value })
                        }
                      />
                    </View>
                  ))}
                </Row>
                <Txt style={s.label}>Size groups and additional prices</Txt>
                {row.size_groups.map((group, groupIndex) => (
                  <View key={group.id ?? groupIndex} style={{ gap: 8 }}>
                    <Field
                      label={`Size group ${groupIndex + 1} — entry ${index + 1}`}
                      placeholder="e.g. 16MM TO 50MM or All sizes"
                      value={group.label}
                      onChangeText={(label) =>
                        update(index, {
                          size_groups: row.size_groups.map((g, n) =>
                            n === groupIndex ? { ...g, label } : g,
                          ),
                        })
                      }
                    />
                    <Field
                      label={`Add price ${groupIndex + 1} — entry ${index + 1} (INR / ${unit ? priceUnitLabel(unit) : 'unit'})`}
                      placeholder="0 for NO ADD"
                      numeric
                      value={group.add_price}
                      onChangeText={(add_price) =>
                        update(index, {
                          size_groups: row.size_groups.map((g, n) =>
                            n === groupIndex ? { ...g, add_price } : g,
                          ),
                        })
                      }
                    />
                    <Txt style={{ fontWeight: '700' }}>
                      Final price:{' '}
                      {gradeNet(row, group.add_price) === null
                        ? 'Complete the prices above'
                        : `INR ${gradeNet(row, group.add_price)} / ${unit ? priceUnitLabel(unit) : 'select unit'}`}
                    </Txt>
                    {row.size_groups.length > 1 ? (
                      <Button
                        secondary
                        disabled={busy}
                        onPress={() =>
                          update(index, {
                            size_groups: row.size_groups.filter(
                              (_, n) => n !== groupIndex,
                            ),
                          })
                        }
                      >{`Remove size group ${groupIndex + 1} from entry ${index + 1}`}</Button>
                    ) : null}
                  </View>
                ))}
                <Button
                  secondary
                  disabled={busy || row.size_groups.length >= 10}
                  onPress={() =>
                    update(index, {
                      size_groups: [
                        ...row.size_groups,
                        { label: '', add_price: '' },
                      ],
                    })
                  }
                >
                  Add size group
                </Button>
                {rows.length > 1 ? (
                  remove === index ? (
                    <Row style={{ flexWrap: 'wrap' }}>
                      <Button
                        disabled={busy}
                        onPress={() => {
                          changed();
                          setRows(rows.filter((_, n) => n !== index));
                          setOpen(-1);
                        }}
                      >
                        Confirm remove entry
                      </Button>
                      <Button secondary onPress={() => setRemove(null)}>
                        Keep entry
                      </Button>
                    </Row>
                  ) : (
                    <Button
                      secondary
                      disabled={busy}
                      onPress={() => setRemove(index)}
                    >{`Remove entry ${index + 1}`}</Button>
                  )
                ) : null}
              </>
            ) : null}
          </Card>
        ))}
        <Button
          secondary
          disabled={busy || rows.length >= 100}
          onPress={() => {
            changed();
            setRows([...rows, newGradeRow()]);
            setOpen(rows.length);
          }}
        >
          Add brand / grade
        </Button>
      </View>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button disabled={busy || !dirty} onPress={() => void save()}>
          {busy ? 'Saving...' : 'Save list draft'}
        </Button>
        {canPublish ? (
          <Button
            secondary
            disabled={busy || dirty || !sheet}
            onPress={() => {
              if (completeError) {
                setMessage(completeError);
                return;
              }
              setMessage('');
              setReview(true);
            }}
          >
            Review publication
          </Button>
        ) : (
          <Txt style={s.muted}>
            Pricing publication permission is required to publish.
          </Txt>
        )}
      </Row>
      {review && sheet ? (
        <Card style={{ gap: 12 }}>
          <Txt style={s.h2}>Publish {category.name}?</Txt>
          <Txt>
            {gstIncluded
              ? `Price including GST (${gstRate}%)`
              : 'Price excluding GST'}{' '}
            | MOQ {moq} {unit}
          </Txt>
          <Txt>
            {rows.length} brands / grades and{' '}
            {rows.reduce((count, row) => count + row.size_groups.length, 0)}{' '}
            size groups will appear in the catalogue. Prices are in INR per{' '}
            {unit ? priceUnitLabel(unit) : 'unit'}. Existing list prices will be
            replaced.
          </Txt>
          <Txt style={s.muted}>
            Customers see Base Price and Net Price. BASE charge, profile,
            rolling and size additions stay private. Orders remain
            quotation-based.
          </Txt>
          <Button disabled={busy} onPress={() => void publish()}>
            Publish category list
          </Button>
          <Button secondary disabled={busy} onPress={() => setReview(false)}>
            Cancel publication
          </Button>
        </Card>
      ) : null}
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </View>
  );
}

export function GradeSheetEditor({
  categories,
  selected,
  onSelect,
  focused = false,
  onEditingChange,
}: {
  categories: AdminCategory[];
  selected: string;
  onSelect: (id: string) => void;
  focused?: boolean;
  onEditingChange?: (dirty: boolean, busy: boolean) => void;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const permitted = hasPermission(auth.identity, 'price.manage');
  const category = categories.find(
    (item) => item.id === selected && item.is_active,
  );
  const [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  useEffect(() => {
    onEditingChange?.(dirty, busy);
  }, [dirty, busy, onEditingChange]);
  const key = ['catalog', 'grade-sheet', auth.session?.user.id, selected];
  const query = useQuery({
    queryKey: key,
    queryFn: () => catalogApi.gradeSheet(selected),
    enabled: !!category && permitted,
    retry: false,
  });
  return (
    <Card style={{ gap: 16 }}>
      <Txt style={s.h2}>
        {focused ? 'Prices & publishing' : 'Category publishing'}
      </Txt>
      {!focused ? (
        <Txt style={s.muted}>
          Create each category once above, then select it here. As Rolled Round
          Bar, Round Bright Bar, Flat, Sheet, Square and TMT Bar share the
          catalogue size and grade lists.
        </Txt>
      ) : null}
      {!permitted ? (
        <Txt>
          Pricing management permission is required to edit category price
          lists.
        </Txt>
      ) : (
        <>
          {!focused ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {categories
                .filter((item) => item.is_active)
                .map((item) => (
                  <Chip
                    key={item.id}
                    selected={selected === item.id}
                    onPress={() => {
                      if (busy || selected === item.id) return;
                      if (dirty) setPendingCategory(item.id);
                      else onSelect(item.id);
                    }}
                  >
                    {item.name}
                  </Chip>
                ))}
            </Row>
          ) : null}
          {pendingCategory ? (
            <Card style={{ gap: 10 }}>
              <Txt>Discard unsaved edits and switch category?</Txt>
              <Button
                disabled={busy}
                onPress={() => {
                  onSelect(pendingCategory);
                  setPendingCategory(null);
                  setDirty(false);
                }}
              >
                Discard edits and switch
              </Button>
              <Button secondary onPress={() => setPendingCategory(null)}>
                Keep editing
              </Button>
            </Card>
          ) : null}
          {!category ? (
            <Txt>Select a category to add its brands and grades.</Txt>
          ) : query.isPending ? (
            <Txt>Loading category list...</Txt>
          ) : query.error ? (
            <Empty
              title="Category list unavailable"
              description={query.error.message}
              action={
                <Button onPress={() => void query.refetch()}>Retry</Button>
              }
            />
          ) : (
            <>
              <SheetForm
                key={`${selected}-${reload}`}
                category={category}
                initial={query.data ?? null}
                onDirty={setDirty}
                onBusy={setBusy}
                onSaved={async (sheet) => {
                  client.setQueryData(key, sheet);
                  await client.invalidateQueries({
                    predicate: (cached) =>
                      cached.queryKey[0] === 'catalog' &&
                      cached.queryKey[1] !== 'grade-sheet',
                  });
                }}
              />
              <Button
                secondary
                disabled={busy}
                onPress={async () => {
                  const result = await query.refetch();
                  if (result.isSuccess) {
                    setReload((value) => value + 1);
                    setDirty(false);
                  }
                }}
              >
                Reload saved list (discard unsaved edits)
              </Button>
            </>
          )}
        </>
      )}
    </Card>
  );
}
