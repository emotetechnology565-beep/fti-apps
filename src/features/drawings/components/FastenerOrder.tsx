import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useStore } from '@core/state/workspace-store';
import { Button, Txt } from '@shared/ui';
import { drawingSvg } from '../model/render';
import { weightQuantity } from '../model/weight';
import { subcategoryLabel, drawingSubcategory } from '../model/subcategories';
import type { DrawingDefinition, DrawingInput } from '../model/types';

export function FastenerOrder({
  definition,
  input,
  grade,
  quantity,
  withNut,
}: {
  definition: DrawingDefinition;
  input: DrawingInput;
  grade: string;
  quantity: string;
  withNut: boolean;
}) {
  const [message, setMessage] = useState('');
  function addToCart() {
    try {
      drawingSvg(definition, input);
    } catch {
      setMessage('Complete valid drawing dimensions before adding to cart.');
      return;
    }
    const count = weightQuantity(quantity);
    if (!count || !grade) {
      setMessage('Choose a grade and a positive whole number of pieces.');
      return;
    }
    const fastenerRequest = {
      definition: definition.id,
      revision: definition.published_revision ?? definition.revision,
      input,
      grade,
      withNut,
    };
    const key = JSON.stringify(fastenerRequest);
    useStore.getState().addMaterial(definition.id, count, {
      key,
      name: subcategoryLabel(drawingSubcategory(definition)),
      size: `${definition.standard}:${definition.edition} / ${definition.size} / L ${input.length} mm${withNut ? ' / With nut' : ''}`,
      grade,
      unit: 'piece',
      minimum: 1,
      fastenerRequest,
    });
    setMessage('Added to cart. Choose another size or proceed from your cart.');
  }
  return (
    <View style={{ gap: 12 }}>
      <Txt>
        {definition.standard}:{definition.edition} / {definition.size} /{' '}
        {grade || 'Choose grade above'} / {quantity} pieces
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          icon="shopping-cart"
          disabled={!grade || !weightQuantity(quantity)}
          onPress={addToCart}
          style={{
            flex: 1,
            minHeight: 48,
            backgroundColor:
              grade && weightQuantity(quantity) ? '#d32f2f' : '#d7e3f9',
            borderWidth: 0,
            borderRadius: 4,
          }}
        >
          Add to Cart
        </Button>
        <Button
          secondary
          onPress={() => router.push('/cart')}
          style={{
            minHeight: 48,
            backgroundColor: '#e6eeff',
            borderWidth: 0,
            borderRadius: 4,
          }}
        >
          View cart
        </Button>
      </View>
      {message ? <Txt accessibilityLiveRegion="polite">{message}</Txt> : null}
    </View>
  );
}
