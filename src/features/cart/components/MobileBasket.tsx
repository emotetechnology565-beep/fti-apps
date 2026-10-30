import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Product } from '@features/catalog';
import { getCategoryImage } from '@features/catalog/ui';
import { useStore } from '@core/state/workspace-store';
import { Icon, Txt } from '@shared/ui';
import { mobileCommerce as m } from '@shared/ui/MobileCommerce';
import { MaterialPhoto } from '@features/catalog/components/MaterialPhoto';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import type { CartLine } from '../model/types';
import { FastenerRequirementSummary } from './FastenerRequirementSummary';

type LinePrice = { amount: number; unit: string; total: number; tax: string } | null;
export function MobileBasket({ cart, products, prices, tonnes, subtotal, priceAccess, blocked, loading }: { cart: CartLine[]; products: Product[]; prices: LinePrice[]; tonnes: number; subtotal: number; priceAccess: boolean; blocked: boolean; loading: boolean }) {
  const updateQuantity = useStore((state) => state.quantity);
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const request = () => {
    if (pincode && !/^[1-9]\d{5}$/.test(pincode)) { setError('Enter a valid 6-digit delivery pincode.'); return; }
    router.push({ pathname: '/checkout', params: { pincode, notes } });
  };
  return <View style={[m.page, { backgroundColor: '#FFFFFF' }]}>
    <Txt accessibilityRole="header" style={[m.title, { paddingHorizontal: 12, paddingTop: 12, color: '#0B2447', fontSize: 26 }]}>Your Cart</Txt>
    <View style={m.body}>
      {!cart.length ? <View style={m.card}><Txt style={m.heading}>Your basket is empty</Txt><Txt style={m.muted}>Choose a material size and grade to start your requirement.</Txt><Pressable onPress={() => router.push('/products')} style={m.action}><Txt style={m.actionText}>Browse materials</Txt></Pressable></View> : cart.map((line, index) => {
        const material = line.material;
        const product = products.find((entry) => entry.id === line.productId);
        const variant = product?.variants.find((entry) => entry.id === line.variantId);
        const name = material?.name ?? product?.name ?? 'Loading material...';
        const image = material?.imageUrl ? { uri: material.imageUrl } : product?.images[0]?.url ? { uri: product.images[0].url } : product ? getCategoryImage(product.category) : undefined;
        const minimum = material?.minimum ?? variant?.min_order_qty ?? 1;
        const unit = material?.unit ?? variant?.uom ?? '';
        const quantityButton = (increase: boolean) => <Pressable accessibilityRole="button" accessibilityLabel={`${increase ? 'Increase' : 'Decrease'} quantity for ${name}`} onPress={() => updateQuantity(line.productId, Math.max(minimum, line.quantity + (increase ? 1 : -1)), line.variantId)} style={[m.input, { minHeight: 40, width: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 }]}><Icon name={increase ? 'plus' : 'minus'} color="#123657" size={17} /></Pressable>;
        const raw = !!material && !material.fastenerRequest && !material.fastenerRequirement;
        return <View key={`${line.productId}-${line.variantId ?? material?.key}`} style={[m.card, { padding: 0, borderWidth: 0, gap: 9 }]}>
          {raw ? <>
            <MaterialPhoto category={product?.category ?? 'round-bright-bar'} height={164} />
            <Txt style={[m.heading, { color: '#0B2447', fontSize: 17 }]}>{name}{material?.grade ? ` ? ${material.grade}` : ''}</Txt>
            <View style={{ flexDirection: 'row', gap: 12 }}><Txt style={[m.muted, { flex: 1 }]}>Size: {material?.size}</Txt><Txt style={m.muted}>{material?.brand ? `Brand: ${material.brand}` : 'Confirm grade & condition'}</Txt></View>
          </> : <View style={{ flexDirection: 'row', gap: 12 }}>
            {image ? <Image source={image} contentFit={material?.fastenerRequirement ? 'contain' : 'cover'} style={{ width: 82, height: 82, borderRadius: 5 }} /> : null}
            <View style={{ flex: 1, gap: 6 }}><Txt style={m.heading}>{name}</Txt><Txt style={m.muted}>{material?.size ?? variant?.size_label ?? ''}</Txt></View>
          </View>}
          <View style={[m.row, { justifyContent: 'space-between' }]}>
            <Txt style={{ color: '#0B2447', fontSize: 12, fontWeight: '700' }}>Quantity ({unit})</Txt>
            <View style={[m.row, { gap: 0 }]}>{quantityButton(false)}<Txt style={[m.input, { minHeight: 40, paddingTop: 10, textAlign: 'center', minWidth: 72, paddingHorizontal: 5, fontWeight: '700', borderRadius: 0 }]}>{line.quantity}</Txt>{quantityButton(true)}</View>
          </View>
          {material?.fastenerRequirement ? <FastenerRequirementSummary material={material} editable /> : null}
          {priceAccess ? <View style={[m.row, { justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#E5EBF2' }]}><Txt style={m.muted}>Indicative material value</Txt><Txt style={{ color: '#ED222B', fontSize: 18, fontWeight: '800' }}>{prices[index] ? money(prices[index]!.total) : loading ? 'Loading price...' : 'Rate on request'}</Txt></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} onPress={() => updateQuantity(line.productId, 0, line.variantId)} style={{ alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center' }}><Txt style={{ color: '#ED222B', fontSize: 12 }}>Remove item</Txt></Pressable>
        </View>;
      })}
      {cart.length ? <View style={[m.card, { padding: 10, backgroundColor: '#F6F9FC', gap: 9 }]}>
        <View style={[m.row, { justifyContent: 'space-between' }]}><Txt style={m.heading}>Total quantity</Txt><Txt style={m.heading}>{tonnes.toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT</Txt></View>
        {cart.some((line) => line.material?.unit !== 'MT' && line.material?.unit !== 'kg') ? <Txt style={m.muted}>Piece and other unit quantities are shown on each item.</Txt> : null}
        {priceAccess ? <View style={[m.row, { justifyContent: 'space-between' }]}><Txt style={m.muted}>Material subtotal</Txt><Txt style={{ color: '#ED222B', fontWeight: '800' }}>{loading ? 'Loading...' : prices.some(Boolean) ? money(subtotal) : 'Quote required'}</Txt></View> : <SubscribeForPrices />}
        {priceAccess && prices.some((price) => !price) ? <Txt style={m.muted}>Items without published prices require a quote and are excluded from the subtotal.</Txt> : null}
        <View style={[m.row, { padding: 10, backgroundColor: '#EDF3FC', borderRadius: 5 }]}><Icon name="info" color="#1260B6" size={16} /><Txt style={[m.muted, { flex: 1, color: '#315C89', fontSize: 11 }]}>Final rates, GST, freight and the billing weight basis will be confirmed by FTI before bank transfer.</Txt></View>
        <Txt style={{ color: '#123657', fontSize: 12, fontWeight: '700' }}>Delivery pincode</Txt><TextInput accessibilityLabel="Delivery pincode" placeholder="Enter delivery pincode" keyboardType="number-pad" maxLength={6} value={pincode} onChangeText={(value) => { setPincode(value.replace(/\D/g, '')); setError(''); }} style={m.input} />
        <Txt style={{ color: '#123657', fontSize: 12, fontWeight: '700' }}>Additional notes (optional)</Txt><TextInput accessibilityLabel="Additional requirement notes" placeholder="e.g. project details, delivery timeline, special requirements..." multiline value={notes} onChangeText={setNotes} maxLength={1000} style={[m.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]} />
        {error ? <Txt accessibilityRole="alert" style={{ color: '#BD1723', fontSize: 12 }}>{error}</Txt> : null}
      </View> : null}
      {cart.length ? <Pressable accessibilityRole="button" accessibilityLabel="Request quotation" disabled={blocked} onPress={request} style={[m.action, blocked && { opacity: 0.5 }]}><Icon name="file-text" color="#FFFFFF" size={20} /><Txt style={m.actionText}>{priceAccess && prices.every(Boolean) ? 'Proceed to Review ?' : 'Request Quotation ?'}</Txt></Pressable> : null}
    </View>
  </View>;
}
