import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Chip, Field, Row, Txt, c, s } from '@shared/ui';
import { catalogApi, type AdminCategory, type AdminProduct, type AdminVariant } from '../data/catalog-repository';

export function ProductPublication({ product, categories, disabled, refresh }: {
  product: AdminProduct;
  categories: AdminCategory[];
  disabled: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [setup, setSetup] = useState(false);
  const [sku, setSku] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState<AdminVariant['uom']>(product.product_kind === 'steel' ? 'kg' : 'piece');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const activeCategory = categories.some(category => category.id === product.category_id && category.is_active);
  const activeVariant = product.variants.some(variant => variant.is_active);

  async function changeStatus(status: AdminProduct['status']) {
    if (busy || disabled) return;
    setError(''); setSuccess('');
    if (status === 'published') {
      if (!activeCategory) {
        setError('Activate this product’s category before publishing.');
        return;
      }
      if (!activeVariant) { setSetup(true); return; }
    }
    setBusy(true);
    try {
      await catalogApi.setProductStatus(product.id, status);
      setSuccess(status === 'published' ? `${product.name} is now published and visible in the catalogue.` : `${product.name} ${status === 'archived' ? 'archived' : 'saved as a draft'}.`);
      setSetup(false);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveAndPublish() {
    if (busy || disabled) return;
    setError(''); setSuccess('');
    if (!activeCategory) { setError('Activate this product’s category before publishing.'); return; }
    const minimum = Number(quantity);
    if (!sku.trim() || !/^\d+(\.\d{1,3})?$/.test(quantity.trim()) || !Number.isFinite(minimum) || minimum <= 0) {
      setError('Enter a SKU and a minimum order quantity greater than zero (up to 3 decimal places).');
      return;
    }
    setBusy(true);
    let variantSaved = false;
    try {
      // Only add the missing variant; preserve the existing product and other variants.
      await catalogApi.saveProduct({
        id: product.id, category_id: product.category_id, name: product.name, slug: product.slug,
        description: product.description, product_kind: product.product_kind, purchase_mode: product.purchase_mode,
      }, [{ sku: sku.trim(), size_label: size.trim() || null, uom: unit, min_order_qty: minimum, attributes: {}, is_active: true }]);
      variantSaved = true;
      // Refresh even if publication is rejected, so a retry does not create the variant twice.
      await refresh();
      await catalogApi.setProductStatus(product.id, 'published');
      setSetup(false);
      setSuccess(`${product.name} is now published and visible in the catalogue.`);
      await refresh();
    } catch (e) {
      setError(`${variantSaved ? 'Variant saved. Publishing failed: ' : ''}${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return <View testID={`product-publication-${product.id}`} style={{ gap: 12 }}>
    <Row style={{ flexWrap: 'wrap' }}>
      {product.status === 'published'
        ? <Button secondary disabled={disabled || busy} onPress={() => void changeStatus('draft')}>Unpublish</Button>
        : <Button disabled={disabled || busy} onPress={() => void changeStatus('published')}>{busy ? 'Saving...' : 'Publish'}</Button>}
      {product.status !== 'archived'
        ? <Button secondary disabled={disabled || busy} onPress={() => void changeStatus('archived')}>Archive</Button>
        : <Button secondary disabled={disabled || busy} onPress={() => void changeStatus('draft')}>Restore as draft</Button>}
    </Row>
    {setup && !activeVariant ? <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line }}>
      <Badge>COMPLETE PRODUCT SETUP</Badge>
      <Txt>A product needs at least one active variant to appear in the catalogue. Enter its SKU, unit and minimum order below.</Txt>
      <Field label={`SKU for ${product.name}`} value={sku} onChangeText={setSku} />
      <Field label={`Size / variant for ${product.name} (optional)`} value={size} onChangeText={setSize} />
      <Txt style={s.muted}>Variant unit</Txt>
      <Row style={{ flexWrap: 'wrap' }}>{(['piece','kg','MT','box','bundle'] as const).map(value =>
        <Chip key={value} selected={unit === value} onPress={() => setUnit(value)}>{value}</Chip>)}</Row>
      <Field label={`Minimum order for ${product.name}`} numeric value={quantity} onChangeText={setQuantity} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Button disabled={disabled || busy} onPress={() => void saveAndPublish()}>{busy ? 'Saving...' : 'Save variant and publish'}</Button>
        <Button secondary disabled={busy} onPress={() => { setSetup(false); setError(''); }}>Cancel setup</Button>
      </Row>
    </View> : null}
    {error ? <Txt accessibilityRole="alert" style={{ color: c.red }}>{error}</Txt> : null}
    {success ? <Txt accessibilityRole="alert" style={{ color: c.green }}>{success}</Txt> : null}
  </View>;
}
