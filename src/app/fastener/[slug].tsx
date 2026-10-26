import { withShell } from '@core/layout/withShell';
import { FastenerDimensions } from '@features/drawings/ui';
import { useLocalSearchParams } from 'expo-router';

function FastenerPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <FastenerDimensions key={slug} subcategory={slug} />;
}

export default withShell(FastenerPage);
