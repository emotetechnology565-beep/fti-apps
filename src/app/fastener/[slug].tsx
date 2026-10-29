import { withShell } from '@core/layout/withShell';
import { FastenerDetail } from '@features/drawings/ui';
import { useLocalSearchParams } from 'expo-router';

function FastenerPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <FastenerDetail key={slug} subcategory={slug} />;
}

export default withShell(FastenerPage);
