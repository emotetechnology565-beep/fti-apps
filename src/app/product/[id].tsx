import { withShell } from '@core/layout/withShell';
import { ProductDetail } from '@features/catalog/screens/ProductDetailScreen';
import { useLocalSearchParams } from 'expo-router';
function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductDetail id={id} />;
}
export default withShell(ProductPage);
