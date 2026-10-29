from pathlib import Path
Path('src/features/catalog/screens/CatalogueScreen.tsx').write_text('''import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { DesktopCatalogue } from '../components/DesktopCatalogue';
import { MobileCatalogue } from './MobileCatalogue';
import { isFastenerCategory } from '../model/category-navigation';

export function Catalogue() {
  const params = useLocalSearchParams<{ search?: string; category?: string; kind?: string }>();
  const { width } = useWindowDimensions();
  const category = typeof params.category === 'string' ? params.category : '';
  const kind = isFastenerCategory(category) || params.kind === 'fastener' ? 'fastener' : params.kind === 'tractor_part' ? 'tractor_part' : 'steel';
  const props = {
    initialKind: kind as 'steel' | 'fastener' | 'tractor_part',
    initialCategory: isFastenerCategory(category) ? '' : category,
    initialSearch: typeof params.search === 'string' ? params.search : '',
  };
  return width < 1000
    ? <MobileCatalogue key={JSON.stringify(props)} {...props} />
    : <DesktopCatalogue key={JSON.stringify(props)} {...props} products={[]} total={0} />;
}
''',encoding='utf-8')
