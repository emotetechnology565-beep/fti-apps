import { useWindowDimensions } from 'react-native';
import { DesktopHome } from '../components/DesktopHome';
import { ProcurementMobileHome } from '../components/ProcurementMobileHome';

export function Home() {
  const { width } = useWindowDimensions();
  return width >= 1000 ? <DesktopHome /> : <ProcurementMobileHome />;
}
