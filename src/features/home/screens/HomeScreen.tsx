import { useWindowDimensions } from 'react-native';
import { DesktopHome } from '../components/DesktopHome';
import { MobileHome } from '../components/MobileHome';

export function Home() {
  const { width } = useWindowDimensions();
  return width >= 1000 ? <DesktopHome /> : <MobileHome />;
}
