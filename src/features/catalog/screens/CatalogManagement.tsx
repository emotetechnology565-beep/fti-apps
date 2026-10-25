import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi, type AdminCategory, type AdminProduct, type AdminVariant } from '../data/catalog-repository';
import { Badge, Button, Card, Chip, Empty, Field, Row, Txt, c, s } from '@shared/ui';
import { View } from 'react-native';
import { ProductImages } from '../components/ProductImages';
import { ProductReferenceCharts } from '../components/ProductReferenceCharts';
import { chartsForProduct } from '../model/product-references';
import { ProductPublication } from '../components/ProductPublication';
import { tractorPricingError } from '../model/tractor-pricing';
import { GradeSheetEditor } from '../components/GradeSheetEditor';
import { isSheetFlatCategory, sheetFlatPricing } from '../model/sheet-flat-pricing';
import { MaterialAvailabilityAdmin } from '../components/MaterialAvailabilityAdmin';

const slugFor = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const adminKey = ['catalog', 'admin'] as const;

export function CatalogManagement() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: adminKey, queryFn: catalogApi.admin, retry: false });
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
  const [purchaseMode, setPurchaseMode] = useState<AdminProduct['purchase_mode']>('rfq');
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
  const [variantAttributes, setVariantAttributes] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [photosFor, setPhotosFor] = useState<string | null>(null);
  const [referencesFor, setReferencesFor] = useState<string | null>(null);
  const [gradeCategory, setGradeCategory] = useState('');
  const [individualProducts, setIndividualProducts] = useState(false);
  const selectedCategory = query.data?.categories.find(item => item.id === category);
  const sheetFlat = kind === 'steel' && !!selectedCategory &&
    (isSheetFlatCategory(selectedCategory.slug) || isSheetFlatCategory(selectedCategory.name));
  const materialPrice = sheetFlatPricing(materialBase, vadha);

  function editCategory(item: AdminCategory) {
    setCategoryId(item.id); setCategoryName(item.name); setCategorySlug(item.slug);
  }
  function editVariant(product: AdminProduct, variant?: AdminVariant) {
    setIndividualProducts(true);
    setProductId(product.id); setVariantId(variant?.id ?? null); setCategory(product.category_id);
    setName(product.name); setSlug(product.slug); setDescription(product.description ?? '');
    setKind(product.product_kind); setPurchaseMode(product.purchase_mode);
    setSku(variant?.sku ?? ''); setSize(variant?.size_label ?? ''); setUom(variant?.uom ?? 'piece');
    setMoq(variant ? String(variant.min_order_qty) : ''); setDiameter(variant?.diameter_mm ? String(variant.diameter_mm) : '');
    setLength(variant?.length_mm ? String(variant.length_mm) : '');
    setGrade(typeof variant?.attributes.grade === 'string' ? variant.attributes.grade : '');
    setBrand(typeof variant?.attributes.brand === 'string' ? variant.attributes.brand : '');
    setVariantAttributes(variant?.attributes ?? {});
    setBasePrice(variant?.attributes.base_price != null ? String(variant.attributes.base_price) : '');
    setDiscountedPrice(variant?.attributes.discounted_price != null ? String(variant.attributes.discounted_price) : '');
    setMaterialBase(String(variant?.attributes.sheet_flat_base_rate_pmt ?? ''));
    setVadha(String(variant?.attributes.sheet_flat_vadha ?? ''));
    setNote('');
  }
  function resetProduct() {
    setProductId(null); setVariantId(null); setCategory(''); setName(''); setSlug('');
    setDescription(''); setKind('steel'); setPurchaseMode('rfq'); setSku(''); setSize('');
    setUom('kg'); setMoq('1'); setDiameter(''); setLength(''); setGrade(''); setBrand('');
    setBasePrice(''); setDiscountedPrice(''); setVariantAttributes({});
    setMaterialBase(''); setVadha('');
  }
  async function saveCategory() {
    setBusy(true); setNote('');
    try {
      const savedId = await catalogApi.saveCategory({ id: categoryId, name: categoryName, slug: categorySlug || slugFor(categoryName), sort_order: 0, is_active: true });
      if (!gradeCategory) setGradeCategory(savedId);
      setCategoryId(null); setCategoryName(''); setCategorySlug(''); setNote('Category saved.');
      await client.invalidateQueries({ queryKey: adminKey });
      await client.invalidateQueries({ queryKey: ['catalog', 'supabase-catalog-v1', 'products'] });
    } catch (error) { setNote((error as Error).message); }
    finally { setBusy(false); }
  }
  async function setCategoryActive(item: AdminCategory, is_active: boolean) {
    setBusy(true); setNote('');
    try {
      await catalogApi.saveCategory({ ...item, is_active });
      await client.invalidateQueries({ queryKey: adminKey });
      await client.invalidateQueries({ queryKey: ['catalog', 'supabase-catalog-v1', 'products'] });
    }
    catch (error) { setNote((error as Error).message); }
    finally { setBusy(false); }
  }
  async function saveProduct() {
    if (!category || !name.trim() || !sku.trim() || Number(moq) <= 0) { setNote('Choose a category and enter a product name, SKU and valid minimum quantity.'); return; }
    if (sheetFlat && (!/^\d+(\.\d+)?\s*MM$/i.test(size.trim()) || parseFloat(size) <= 0 || !materialPrice)) {
      setNote('Enter Size Thickness in mm (e.g. 2MM), a positive Base Rate PMT and non-negative Vadha with up to 2 decimals.'); return;
    }
    if (kind === 'tractor_part') {
      const error = tractorPricingError(basePrice, discountedPrice);
      if (error) { setNote(error); return; }
    }
    const attributes = { ...variantAttributes };
    delete attributes.grade; delete attributes.brand;
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
      delete attributes.base_price; delete attributes.discounted_price;
      if (basePrice.trim()) attributes.base_price = Number(basePrice).toFixed(2);
      if (discountedPrice.trim()) attributes.discounted_price = Number(discountedPrice).toFixed(2);
    }
    setBusy(true); setNote('');
    try {
      await catalogApi.saveProduct({ id: productId, category_id: category, name, slug: slug || slugFor(name), description, product_kind: kind, purchase_mode: purchaseMode }, [{ id: variantId, sku, size_label: size, uom: sheetFlat ? 'MT' : uom, min_order_qty: Number(moq), diameter_mm: sheetFlat ? null : diameter || null, length_mm: length || null, attributes, is_active: true }]);
      resetProduct(); setNote('Product and variant saved as catalogue data.');
      await client.invalidateQueries({ queryKey: adminKey });
      await client.invalidateQueries({ queryKey: ['catalog'] });
    } catch (error) { setNote((error as Error).message); }
    finally { setBusy(false); }
  }
  async function refreshCatalogue() {
    await client.invalidateQueries({ queryKey: ['catalog'] });
  }

  if (query.isPending) return <Card><Txt style={s.muted}>Loading catalogue management…</Txt></Card>;
  if (query.error) return <Empty title="Catalogue management unavailable" description={query.error.message} action={<Button secondary onPress={() => void query.refetch()}>Try again</Button>} />;
  const data = query.data;
  return (
    <View style={{ gap: 18 }}>
      <Txt style={s.h2}>Catalogue management</Txt>
      <Txt style={s.muted}>Create a category once, then maintain its brands, grades and price list. Save a draft before publishing.</Txt>
      <Card style={{ gap: 12 }}>
        <Txt style={s.h2}>{categoryId ? 'Edit category' : 'Add category'}</Txt>
        <Field label="Category name" placeholder="e.g. As Rolled Round Bar, Round Bright Bar, Flat, Sheet, Square or TMT Bar" value={categoryName} onChangeText={(value) => { setCategoryName(value); if (!categoryId) setCategorySlug(slugFor(value)); }} />
        <Field label="Category URL slug" placeholder="e.g. hex-bolts" value={categorySlug} onChangeText={setCategorySlug} />
        <Row>
          <Button disabled={busy || !categoryName.trim()} onPress={() => void saveCategory()}>{categoryId ? 'Save category' : 'Create category'}</Button>
          {categoryId ? <Button secondary onPress={() => { setCategoryId(null); setCategoryName(''); setCategorySlug(''); }}>Cancel</Button> : null}
        </Row>
        {data.categories.map((item) => (
          <Row key={item.id} style={{ justifyContent: 'space-between', flexWrap: 'wrap', borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
            <View><Txt>{item.name}</Txt><Txt style={s.muted}>{item.slug} · {item.is_active ? 'Active' : 'Inactive'}</Txt></View>
            <Row><Button secondary onPress={() => editCategory(item)}>Edit</Button><Button secondary disabled={busy} onPress={() => void setCategoryActive(item, !item.is_active)}>{item.is_active ? 'Deactivate' : 'Activate'}</Button></Row>
          </Row>
        ))}
      </Card>

      <GradeSheetEditor categories={data.categories} selected={gradeCategory} onSelect={setGradeCategory} />
      <MaterialAvailabilityAdmin categories={data.categories} products={data.products} />
      <Row style={{ flexWrap: 'wrap' }}>{data.categories.filter(item => item.is_active && (isSheetFlatCategory(item.slug) || isSheetFlatCategory(item.name))).map(item =>
        <Button key={item.id} secondary onPress={() => { resetProduct(); setIndividualProducts(true); setCategory(item.id); setName(`${item.name} MS`); setSlug(slugFor(`${item.name} MS`)); setGrade('MS'); setUom('MT'); }}>Add {item.name} product</Button>)}</Row>
      <Button secondary onPress={() => setIndividualProducts(!individualProducts)}>{individualProducts ? 'Hide individual product form' : 'Manage individual products'}</Button>
      {individualProducts ? <Card style={{ gap: 12 }}>
        <Txt style={s.h2}>{productId ? 'Edit product variant' : 'Add product and first variant'}</Txt>
        {sheetFlat ? <Txt style={s.muted}>SR.NO.: {(() => {
          const variants = data.products.filter(item => item.category_id === category).flatMap(item => item.variants);
          const index = variants.findIndex(item => item.id === variantId);
          return index < 0 ? variants.length + 1 : index + 1;
        })()}</Txt> : null}
        <Txt style={s.muted}>{sheetFlat ? 'CATEGORY' : 'Category'}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{data.categories.filter((item) => item.is_active).map((item) => <Chip key={item.id} selected={category === item.id} onPress={() => setCategory(item.id)}>{item.name}</Chip>)}</Row>
        <Field label="Product name" placeholder="e.g. High tensile hex bolt" value={name} onChangeText={(value) => { setName(value); if (!productId) setSlug(slugFor(value)); }} />
        <Field label="Product slug" placeholder="e.g. high-tensile-hex-bolt" value={slug} onChangeText={setSlug} />
        <Field label="Description" placeholder="e.g. Zinc-plated hex bolt for general fastening." value={description} onChangeText={setDescription} multiline />
        <Txt style={s.muted}>Product type</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{(['steel','fastener','tractor_part','other'] as const).map((value) => <Chip key={value} selected={kind === value} onPress={() => setKind(value)}>{value.replace('_',' ')}</Chip>)}</Row>
        <Txt style={s.muted}>Purchase mode</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{(['rfq','direct','both'] as const).map((value) => <Chip key={value} selected={purchaseMode === value} onPress={() => setPurchaseMode(value)}>{value}</Chip>)}</Row>
        <Field label="Variant SKU" placeholder="e.g. HEX-M12-50" value={sku} onChangeText={setSku} />
        <Field label={sheetFlat ? 'SIZE THICKNESS' : 'Size / variant label'} placeholder={sheetFlat ? 'e.g. 2MM' : 'e.g. M12 x 50 mm'} value={size} onChangeText={setSize} />
        {sheetFlat ? <View style={{ gap: 12 }}>
          <Txt style={s.h2}>SHEET MS / FLAT MS RATE</Txt>
          <Field label="BASE RATE PMT" placeholder="e.g. 52900" numeric value={materialBase} onChangeText={setMaterialBase} />
          <Field label="VADHA" placeholder="e.g. 3300" numeric value={vadha} onChangeText={setVadha} />
          <Txt>TOTAL: {materialPrice?.total ?? '—'}</Txt>
          <Txt style={s.h2}>NET PRATE: {materialPrice?.net ?? '—'}</Txt>
          <Txt style={s.muted}>INR per metric tonne. Net Prate = Base Rate PMT + Vadha. GST is excluded and will be added during order confirmation.</Txt>
        </View> : null}
        <Txt style={s.muted}>Unit of measure</Txt>
        {sheetFlat ? <Badge>PMT (per metric tonne)</Badge> : <Row style={{ flexWrap: 'wrap' }}>{(['kg','MT','piece','box','bundle'] as const).map((value) => <Chip key={value} selected={uom === value} onPress={() => setUom(value)}>{value}</Chip>)}</Row>}
        <Field label="Minimum order quantity" placeholder="e.g. 100" numeric value={moq} onChangeText={setMoq} />
        {kind === 'tractor_part' ? (
          <View style={{ gap: 12 }}>
            <Txt style={s.muted}>Optional prices in INR per {uom}. Leave both blank for price on request.</Txt>
            <Field label="Base price (₹)" placeholder="e.g. 1000.00" numeric value={basePrice} onChangeText={setBasePrice} />
            <Field label="Price after discount (₹, optional)" placeholder="e.g. 800.00" numeric value={discountedPrice} onChangeText={setDiscountedPrice} />
          </View>
        ) : null}
        {!sheetFlat ? <Row style={{ flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 140 }}><Field label="Diameter (mm)" placeholder="e.g. 12" numeric value={diameter} onChangeText={setDiameter} /></View><View style={{ flex: 1, minWidth: 140 }}><Field label="Length (mm)" placeholder="e.g. 50" numeric value={length} onChangeText={setLength} /></View></Row> : null}
        <Row style={{ flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 140 }}><Field label="Grade" placeholder="e.g. 8.8" value={grade} onChangeText={setGrade} /></View><View style={{ flex: 1, minWidth: 140 }}><Field label="Brand" placeholder="e.g. Unbrako" value={brand} onChangeText={setBrand} /></View></Row>
        <Row style={{ flexWrap: 'wrap' }}><Button disabled={busy} onPress={() => void saveProduct()}>{productId ? 'Save product and variant' : 'Create product draft'}</Button>{productId ? <Button secondary onPress={resetProduct}>New product</Button> : null}</Row>
      </Card> : null}

      <View style={{ gap: 12 }}>
        <Txt style={s.h2}>Products ({data.products.length})</Txt>
        {data.products.length ? data.products.map((item) => (
          <Card key={item.id} style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><View><Txt style={{ fontWeight: '700' }}>{item.name}</Txt><Txt style={s.muted}>{item.category} · {item.slug}</Txt></View><Badge>{item.status.toUpperCase()}</Badge></Row>
            {item.variants.some(variant => variant.attributes.grade_list_price !== undefined)
              ? <Txt style={s.muted}>Edit grades and prices by selecting this category under Category publishing above.</Txt>
              : item.variants.map((variant) => <Row key={variant.id} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Txt style={s.muted}>{variant.sku} · {variant.size_label || 'No size'} · MOQ {variant.min_order_qty} {variant.uom}</Txt><Button secondary onPress={() => editVariant(item, variant)}>Edit variant</Button></Row>)}
            {!item.variants.length ? <><Txt style={s.muted}>Add a variant with its SKU, unit and minimum order before publishing.</Txt><Button secondary onPress={() => editVariant(item)}>Add first variant</Button></> : null}
            <ProductPublication product={item} categories={data.categories} disabled={busy} refresh={refreshCatalogue} />
            <Button secondary onPress={() => setPhotosFor(photosFor === item.id ? null : item.id)}>{photosFor === item.id ? 'Hide photos' : 'Manage photos'}</Button>
            {photosFor === item.id ? <ProductImages productId={item.id} /> : null}
            {chartsForProduct(item.slug).length ? <Button secondary onPress={() => setReferencesFor(referencesFor === item.id ? null : item.id)}>{referencesFor === item.id ? 'Hide reference charts' : 'View reference charts'}</Button> : null}
            {referencesFor === item.id ? <ProductReferenceCharts key={item.id} product={item} /> : null}
          </Card>
        )) : <Empty title="No catalogue records" description="Create categories and products above. Nothing is preloaded." />}
      </View>
      {note ? <Txt accessibilityRole="alert" style={{ color: c.red }}>{note}</Txt> : null}
    </View>
  );
}
