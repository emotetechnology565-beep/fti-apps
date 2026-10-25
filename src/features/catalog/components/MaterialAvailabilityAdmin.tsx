import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Chip, Field, Row, Txt, c, s } from '@shared/ui';
import {
  catalogApi,
  type AdminCategory,
  type AdminProduct,
} from '../data/catalog-repository';
import { CatalogFilter } from './CatalogFilter';
import {
  materialDimensionLabels,
  materialMinimumError,
  parseMaterialDimensions,
  type MaterialDimensionKey,
} from '../model/material-availability-admin';

type Unit = 'kg' | 'MT' | 'piece' | 'box' | 'bundle';
type Specification = {
  category_id: string;
  dimension_label: string;
  dimension_keys: MaterialDimensionKey[];
  enabled: boolean;
};
type Size = {
  id: string;
  category_id: string;
  label: string;
  dimensions: Record<string, number>;
  enabled: boolean;
  sort_order: number;
};
type Option = {
  id: string;
  category_id: string;
  product_id: string;
  size_id: string;
  grade: string;
  uom: Unit;
  min_order_qty: number;
  variant_id: string | null;
  enabled: boolean;
  source: 'variant' | 'manual';
  source_active: boolean;
};
type PriceVariant = {
  id: string;
  sku: string;
  size_label: string | null;
  uom: Unit;
  min_order_qty: number;
  is_active: boolean;
  attributes: Record<string, unknown>;
};
type Product = {
  id: string;
  name: string;
  status: string;
  variants: PriceVariant[];
};
type AdminData = {
  spec: Specification | null;
  sizes: Size[];
  options: Option[];
  products: Product[];
};
const pageSize = 12;
const defaultCategorySlugs = new Set([
  'round-bar-as-rolled',
  'round-bright-bar',
  'tmt',
  'sheet',
  'flat',
  'square',
]);
const labelForDimensions = (dimensions: Record<string, number>) =>
  Object.entries(dimensions)
    .map(
      ([key, value]) =>
        `${materialDimensionLabels[key as MaterialDimensionKey] ?? key}: ${value}`,
    )
    .join(' · ');

type EditingChange = (dirty: boolean, busy: boolean) => void;

export function MaterialAvailabilityAdmin({
  categories,
  products,
  selectedCategory,
  onEditingChange,
}: {
  categories: AdminCategory[];
  products: AdminProduct[];
  selectedCategory?: AdminCategory;
  onEditingChange?: EditingChange;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [open, setOpen] = useState(false);
  const steelCategories = categories.filter(
    (category) =>
      defaultCategorySlugs.has(category.slug) ||
      products.some(
        (product) =>
          product.category_id === category.id &&
          product.product_kind === 'steel',
      ),
  );
  if (selectedCategory)
    return (
      <Card style={{ gap: 14 }}>
        <Txt style={s.h2}>Sizes & grades</Txt>
        <Txt style={s.muted}>
          Choose the sizes and grades customers can request for{' '}
          {selectedCategory.name}. Maintain prices in the Prices tab.
        </Txt>
        <CategoryAvailability
          key={selectedCategory.id}
          category={selectedCategory}
          onEditingChange={onEditingChange}
        />
      </Card>
    );
  return (
    <Card style={{ gap: 14 }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt style={s.h2}>Material availability</Txt>
        <Button secondary onPress={() => setOpen(!open)}>
          {open ? 'Hide availability editor' : 'Manage sizes and grades'}
        </Button>
      </Row>
      <Txt style={s.muted}>
        Choose the sizes and grades customers can request. Maintain published
        prices in the price sheet.
      </Txt>
      {open ? (
        <>
          <CatalogFilter
            label="Availability category"
            value={categoryId}
            options={[
              { value: '', label: 'Choose category' },
              ...steelCategories.map((category) => ({
                value: category.id,
                label: `${category.name}${category.is_active ? '' : ' (inactive)'}`,
              })),
            ]}
            onChange={setCategoryId}
          />
          {categoryId ? (
            <CategoryAvailability
              key={categoryId}
              category={steelCategories.find(
                (category) => category.id === categoryId,
              )!}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function CategoryAvailability({
  category,
  onEditingChange,
}: {
  category: AdminCategory;
  onEditingChange?: EditingChange;
}) {
  const auth = useAuth();
  const query = useQuery({
    queryKey: [
      'catalog',
      'selection-admin',
      auth.session?.user.id,
      category.id,
    ],
    queryFn: () =>
      catalogApi.rpc<AdminData>('fti_catalog_selection_admin', {
        p_category: category.id,
      }),
    retry: false,
  });
  if (query.isPending) return <Txt style={s.muted}>Loading availability…</Txt>;
  if (query.error)
    return (
      <View style={{ gap: 12 }}>
        <Txt accessibilityRole="alert">{query.error.message}</Txt>
        <Button secondary onPress={() => void query.refetch()}>
          Retry availability
        </Button>
      </View>
    );
  return (
    <AvailabilityEditor
      category={category}
      data={query.data}
      onEditingChange={onEditingChange}
    />
  );
}

function AvailabilityEditor({
  category,
  data,
  onEditingChange,
}: {
  category: AdminCategory;
  data: AdminData;
  onEditingChange?: EditingChange;
}) {
  const client = useQueryClient();
  const [dimensionLabel, setDimensionLabel] = useState(
    data.spec?.dimension_label ?? 'Size',
  );
  const [dimensionKeys, setDimensionKeys] = useState<MaterialDimensionKey[]>(
    data.spec?.dimension_keys ?? ['size_mm'],
  );
  const [sizeId, setSizeId] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, string>>({});
  const [sizeEnabled, setSizeEnabled] = useState(true);
  const [optionId, setOptionId] = useState('');
  const [productId, setProductId] = useState('');
  const [optionSizeId, setOptionSizeId] = useState('');
  const [grade, setGrade] = useState('');
  const [variantId, setVariantId] = useState('');
  const [unit, setUnit] = useState<Unit>('MT');
  const [minimum, setMinimum] = useState('1');
  const [optionEnabled, setOptionEnabled] = useState(true);
  const [filterSize, setFilterSize] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const product = data.products.find((item) => item.id === productId);
  const linkedVariant = product?.variants.find((item) => item.id === variantId);
  const variants =
    product?.variants.filter(
      (item) =>
        item.is_active &&
        String(item.attributes.grade ?? '')
          .trim()
          .toUpperCase() === grade.trim().toUpperCase(),
    ) ?? [];
  const selectedSize = data.sizes.find((item) => item.id === sizeId);
  const filteredOptions = data.options.filter(
    (item) =>
      (!filterSize || item.size_id === filterSize) &&
      (!filterProduct || item.product_id === filterProduct),
  );
  const currentOffset = Math.min(
    offset,
    Math.max(0, Math.ceil(filteredOptions.length / pageSize) - 1) * pageSize,
  );
  const originalOption = data.options.find((item) => item.id === optionId);
  const dimensionsDirty =
    dimensionLabel !== (data.spec?.dimension_label ?? 'Size') ||
    dimensionKeys.join(',') !==
      (data.spec?.dimension_keys ?? ['size_mm']).join(',');
  const sizeDirty =
    sizeLabel !== (selectedSize?.label ?? '') ||
    sizeEnabled !== (selectedSize?.enabled ?? true) ||
    (!selectedSize && Object.values(dimensions).some((value) => value?.trim()));
  const optionDirty = originalOption
    ? productId !== originalOption.product_id ||
      optionSizeId !== originalOption.size_id ||
      grade !== originalOption.grade ||
      variantId !== (originalOption.variant_id ?? '') ||
      unit !== originalOption.uom ||
      minimum !== String(originalOption.min_order_qty) ||
      optionEnabled !== originalOption.enabled
    : !!productId ||
      !!grade ||
      !!variantId ||
      unit !== 'MT' ||
      minimum !== '1' ||
      !optionEnabled;
  const dirty = !!(dimensionsDirty || sizeDirty || optionDirty);
  useEffect(() => {
    onEditingChange?.(dirty, busy);
  }, [dirty, busy, onEditingChange]);
  const sizeChoices = data.sizes.map((item) => ({
    value: item.id,
    label: `${item.label}${item.enabled ? '' : ' (disabled)'}`,
  }));

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['catalog'] });
      setMessage(success);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function chooseSize(id: string) {
    const existing = data.sizes.find((item) => item.id === id);
    setSizeId(id);
    setSizeLabel(existing?.label ?? '');
    setSizeEnabled(existing?.enabled ?? true);
    setDimensions(
      Object.fromEntries(
        Object.entries(existing?.dimensions ?? {}).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    );
  }
  function resetOption() {
    setOptionId('');
    setProductId('');
    setOptionSizeId('');
    setGrade('');
    setVariantId('');
    setUnit('MT');
    setMinimum('1');
    setOptionEnabled(true);
  }
  function editOption(option: Option) {
    setOptionId(option.id);
    setProductId(option.product_id);
    setOptionSizeId(option.size_id);
    setGrade(option.grade);
    setVariantId(option.variant_id ?? '');
    setUnit(option.uom);
    setMinimum(String(option.min_order_qty));
    setOptionEnabled(option.enabled);
    setMessage('');
  }
  function selectVariant(id: string) {
    setVariantId(id);
    const selected = product?.variants.find((item) => item.id === id);
    if (selected) {
      setUnit(selected.uom);
      setMinimum(
        String(Math.max(Number(minimum) || 0, Number(selected.min_order_qty))),
      );
    }
  }
  function saveSize() {
    if (!data.spec) return;
    try {
      if (!sizeLabel.trim() || sizeLabel.trim().length > 80)
        throw new Error('Enter a size label of up to 80 characters.');
      const parsed =
        selectedSize?.dimensions ??
        parseMaterialDimensions(data.spec.dimension_keys, dimensions);
      void run(async () => {
        const savedId = await catalogApi.rpc<string>(
          'fti_catalog_selection_size_save',
          {
            p_category: category.id,
            p_size: {
              id: sizeId || null,
              label: sizeLabel.trim(),
              dimensions: parsed,
              enabled: sizeEnabled,
              sort_order: selectedSize?.sort_order ?? 0,
            },
          },
        );
        resetOption();
        setOptionSizeId(savedId);
        setFilterSize(savedId);
        setOffset(0);
        chooseSize('');
      }, 'Size saved. Add or enable its grade combinations below to make it available to customers.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  function saveOption() {
    const error = materialMinimumError(
      minimum,
      linkedVariant ? Number(linkedVariant.min_order_qty) : undefined,
    );
    if (
      !productId ||
      !optionSizeId ||
      !grade.trim() ||
      grade.trim().length > 80 ||
      error
    ) {
      setMessage(
        error ??
          'Choose a product and size and enter a grade of up to 80 characters.',
      );
      return;
    }
    void run(async () => {
      await catalogApi.rpc('fti_catalog_selection_option_save', {
        p_category: category.id,
        p_option: {
          id: optionId || null,
          product_id: productId,
          size_id: optionSizeId,
          grade: grade.trim().toUpperCase(),
          uom: unit,
          min_order_qty: minimum.trim(),
          variant_id: variantId || null,
          enabled: optionEnabled,
        },
      });
      resetOption();
    }, 'Availability saved.');
  }

  return (
    <View style={{ gap: 20 }}>
      {!category.is_active ? (
        <Txt style={s.muted}>
          This category is inactive. Its options are hidden from customers.
        </Txt>
      ) : null}
      <View style={{ gap: 12 }}>
        <Txt style={{ fontWeight: '700' }}>Category dimensions</Txt>
        <Field
          label="Customer size field label"
          value={dimensionLabel}
          onChangeText={setDimensionLabel}
          placeholder="e.g. Thickness"
        />
        <Txt style={s.muted}>
          {data.sizes.length
            ? 'Existing sizes keep their dimension fields. Their labels and availability can be edited below.'
            : 'Choose up to four dimensions for this category.'}
        </Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {(
            Object.entries(materialDimensionLabels) as [
              MaterialDimensionKey,
              string,
            ][]
          ).map(([key, label]) => (
            <Button
              key={key}
              secondary={!dimensionKeys.includes(key)}
              disabled={busy || data.sizes.length > 0}
              onPress={() =>
                setDimensionKeys((old) =>
                  old.includes(key)
                    ? old.filter((item) => item !== key)
                    : old.length < 4
                      ? [...old, key]
                      : old,
                )
              }
            >
              {label}
            </Button>
          ))}
        </Row>
        <Button
          disabled={
            busy ||
            !category.is_active ||
            !dimensionLabel.trim() ||
            !dimensionKeys.length
          }
          onPress={() =>
            void run(
              () =>
                catalogApi.rpc('fti_catalog_selection_spec_save', {
                  p_category: category.id,
                  p_dimension_label: dimensionLabel.trim(),
                  p_dimension_keys: dimensionKeys,
                }),
              'Category dimensions saved.',
            )
          }
        >
          Save dimension settings
        </Button>
      </View>

      {data.spec ? (
        <View
          style={{
            gap: 12,
            borderTopWidth: 1,
            borderColor: c.line,
            paddingTop: 16,
          }}
        >
          <Txt style={{ fontWeight: '700' }}>Sizes ({data.sizes.length})</Txt>
          <CatalogFilter
            label="Size to edit"
            value={sizeId}
            options={[{ value: '', label: 'Add a size' }, ...sizeChoices]}
            onChange={chooseSize}
            disabled={busy}
          />
          <Field
            label="Size label"
            value={sizeLabel}
            onChangeText={setSizeLabel}
            placeholder="e.g. 2.5 mm or 50 × 6 mm"
          />
          {selectedSize ? (
            <Txt style={s.muted}>
              {labelForDimensions(selectedSize.dimensions)}. Add a new size to
              use different dimensions.
            </Txt>
          ) : (
            <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {data.spec.dimension_keys.map((key, index) => (
                <View key={key} style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label={`${materialDimensionLabels[key]}${index ? ' (optional)' : ''}`}
                    value={dimensions[key] ?? ''}
                    numeric
                    placeholder="e.g. 2.5"
                    onChangeText={(value) =>
                      setDimensions((old) => ({ ...old, [key]: value }))
                    }
                  />
                </View>
              ))}
            </Row>
          )}
          <Chip
            selected={sizeEnabled}
            onPress={() => {
              if (!busy) setSizeEnabled(!sizeEnabled);
            }}
          >
            Size enabled
          </Chip>
          <Button disabled={busy || !sizeLabel.trim()} onPress={saveSize}>
            {sizeId ? 'Save size' : 'Add size'}
          </Button>
        </View>
      ) : null}

      {data.spec ? (
        <View
          style={{
            gap: 12,
            borderTopWidth: 1,
            borderColor: c.line,
            paddingTop: 16,
          }}
        >
          <Txt style={{ fontWeight: '700' }}>
            {optionId
              ? 'Edit availability'
              : 'Add a size and grade combination'}
          </Txt>
          {!data.products.length ? (
            <Txt style={s.muted}>
              Create a steel product in this category before adding a
              combination.
            </Txt>
          ) : null}
          <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <CatalogFilter
              label="Availability product"
              value={productId}
              disabled={busy || !!optionId}
              options={[
                { value: '', label: 'Choose product' },
                ...data.products.map((item) => ({
                  value: item.id,
                  label: `${item.name}${item.status === 'published' ? '' : ` (${item.status})`}`,
                })),
              ]}
              onChange={(id) => {
                setProductId(id);
                setVariantId('');
              }}
            />
            <CatalogFilter
              label="Availability size"
              value={optionSizeId}
              disabled={busy || !!optionId}
              options={[{ value: '', label: 'Choose size' }, ...sizeChoices]}
              onChange={(id) => {
                setOptionSizeId(id);
                setVariantId('');
              }}
            />
          </Row>
          {optionId ? (
            <View style={{ gap: 6 }}>
              <Txt style={s.label}>Availability grade</Txt>
              <Txt>{grade}</Txt>
              <Txt style={s.muted}>
                To change the product, size or grade, cancel this edit and add a
                new combination.
              </Txt>
            </View>
          ) : (
            <Field
              label="Availability grade"
              value={grade}
              onChangeText={(value) => {
                setGrade(value);
                setVariantId('');
              }}
              placeholder="e.g. MS or EN-8D"
            />
          )}
          <CatalogFilter
            label="Published price source"
            value={variantId}
            disabled={busy || !productId || !grade.trim()}
            options={[
              { value: '', label: 'Request quote (no linked price)' },
              ...variants.map((item) => ({
                value: item.id,
                label: `${item.size_label || item.sku} · ${item.uom}`,
              })),
              ...(linkedVariant &&
              !variants.some((item) => item.id === linkedVariant.id)
                ? [
                    {
                      value: linkedVariant.id,
                      label: `${linkedVariant.size_label || linkedVariant.sku} (unavailable)`,
                    },
                  ]
                : []),
            ]}
            onChange={selectVariant}
          />
          <Txt style={s.muted}>
            A linked price must cover this size and grade. Without a linked
            price, customers request a quote. Prices are maintained in the
            product or grade sheet.
          </Txt>
          <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <CatalogFilter
              label="Quantity unit"
              value={unit}
              disabled={busy || !!variantId}
              options={(['kg', 'MT', 'piece', 'box', 'bundle'] as Unit[]).map(
                (value) => ({
                  value,
                  label: value === 'MT' ? 'MT (metric tonnes)' : value,
                }),
              )}
              onChange={(value) => setUnit(value as Unit)}
            />
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Minimum quantity"
                value={minimum}
                onChangeText={setMinimum}
                numeric
                placeholder="e.g. 1"
              />
            </View>
          </Row>
          <Chip
            selected={optionEnabled}
            onPress={() => {
              if (!busy) setOptionEnabled(!optionEnabled);
            }}
          >
            Combination enabled
          </Chip>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              disabled={busy || !productId || !optionSizeId || !grade.trim()}
              onPress={saveOption}
            >
              Save availability
            </Button>
            {optionId ? (
              <Button secondary disabled={busy} onPress={resetOption}>
                Cancel edit
              </Button>
            ) : null}
          </Row>
        </View>
      ) : null}

      <View
        style={{
          gap: 12,
          borderTopWidth: 1,
          borderColor: c.line,
          paddingTop: 16,
        }}
      >
        <Txt style={{ fontWeight: '700' }}>
          Configured combinations ({filteredOptions.length})
        </Txt>
        <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <CatalogFilter
            label="Filter combinations by size"
            value={filterSize}
            options={[{ value: '', label: 'All sizes' }, ...sizeChoices]}
            onChange={(value) => {
              setFilterSize(value);
              setOffset(0);
            }}
          />
          <CatalogFilter
            label="Filter combinations by product"
            value={filterProduct}
            options={[
              { value: '', label: 'All products' },
              ...data.products.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
            onChange={(value) => {
              setFilterProduct(value);
              setOffset(0);
            }}
          />
        </Row>
        {!filteredOptions.length ? (
          <Txt style={s.muted}>
            No combinations match. Add an available size and grade above.
          </Txt>
        ) : null}
        {filteredOptions
          .slice(currentOffset, currentOffset + pageSize)
          .map((option) => {
            const size = data.sizes.find((item) => item.id === option.size_id);
            const product = data.products.find(
              (item) => item.id === option.product_id,
            );
            const available =
              option.enabled &&
              option.source_active &&
              size?.enabled &&
              product?.status === 'published' &&
              category.is_active;
            return (
              <View
                key={option.id}
                style={{
                  gap: 8,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingTop: 12,
                }}
              >
                <Txt style={{ fontWeight: '600' }}>
                  {product?.name ?? 'Product'} · {size?.label ?? 'Size'} ·{' '}
                  {option.grade}
                </Txt>
                <Txt style={s.muted}>
                  {available
                    ? 'Available'
                    : !option.enabled
                      ? 'Disabled'
                      : 'Unavailable from current catalogue'}{' '}
                  · Minimum {option.min_order_qty} {option.uom} ·{' '}
                  {option.variant_id ? 'Linked price' : 'Request quote'}
                </Txt>
                <Row style={{ flexWrap: 'wrap' }}>
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() => editOption(option)}
                  >
                    Edit {option.grade} {size?.label ?? ''}
                  </Button>
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void run(
                        () =>
                          catalogApi.rpc('fti_catalog_selection_option_save', {
                            p_category: category.id,
                            p_option: { ...option, enabled: !option.enabled },
                          }),
                        option.enabled
                          ? 'Combination disabled.'
                          : 'Combination enabled.',
                      )
                    }
                  >
                    {option.enabled ? 'Disable' : 'Enable'} {option.grade}{' '}
                    {size?.label ?? ''}
                  </Button>
                </Row>
              </View>
            );
          })}
        {filteredOptions.length > pageSize ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              secondary
              disabled={currentOffset === 0}
              onPress={() => setOffset(Math.max(0, currentOffset - pageSize))}
            >
              Previous combinations
            </Button>
            <Txt style={s.muted}>
              Page {Math.floor(currentOffset / pageSize) + 1} of{' '}
              {Math.ceil(filteredOptions.length / pageSize)}
            </Txt>
            <Button
              secondary
              disabled={currentOffset + pageSize >= filteredOptions.length}
              onPress={() => setOffset(currentOffset + pageSize)}
            >
              Next combinations
            </Button>
          </Row>
        ) : null}
      </View>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </View>
  );
}
