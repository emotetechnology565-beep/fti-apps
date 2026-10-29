from pathlib import Path
p=Path('src/features/cart/screens/CartScreen.tsx')
s=p.read_text(encoding='utf-8'); a=s.index('function Lot('); b=s.index('export function Cart()',a)
s=s[:a]+s[b:]; s=s[:s.index('function LegacyBasketView()')]
s=s.replace('Pressable, StyleSheet, View, useWindowDimensions','Pressable, View, useWindowDimensions').replace('Button, Card, Empty, Icon, Txt','Button, Txt').replace("import type { CartLine } from '../model/types';\n",'')
p.write_text(s,encoding='utf-8')
p=Path('src/core/layout/Shell.tsx'); s=p.read_text(encoding='utf-8')
s=s.replace('  const path = usePathname();', "  const path = usePathname();\n  const mobileCommercePage = !desktop && (path === '/' || path === '/products' || path === '/cart' || path.startsWith('/product/'));\n  const mobileDetailPage = !desktop && (path === '/cart' || path.startsWith('/product/'));")
s=s.replace("{path === '/' && !desktop ? <HomeHeader", "{mobileCommercePage ? (path === '/' ? <HomeHeader")
marker='onMenu={() => { menuProgress.setValue(0); setMenu(true); }} /> : <View'
s=s.replace(marker, 'onMenu={() => { menuProgress.setValue(0); setMenu(true); }} /> : null) : <View')
s=s.replace("padding: path === '/' && phone ? 0 : phone ? 18 : 32,", "padding: mobileCommercePage ? 0 : phone ? 18 : 32,")
s=s.replace('paddingBottom: phone ? 100 : 32,','paddingBottom: mobileCommercePage ? 16 : phone ? 100 : 32,')
s=s.replace("{path !== '/' && (!desktop || path !== '/products') ? <View", "{!mobileCommercePage && path !== '/' && (!desktop || path !== '/products') ? <View")
s=s.replace("{(!desktop || (path !== '/' && path !== '/products')) ? (", "{!mobileCommercePage && (!desktop || (path !== '/' && path !== '/products')) ? (")
s=s.replace('{!desktop ? (\n            <View','{!desktop && !mobileDetailPage ? (\n            <View')
a=s.index("                { label: 'Home', path: '/', icon: 'grid' }")
b=s.index('              ].map((n)',a)
s=s[:a]+"""                { label: 'Home', path: '/', icon: 'home' },
                { label: 'Catalogue', path: '/products', icon: 'search' },
                { label: 'Quotes', path: '/rfqs', icon: 'file-text' },
                { label: 'Orders', path: '/orders', icon: 'package' },
                { label: 'Account', path: '/account', icon: 'user' },
"""+s[b:]
p.write_text(s,encoding='utf-8')
