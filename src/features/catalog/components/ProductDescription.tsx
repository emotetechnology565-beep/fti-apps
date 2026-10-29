import { View } from 'react-native';
import { Txt, s } from '@shared/ui';
import type { Product } from '../model/types';
import { rawMaterialDetails } from '../model/raw-material-details';

export function ProductDescription({ product, applications = false }: { product: Product; applications?: boolean }) {
  const profile = rawMaterialDetails(product);
  if (applications) return <Txt style={s.muted}>{profile?.applications ?? 'Confirm suitability, grade and specification requirements with FTI for your intended application.'}</Txt>;
  return <View style={{ gap: 12 }}>
    {profile?.description ? <Txt style={{ lineHeight: 22 }}>{profile.description}</Txt> : null}
    {product.description?.trim() && product.description.trim() !== profile?.description ? <Txt style={s.muted}>{product.description}</Txt> : null}
    {!profile?.description && !product.description?.trim() ? <Txt style={s.muted}>Contact FTI for product details and current specifications.</Txt> : null}
  </View>;
}
