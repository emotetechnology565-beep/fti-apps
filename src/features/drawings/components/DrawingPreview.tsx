import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Card, Txt, s } from '@shared/ui';
import { drawingSvg } from '../model/render';
import type { DrawingDefinition, DrawingInput } from '../model/types';

export function DrawingPreview({
  definition,
  input,
}: {
  definition: DrawingDefinition;
  input: DrawingInput;
}) {
  const [failed, setFailed] = useState(false);
  const result = useMemo(() => {
    try {
      return { svg: drawingSvg(definition, input), error: '' };
    } catch (error) {
      return { svg: '', error: (error as Error).message };
    }
  }, [definition, input]);
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Drawing preview</Txt>
      {result.error ? (
        <Txt accessibilityRole="alert">{result.error}</Txt>
      ) : (
        <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ width: 720, height: 448 }}>
            <Image
              key={result.svg}
              source={{
                uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`,
              }}
              contentFit="contain"
              style={{ width: '100%', height: '100%' }}
              onError={() => setFailed(true)}
              onLoad={() => setFailed(false)}
              accessibilityLabel={`${definition.standard}:${definition.edition}, ${definition.size}. Length ${input.length} mm. Schematic drawing.`}
            />
          </View>
        </ScrollView>
      )}
      {failed ? (
        <Txt accessibilityRole="alert">
          Drawing image could not be displayed. Dimension values remain
          available below.
        </Txt>
      ) : null}
      <Txt style={s.muted}>
        Swipe to inspect. Dimensions in mm. Nuts and threads are illustrative;
        this is a selection preview.
      </Txt>
    </Card>
  );
}
