import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  catalogApi,
  type AdminCategory,
  type AdminProduct,
  type AdminVariant,
} from '../data/catalog-repository';
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Row,
  Txt,
  c,
  s,
} from '@shared/ui';
import { View } from 'react-native';
import { ProductImages } from '../components/ProductImages';
import { ProductReferenceCharts } from '../components/ProductReferenceCharts';
import { chartsForProduct } from '../model/product-references';
import { ProductPublication } from '../components/ProductPublication';
import { tractorPricingError } from '../model/tractor-pricing';
import { GradeSheetEditor } from '../components/GradeSheetEditor';
import {
  isSheetFlatCategory,
  sheetFlatPricing,
} from '../model/sheet-flat-pricing';
import { MaterialAvailabilityAdmin } from '../components/MaterialAvailabilityAdmin';
import {
  catalogSections,
  workspaceCategories,
  workspaceProducts,
  type CatalogSection,
  type ProductStatusFilter,
} from '../model/admin-workspace';
import { CatalogFilter } from '../components/CatalogFilter';

type WorkspaceTab = 'Products' | 'Sizes & Grades' | 'Prices' | 'Photos';
const PAGE_SIZE = 10;

const slugFor = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const adminKey = ['catalog', 'admin'] as const;

export function CatalogManagement() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: adminKey,
    queryFn: catalogApi.admin,
    retry: false,
  });
  const [categoryName, setCategoryName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<AdminProduct['product_kind']>('steel');
  const [purchaseMode, setPurchaseMode] =
    useState<AdminProduct['purchase_mode']>('rfq');
  const [sku, setSku] = useState('');
  const [size, setSize] = useState('');
  const [uom, setUom] = useState<AdminVariant['uom']>('kg');
  const [moq, setMoq] = useState('1');
  const [diameter, setDiameter] = useState('');
  const [length, setLength] = useState('');
  const [grade, setGrade] = useState('');
  const [brand, setBrand] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [materialBase, setMaterialBase] = useState('');
  const [vadha, setVadha] = useState('');
  const [variantAttributes, setVariantAttributes] = useState<
    Record<string, unknown>
  >({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [photosFor, setPhotosFor] = useState<string | null>(null);
  const [referencesFor, setReferencesFor] = useState<string | null>(null);
  const [workspaceCategory, setWorkspaceCategory] = useState('');
  const [individualProducts, setIndividualProducts] = useState(false);
  const [section, setSection] = useState<CatalogSection>('steel');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>('Products');
  const [visited, setVisited] = useState<WorkspaceTab[]>(['Products']);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('all');
  const [page, setPage] = useState(0);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [priceEditing, setPriceEditing] = useState({
    dirty: false,
    busy: false,
  });
  const onPriceEditing = useCallback(
    (dirty: boolean, saving: boolean) =>
      setPriceEditing({ dirty, busy: saving }),
    [],
  );
  const [availabilityEditing, setAvailabilityEditing] = useState({
    dirty: false,
    busy: false,
  });
  const onAvailabilityEditing = useCallback(
    (dirty: boolean, saving: boolean) =>
      setAvailabilityEditing({ dirty, busy: saving }),
    [],
  );
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  function navigate(action: () => void) {
    if (busy || priceEditing.busy || availabilityEditing.busy) return;
    if (
      priceEditing.dirty ||
      availabilityEditing.dirty ||
      individualProducts ||
      categoryFormOpen
    )
      setPendingLeave(() => action);
    else action();
  }
  function closeEditors() {
    resetProduct();
    setIndividualProducts(false);
    setCategoryFormOpen(false);
    setCategoryId(null);
    setCategoryName('');
    setCategorySlug('');
    setPriceEditing({ dirty: false, busy: false });
    setAvailabilityEditing({ dirty: false, busy: false });
    setPhotosFor(null);
    setReferencesFor(null);
    setExpandedProduct(null);
    setSearch('');
    setStatus('all');
    setPage(0);
    setNote('');
    setTab('Products');
    setVisited(['Products']);
  }
  function chooseCategory(id: string) {
    navigate(() => {
      closeEditors();
      setWorkspaceCategory(id);
    });
  }
  function changeSection(value: CatalogSection) {
    navigate(() => {
      closeEditors();
      setWorkspaceCategory('');
      setCategorySearch('');
      setSection(value);
    });
  }
  function selectTab(value: WorkspaceTab) {
    setTab(value);
    setVisited((previous) =>
      previous.includes(value) ? previous : [...previous, value],
    );
  }
  const selectedCategory = query.data?.categories.find(
    (item) => item.id === category,
  );
  const sheetFlat =
    kind === 'steel' &&
    !!selectedCategory &&
    (isSheetFlatCategory(selectedCategory.slug) ||
      isSheetFlatCategory(selectedCategory.name));
  const materialPrice = sheetFlatPricing(materialBase, vadha);

  function editCategory(item: AdminCategory) {
    setCategoryFormOpen(true);
    setCategoryId(item.id);
    setCategoryName(item.name);
    setCategorySlug(item.slug);
  }
  function editVariant(product: AdminProduct, variant?: AdminVariant) {
    setIndividualProducts(true);
    setProductId(product.id);
    setVariantId(variant?.id ?? null);
    setCategory(product.category_id);
    setName(product.name);
    setSlug(product.slug);
    setDescription(product.description ?? '');
    setKind(product.product_kind);
    setPurchaseMode(product.purchase_mode);
    setSku(variant?.sku ?? '');
    setSize(variant?.size_label ?? '');
    setUom(variant?.uom ?? 'piece');
    setMoq(variant ? String(variant.min_order_qty) : '');
    setDiameter(variant?.diameter_mm ? String(variant.diameter_mm) : '');
    setLength(variant?.length_mm ? String(variant.length_mm) : '');
    setGrade(
      typeof variant?.attributes.grade === 'string'
        ? variant.attributes.grade
        : '',
    );
    setBrand(
      typeof variant?.attributes.brand === 'string'
        ? variant.attributes.brand
        : '',
    );
    setVariantAttributes(variant?.attributes ?? {});
    setBasePrice(
      variant?.attributes.base_price != null
        ? String(variant.attributes.base_price)
        : '',
    );
    setDiscountedPrice(
      variant?.attributes.discounted_price != null
        ? String(variant.attributes.discounted_price)
        : '',
    );
    setMaterialBase(String(variant?.attributes.sheet_flat_base_rate_pmt ?? ''));
    setVadha(String(variant?.attributes.sheet_flat_vadha ?? ''));
    setNote('');
  }
  function resetProduct() {
    setProductId(null);
    setVariantId(null);
    setCategory(workspaceCategory);
    setName('');
    setSlug('');
    setDescription('');
    setKind(section);
    setPurchaseMode('rfq');
    setSku('');
    setSize('');
    setUom(section === 'steel' ? 'kg' : 'piece');
    setMoq('1');
    setDiameter('');
    setLength('');
    setGrade('');
    setBrand('');
    setBasePrice('');
    setDiscountedPrice('');
    setVariantAttributes({});
    setMaterialBase('');
    setVadha('');
  }
  async function saveCategory() {
    setBusy(true);
    setNote('');
    try {
      const previous = query.data?.categories.find(
        (item) => item.id === categoryId,
      );
      const savedId = await catalogApi.saveCategory({
        id: categoryId,
        name: categoryName,
        slug: categorySlug || slugFor(categoryName),
        sort_order: previous?.sort_order ?? 0,
        is_active: previous?.is_active ?? true,
      });
      setWorkspaceCategory(savedId);
      setCategoryFormOpen(false);
      setCategoryId(null);
      setCategoryName('');
      setCategorySlug('');
      setNote('Category saved.');
      await client.invalidateQueries({ queryKey: adminKey });
      await client.invalidateQueries({
        queryKey: ['catalog', 'supabase-catalog-v1', 'products'],
      });
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setCategoryActive(item: AdminCategory, is_active: boolean) {
    setBusy(true);
    setNote('');
    try {
      await catalogApi.saveCategory({ ...item, is_active });
      await client.invalidateQueries({ queryKey: adminKey });
      await client.invalidateQueries({
        queryKey: ['catalog', 'supabase-catalog-v1', 'products'],
      });
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProduct() {
    if (!category || !name.trim() || !sku.trim() || Number(moq) <= 0) {
      setNote(
        'Choose a category and enter a product name, SKU and valid minimum quantity.',
      );
      return;
    }
    if (
      sheetFlat &&
      (!/^\d+(\.\d+)?\s*MM$/i.test(size.trim()) ||
        parseFloat(size) <= 0 ||
        !materialPrice)
    ) {
      setNote(
        'Enter Size Thickness in mm (e.g. 2MM), a positive Base Rate PMT and non-negative Vadha with up to 2 decimals.',
      );
      return;
    }
    if (kind === 'tractor_part') {
      const error = tractorPricingError(basePrice, discountedPrice);
      if (error) {
        setNote(error);
        return;
      }
    }
    const attributes = { ...variantAttributes };
    delete attributes.grade;
    delete attributes.brand;
    if (grade.trim()) attributes.grade = grade.trim();
    if (brand.trim()) attributes.brand = brand.trim();
    if (sheetFlat && materialPrice) {
      attributes.sheet_flat_base_rate_pmt = materialPrice.base;
      attributes.sheet_flat_vadha = materialPrice.vadha;
      attributes.sheet_flat_total = materialPrice.total;
      attributes.sheet_flat_gst = materialPrice.gst;
      attributes.sheet_flat_net_prate = materialPrice.net;
      attributes.sheet_flat_gst_included = false;
      attributes.grade_list_base_price = materialPrice.base;
      attributes.grade_list_price = materialPrice.net;
      attributes.grade_list_gst_included = false;
      attributes.grade_list_gst_rate = null;
      attributes.grade = grade.trim() || 'MS';
      attributes.size_group = size.trim().toUpperCase();
    }
    if (kind === 'tractor_part') {
      delete attributes.base_price;
      delete attributes.discounted_price;
      if (basePrice.trim())
        attributes.base_price = Number(basePrice).toFixed(2);
      if (discountedPrice.trim())
        attributes.discounted_price = Number(discountedPrice).toFixed(2);
    }
    setBusy(true);
    setNote('');
    try {
      await catalogApi.saveProduct(
        {
          id: productId,
          category_id: category,
          name,
          slug: slug || slugFor(name),
          description,
          product_kind: kind,
          purchase_mode: purchaseMode,
        },
        [
          {
            id: variantId,
            sku,
            size_label: size,
            uom: sheetFlat ? 'MT' : uom,
            min_order_qty: Number(moq),
            diameter_mm: sheetFlat ? null : diameter || null,
            length_mm: length || null,
            attributes,
            is_active: true,
          },
        ],
      );
      resetProduct();
      setIndividualProducts(false);
      setNote('Product and variant saved as catalogue data.');
      await client.invalidateQueries({ queryKey: adminKey });
      await client.invalidateQueries({ queryKey: ['catalog'] });
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshCatalogue() {
    await client.invalidateQueries({ queryKey: ['catalog'] });
  }

  if (query.isPending)
    return (
      <Card>
        <Txt style={s.muted}>Loading catalogue management...</Txt>
      </Card>
    );
  if (query.error)
    return (
      <Empty
        title="Catalogue management unavailable"
        description={query.error.message}
        action={
          <Button secondary onPress={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  const data = query.data;
  const workspace = data.categories.find(
    (item) => item.id === workspaceCategory,
  );
  const sectionLabel = catalogSections.find(
    (item) => item.kind === section,
  )!.label;
  const categories = workspaceCategories(
    data.categories,
    data.products,
    section,
    categorySearch,
  );
  const categoryProducts = data.products.filter(
    (item) =>
      item.category_id === workspaceCategory && item.product_kind === section,
  );
  const matching = workspaceProducts(
    data.products,
    workspaceCategory,
    section,
    search,
    status,
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1),
  );
  const visibleProducts = matching.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const workspaceTabs: WorkspaceTab[] =
    section === 'steel'
      ? ['Products', 'Sizes & Grades', 'Prices', 'Photos']
      : section === 'tractor_part'
        ? ['Products', 'Photos']
        : ['Products', 'Prices', 'Photos'];

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt style={s.h2}>Catalogue management</Txt>
        <Txt style={s.muted}>
          Choose a category to manage its products, availability and prices.
        </Txt>
      </View>
      <Row style={{ flexWrap: 'wrap' }}>
        {catalogSections.map((item) => (
          <Chip
            key={item.kind}
            selected={section === item.kind}
            onPress={() => {
              if (section !== item.kind) changeSection(item.kind);
            }}
          >
            {item.label}
          </Chip>
        ))}
      </Row>

      {pendingLeave ? (
        <Card style={{ gap: 12 }}>
          <Txt style={s.h2}>Leave unsaved edits?</Txt>
          <Txt>Your unsaved changes in this category will be discarded.</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              disabled={busy || priceEditing.busy || availabilityEditing.busy}
              onPress={() => {
                const action = pendingLeave;
                setPendingLeave(null);
                action();
              }}
            >
              Discard edits and continue
            </Button>
            <Button secondary onPress={() => setPendingLeave(null)}>
              Keep editing
            </Button>
          </Row>
        </Card>
      ) : null}

      {!workspace ? (
        <>
          <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Txt style={s.h2}>{sectionLabel} categories</Txt>
            <Button
              onPress={() => {
                setCategoryId(null);
                setCategoryName('');
                setCategorySlug('');
                setCategoryFormOpen(true);
              }}
            >
              Add category
            </Button>
          </Row>
          <Field
            label="Search categories"
            placeholder="Find a category by name"
            value={categorySearch}
            onChangeText={setCategorySearch}
          />
          <Txt style={s.muted}>
            {categories.length} categories · Choose one to view its products
          </Txt>
          <Card style={{ gap: 0 }}>
            {categories.map((item, index) => {
              const members = data.products.filter(
                (product) =>
                  product.category_id === item.id &&
                  product.product_kind === section,
              );
              return (
                <View
                  key={item.id}
                  testID={'catalog-category-' + item.id}
                  style={[
                    s.row,
                    {
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                      paddingVertical: 16,
                      borderTopWidth: index ? 1 : 0,
                      borderColor: c.line,
                    },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 150, gap: 4 }}>
                    <Txt style={{ fontWeight: '700' }}>{item.name}</Txt>
                    <Txt style={s.muted}>
                      {members.length} products ·{' '}
                      {
                        members.filter(
                          (product) => product.status === 'published',
                        ).length
                      }{' '}
                      published · {item.is_active ? 'Active' : 'Inactive'}
                    </Txt>
                  </View>
                  <Button secondary onPress={() => chooseCategory(item.id)}>
                    Open category
                  </Button>
                </View>
              );
            })}
            {!categories.length ? (
              <Empty
                title={
                  categorySearch
                    ? 'No matching categories'
                    : 'No categories yet'
                }
                description={
                  categorySearch
                    ? 'Try another category name.'
                    : 'Add a category to start organizing products.'
                }
              />
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              secondary
              disabled={busy || priceEditing.busy}
              onPress={() => chooseCategory('')}
            >
              Back to categories
            </Button>
            <Txt style={s.muted}>
              {sectionLabel} / {workspace.name}
            </Txt>
          </Row>
          <Row
            style={{
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, minWidth: 150, gap: 6 }}>
              <Txt style={s.h2}>{workspace.name}</Txt>
              <Txt style={s.muted}>
                {categoryProducts.length} products ·{' '}
                {
                  categoryProducts.filter((item) => item.status === 'published')
                    .length
                }{' '}
                published
              </Txt>
            </View>
            <Badge>
              {workspace.is_active ? 'ACTIVE CATEGORY' : 'INACTIVE CATEGORY'}
            </Badge>
            <Button secondary onPress={() => editCategory(workspace)}>
              Category settings
            </Button>
          </Row>
          {!workspace.is_active ? (
            <Txt style={s.muted}>
              This category is inactive. Activate it in Category settings before
              publishing products.
            </Txt>
          ) : null}
          <Row style={{ flexWrap: 'wrap' }}>
            {workspaceTabs.map((value) => (
              <Chip
                key={value}
                selected={tab === value}
                onPress={() => selectTab(value)}
              >
                {value}
              </Chip>
            ))}
          </Row>
        </>
      )}

      {categoryFormOpen ? (
        <Card style={{ gap: 12 }}>
          <Txt style={s.h2}>
            {categoryId ? 'Category settings' : 'Add category'}
          </Txt>
          <Field
            label="Category name"
            placeholder="e.g. Round Bright Bar"
            value={categoryName}
            onChangeText={(value) => {
              setCategoryName(value);
              if (!categoryId) setCategorySlug(slugFor(value));
            }}
          />
          <Field
            label="Category URL slug"
            placeholder="e.g. round-bright-bar"
            value={categorySlug}
            onChangeText={setCategorySlug}
          />
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              disabled={busy || !categoryName.trim()}
              onPress={() => void saveCategory()}
            >
              {categoryId ? 'Save category' : 'Create category'}
            </Button>
            <Button
              secondary
              disabled={busy}
              onPress={() => {
                setCategoryFormOpen(false);
                setCategoryId(null);
                setCategoryName('');
                setCategorySlug('');
              }}
            >
              Cancel category editing
            </Button>
            {categoryId && workspace ? (
              <Button
                secondary
                disabled={
                  busy ||
                  priceEditing.dirty ||
                  priceEditing.busy ||
                  availabilityEditing.dirty ||
                  availabilityEditing.busy ||
                  individualProducts
                }
                onPress={() =>
                  void setCategoryActive(workspace, !workspace.is_active)
                }
              >
                {workspace.is_active
                  ? 'Deactivate category'
                  : 'Activate category'}
              </Button>
            ) : null}
          </Row>
        </Card>
      ) : null}

      {workspace ? (
        <View key={section + ':' + workspace.id} style={{ gap: 16 }}>
          <View
            style={{ gap: 16, display: tab === 'Products' ? 'flex' : 'none' }}
          >
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Txt style={s.h2}>Products</Txt>
              <Button
                disabled={individualProducts}
                onPress={() => {
                  resetProduct();
                  setIndividualProducts(true);
                }}
              >
                Add product
              </Button>
            </Row>
            {individualProducts ? (
              <Card style={{ gap: 12 }}>
                <Txt style={s.h2}>
                  {productId
                    ? 'Edit product variant'
                    : 'Add product and first variant'}
                </Txt>
                {sheetFlat ? (
                  <Txt style={s.muted}>
                    SR.NO.:{' '}
                    {(() => {
                      const variants = data.products
                        .filter((item) => item.category_id === category)
                        .flatMap((item) => item.variants);
                      const index = variants.findIndex(
                        (item) => item.id === variantId,
                      );
                      return index < 0 ? variants.length + 1 : index + 1;
                    })()}
                  </Txt>
                ) : null}
                <Txt style={s.muted}>{sheetFlat ? 'CATEGORY' : 'Category'}</Txt>
                <Row style={{ flexWrap: 'wrap' }}>
                  {data.categories
                    .filter((item) => item.id === workspaceCategory)
                    .map((item) => (
                      <Chip
                        key={item.id}
                        selected={category === item.id}
                        onPress={() => setCategory(item.id)}
                      >
                        {item.name}
                      </Chip>
                    ))}
                </Row>
                <Field
                  label="Product name"
                  placeholder="e.g. High tensile hex bolt"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    if (!productId) setSlug(slugFor(value));
                  }}
                />
                <Field
                  label="Product slug"
                  placeholder="e.g. high-tensile-hex-bolt"
                  value={slug}
                  onChangeText={setSlug}
                />
                <Field
                  label="Description"
                  placeholder="e.g. Zinc-plated hex bolt for general fastening."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
                <Txt style={s.muted}>Product type</Txt>
                <Row style={{ flexWrap: 'wrap' }}>
                  {(
                    ['steel', 'fastener', 'tractor_part', 'other'] as const
                  ).map((value) => (
                    <Chip
                      key={value}
                      selected={kind === value}
                      onPress={() => setKind(value)}
                    >
                      {value.replace('_', ' ')}
                    </Chip>
                  ))}
                </Row>
                <Txt style={s.muted}>Purchase mode</Txt>
                <Row style={{ flexWrap: 'wrap' }}>
                  {(['rfq', 'direct', 'both'] as const).map((value) => (
                    <Chip
                      key={value}
                      selected={purchaseMode === value}
                      onPress={() => setPurchaseMode(value)}
                    >
                      {value}
                    </Chip>
                  ))}
                </Row>
                <Field
                  label="Variant SKU"
                  placeholder="e.g. HEX-M12-50"
                  value={sku}
                  onChangeText={setSku}
                />
                <Field
                  label={sheetFlat ? 'SIZE THICKNESS' : 'Size / variant label'}
                  placeholder={sheetFlat ? 'e.g. 2MM' : 'e.g. M12 x 50 mm'}
                  value={size}
                  onChangeText={setSize}
                />
                {sheetFlat ? (
                  <View style={{ gap: 12 }}>
                    <Txt style={s.h2}>SHEET MS / FLAT MS RATE</Txt>
                    <Field
                      label="BASE RATE PMT"
                      placeholder="e.g. 52900"
                      numeric
                      value={materialBase}
                      onChangeText={setMaterialBase}
                    />
                    <Field
                      label="VADHA"
                      placeholder="e.g. 3300"
                      numeric
                      value={vadha}
                      onChangeText={setVadha}
                    />
                    <Txt>TOTAL: {materialPrice?.total ?? '—'}</Txt>
                    <Txt style={s.h2}>
                      NET PRATE: {materialPrice?.net ?? '—'}
                    </Txt>
                    <Txt style={s.muted}>
                      INR per metric tonne. Net Prate = Base Rate PMT + Vadha.
                      GST is excluded and will be added during order
                      confirmation.
                    </Txt>
                  </View>
                ) : null}
                <Txt style={s.muted}>Unit of measure</Txt>
                {sheetFlat ? (
                  <Badge>PMT (per metric tonne)</Badge>
                ) : (
                  <Row style={{ flexWrap: 'wrap' }}>
                    {(['kg', 'MT', 'piece', 'box', 'bundle'] as const).map(
                      (value) => (
                        <Chip
                          key={value}
                          selected={uom === value}
                          onPress={() => setUom(value)}
                        >
                          {value}
                        </Chip>
                      ),
                    )}
                  </Row>
                )}
                <Field
                  label="Minimum order quantity"
                  placeholder="e.g. 100"
                  numeric
                  value={moq}
                  onChangeText={setMoq}
                />
                {kind === 'tractor_part' ? (
                  <View style={{ gap: 12 }}>
                    <Txt style={s.muted}>
                      Optional prices in INR per {uom}. Leave both blank for
                      price on request.
                    </Txt>
                    <Field
                      label="Base price (₹)"
                      placeholder="e.g. 1000.00"
                      numeric
                      value={basePrice}
                      onChangeText={setBasePrice}
                    />
                    <Field
                      label="Price after discount (₹, optional)"
                      placeholder="e.g. 800.00"
                      numeric
                      value={discountedPrice}
                      onChangeText={setDiscountedPrice}
                    />
                  </View>
                ) : null}
                {!sheetFlat ? (
                  <Row style={{ flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Field
                        label="Diameter (mm)"
                        placeholder="e.g. 12"
                        numeric
                        value={diameter}
                        onChangeText={setDiameter}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Field
                        label="Length (mm)"
                        placeholder="e.g. 50"
                        numeric
                        value={length}
                        onChangeText={setLength}
                      />
                    </View>
                  </Row>
                ) : null}
                <Row style={{ flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field
                      label="Grade"
                      placeholder="e.g. 8.8"
                      value={grade}
                      onChangeText={setGrade}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field
                      label="Brand"
                      placeholder="e.g. Unbrako"
                      value={brand}
                      onChangeText={setBrand}
                    />
                  </View>
                </Row>
                <Row style={{ flexWrap: 'wrap' }}>
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() => {
                      resetProduct();
                      setIndividualProducts(false);
                    }}
                  >
                    Cancel product editing
                  </Button>
                  <Button disabled={busy} onPress={() => void saveProduct()}>
                    {productId
                      ? 'Save product and variant'
                      : 'Create product draft'}
                  </Button>
                  {productId ? (
                    <Button secondary onPress={resetProduct}>
                      New product
                    </Button>
                  ) : null}
                </Row>
              </Card>
            ) : null}
          </View>

          {visited.includes('Prices') && workspaceTabs.includes('Prices') ? (
            <View style={{ display: tab === 'Prices' ? 'flex' : 'none' }}>
              {workspace.is_active ? (
                <GradeSheetEditor
                  focused
                  categories={[workspace]}
                  selected={workspace.id}
                  onSelect={setWorkspaceCategory}
                  onEditingChange={onPriceEditing}
                />
              ) : (
                <Empty
                  title="Category is inactive"
                  description="Activate this category in Category settings to manage its price sheet."
                />
              )}
            </View>
          ) : null}
          {visited.includes('Sizes & Grades') && section === 'steel' ? (
            <View
              style={{ display: tab === 'Sizes & Grades' ? 'flex' : 'none' }}
            >
              <MaterialAvailabilityAdmin
                categories={[workspace]}
                products={categoryProducts}
                selectedCategory={workspace}
                onEditingChange={onAvailabilityEditing}
              />
            </View>
          ) : null}

          {tab === 'Products' || tab === 'Photos' ? (
            <View style={{ gap: 12 }}>
              <Field
                label="Search products"
                placeholder="Search name, SKU, size, grade or brand"
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setPage(0);
                }}
              />
              <CatalogFilter
                label="Product status"
                value={status}
                onChange={(value) => {
                  setStatus(value as ProductStatusFilter);
                  setPage(0);
                }}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'published', label: 'Published' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
              <Txt style={s.muted}>
                {matching.length}{' '}
                {tab === 'Photos'
                  ? 'products · Select a product to manage its photos'
                  : 'matching products'}
              </Txt>
              {visibleProducts.map((item) => (
                <View
                  key={item.id}
                  testID={'catalog-product-' + item.id}
                  style={[s.card, { gap: 12 }]}
                >
                  <Row
                    style={{
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 140, gap: 4 }}>
                      <Txt style={{ fontWeight: '700' }}>{item.name}</Txt>
                      <Txt style={s.muted}>
                        {item.variants.length} variants · {item.slug}
                      </Txt>
                    </View>
                    <Badge>{item.status.toUpperCase()}</Badge>
                    {tab === 'Products' ? (
                      <Button
                        secondary
                        onPress={() =>
                          setExpandedProduct(
                            expandedProduct === item.id ? null : item.id,
                          )
                        }
                      >
                        {expandedProduct === item.id
                          ? 'Close details'
                          : 'Manage product'}
                      </Button>
                    ) : (
                      <Button
                        secondary
                        onPress={() =>
                          setPhotosFor(photosFor === item.id ? null : item.id)
                        }
                      >
                        {photosFor === item.id
                          ? 'Hide photos'
                          : 'Manage photos'}
                      </Button>
                    )}
                  </Row>
                  {tab === 'Photos' && photosFor === item.id ? (
                    <ProductImages productId={item.id} />
                  ) : null}
                  {tab === 'Products' && expandedProduct === item.id ? (
                    <>
                      {workspaceTabs.includes('Prices') &&
                      item.variants.some(
                        (variant) =>
                          variant.attributes.grade_list_price !== undefined,
                      ) ? (
                        <Button secondary onPress={() => selectTab('Prices')}>
                          Edit grades and prices
                        </Button>
                      ) : (
                        item.variants.map((variant) => (
                          <Row
                            key={variant.id}
                            style={{
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 8,
                            }}
                          >
                            <View style={{ flex: 1, minWidth: 140 }}>
                              <Txt style={s.muted}>
                                {variant.sku} ·{' '}
                                {variant.size_label || 'No size'} · MOQ{' '}
                                {variant.min_order_qty} {variant.uom}
                              </Txt>
                            </View>
                            <Button
                              secondary
                              onPress={() => {
                                if (individualProducts) {
                                  setNote(
                                    'Save or cancel the open product form before editing another variant.',
                                  );
                                  return;
                                }
                                editVariant(item, variant);
                              }}
                            >
                              Edit variant
                            </Button>
                          </Row>
                        ))
                      )}
                      {!item.variants.length ? (
                        <Button
                          secondary
                          onPress={() => {
                            if (individualProducts) {
                              setNote(
                                'Save or cancel the open product form first.',
                              );
                              return;
                            }
                            editVariant(item);
                          }}
                        >
                          Add first variant
                        </Button>
                      ) : null}
                      <ProductPublication
                        product={item}
                        categories={data.categories}
                        disabled={busy}
                        refresh={refreshCatalogue}
                      />
                      {chartsForProduct(item.slug).length ? (
                        <Button
                          secondary
                          onPress={() =>
                            setReferencesFor(
                              referencesFor === item.id ? null : item.id,
                            )
                          }
                        >
                          {referencesFor === item.id
                            ? 'Hide reference charts'
                            : 'View reference charts'}
                        </Button>
                      ) : null}
                      {referencesFor === item.id ? (
                        <ProductReferenceCharts key={item.id} product={item} />
                      ) : null}
                    </>
                  ) : null}
                </View>
              ))}
              {!matching.length ? (
                <Empty
                  title={
                    search || status !== 'all'
                      ? 'No matching products'
                      : 'No products in this category'
                  }
                  description={
                    search || status !== 'all'
                      ? 'Try another search or status filter.'
                      : 'Add the first product using the Add product button.'
                  }
                  action={
                    search || status !== 'all' ? (
                      <Button
                        secondary
                        onPress={() => {
                          setSearch('');
                          setStatus('all');
                          setPage(0);
                        }}
                      >
                        Clear product filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}
              {matching.length > PAGE_SIZE ? (
                <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Button
                    secondary
                    disabled={currentPage === 0}
                    onPress={() => setPage(currentPage - 1)}
                  >
                    Previous products
                  </Button>
                  <Txt style={s.muted}>
                    Page {currentPage + 1} of{' '}
                    {Math.ceil(matching.length / PAGE_SIZE)}
                  </Txt>
                  <Button
                    secondary
                    disabled={(currentPage + 1) * PAGE_SIZE >= matching.length}
                    onPress={() => setPage(currentPage + 1)}
                  >
                    Next products
                  </Button>
                </Row>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {note ? (
        <Txt accessibilityRole="alert" style={{ color: c.red }}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}
