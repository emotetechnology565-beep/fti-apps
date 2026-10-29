from pathlib import Path
p=Path('src/features/catalog/components/DesktopCatalogue.tsx')
s=p.read_text(encoding='utf-8')
s=s.replace('  View,\n', '  View,\n  useWindowDimensions,\n',1)
s=s.replace("import { companyCertificate }", "import { mobileCommerce as m } from '@shared/ui/MobileCommerce';\nimport { companyCertificate }",1)
s=s.replace("export function DesktopProductCard({ product: p, detail = false }: { product: Product; detail?: boolean }) {", "export function DesktopProductCard({ product: p, detail = false }: { product: Product; detail?: boolean }) {\n  const { width } = useWindowDimensions();\n  const mobile = width < 1000;")
start=s.index('    <Modal visible={picker !== null}',s.index('export function DesktopProductCard'))
end=s.index('    </Modal>',start)+len('    </Modal>')
modal=s[start:end]
s=s[:start]+'    {pickerModal}'+s[end:]
insert=s.index('  return <View style={[styles.card',s.index('export function DesktopProductCard'))
mobile='''  const pickerModal = (
'''+modal+'''
  );
  const quantityControl = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity for ${p.name}`} onPress={() => setQuantity(Math.max(minimum, quantity - 1))} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F8FC', borderWidth: 1, borderColor: '#DFE7F0', borderRadius: 5 }}><Icon name="minus" size={16} color="#123657" /></Pressable>
    <TextInput accessibilityLabel={`Order quantity for ${p.name}`} keyboardType="decimal-pad" value={String(quantity)} onChangeText={(value) => { const next = Number(value); if (Number.isFinite(next) && next >= 0) setQuantity(next); }} onEndEditing={() => setQuantity(Math.max(minimum, quantity))} style={[m.input, { width: 72, minHeight: 40, paddingHorizontal: 5, textAlign: 'center', fontWeight: '700' }]} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity for ${p.name}`} onPress={() => setQuantity(Math.max(minimum, quantity + 1))} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F8FC', borderWidth: 1, borderColor: '#DFE7F0', borderRadius: 5 }}><Icon name="plus" size={16} color="#123657" /></Pressable>
  </View>;
  const mobileChoice = (label: string, value: string, target: 'size' | 'grade' | 'buyerGrade') => <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Txt style={{ color: '#123657', fontSize: 11 }}>{label}</Txt><Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()} for ${p.name}`} onPress={() => { setCustomText(''); setPicker(target); }} style={[m.input, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, minHeight: 40 }]}><Txt style={{ flex: 1, color: '#123657', fontSize: 11 }} numberOfLines={1}>{value || `Select ${label.toLowerCase()}`}</Txt><Icon name="chevron-down" size={12} color="#65788F" /></Pressable></View>;
  if (mobile) return <View style={detail ? { backgroundColor: '#FFFFFF' } : m.card}>
    {detail ? image ? <Image source={image} contentFit="cover" style={{ width: '100%', height: 240 }} /> : <View style={{ height: 200, backgroundColor: '#E8EDF3', alignItems: 'center', justifyContent: 'center' }}><Icon name="image" color="#65788F" /></View> : null}
    <View style={detail ? { padding: 14, gap: 14 } : { gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {!detail ? <Pressable accessibilityRole="link" accessibilityLabel={`View ${p.name}`} onPress={() => router.push(`/product/${p.id}`)}>{image ? <Image source={image} contentFit="cover" style={{ width: 100, height: 112, borderRadius: 5 }} /> : <View style={{ width: 100, height: 112, backgroundColor: '#EDF2F7' }} />}</Pressable> : null}
        <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
          <Pressable accessibilityRole="link" onPress={() => { if (!detail) router.push(`/product/${p.id}`); }}><Txt style={[m.heading, detail && { fontSize: 24 }]}>{p.name}</Txt></Pressable>
          {p.description ? <Txt numberOfLines={detail ? undefined : 2} style={[m.muted, { fontSize: 11 }]}>{p.description}</Txt> : null}
          {!detail ? <View style={m.row}>{mobileChoice('Size', size, 'size')}{mobileChoice(tmt ? 'Brand' : 'Grade', grade, 'grade')}</View> : null}
        </View>
      </View>
      {detail ? <View style={m.row}>{mobileChoice('Size', size, 'size')}{mobileChoice(tmt ? 'Brand' : 'Grade', grade, 'grade')}{tmt ? mobileChoice('Grade', buyerGrade, 'buyerGrade') : null}</View> : null}
      <View style={[m.row, { justifyContent: 'space-between' }]}>
        <View style={{ gap: 5 }}><Txt style={{ color: '#123657', fontSize: 11 }}>MOQ</Txt><Txt style={{ color: '#123657', fontWeight: '700', fontSize: 13 }}>{minimum} {unit}</Txt><Txt style={{ color: '#65788F', fontSize: 10 }}>Minimum order</Txt></View>
        <View style={{ gap: 5 }}><Txt style={{ color: '#123657', fontSize: 11 }}>Quantity ({unit})</Txt>{quantityControl}</View>
      </View>
      <View style={[m.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        {priceAccess ? <Txt style={{ color: '#ED222B', fontSize: 16, fontWeight: '800' }}>{price ? `₹${price.amount} / ${price.unit}` : 'Rate on request'}</Txt> : <Pressable onPress={() => router.push('/account?section=subscription')}><Txt style={{ color: '#ED222B', fontSize: 12, fontWeight: '700' }}>Subscribe for prices</Txt></Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={`Add ${p.name} to quote`} onPress={() => void addToQuote()} style={[m.action, detail && { width: '100%' }]}><Icon name="shopping-cart" color="#FFFFFF" size={19} /><Txt style={m.actionText}>{busy ? 'Adding...' : 'Add to quote'}</Txt></Pressable>
      </View>
      {message ? <View style={{ gap: 6 }}><Txt accessibilityLiveRegion="polite" style={m.muted}>{message}</Txt>{message === 'Added to quote' ? <Pressable onPress={() => router.push('/cart')}><Txt style={{ color: '#1260B6', fontWeight: '700' }}>Review requirement basket →</Txt></Pressable> : null}</View> : null}
    </View>
    {pickerModal}
  </View>;
'''
s=s[:insert]+mobile+s[insert:]
p.write_text(s,encoding='utf-8')
