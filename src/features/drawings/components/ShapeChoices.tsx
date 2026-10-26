import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Txt, c } from '@shared/ui';
import { drawingSvg } from '../model/render';
import {
  shapeLabels,
  type DrawingDefinition,
  type DrawingShape,
} from '../model/types';

export function ShapeChoices({
  rows,
  selected,
  onChange,
}: {
  rows: DrawingDefinition[];
  selected: string;
  onChange: (shape: DrawingShape) => void;
}) {
  const definitions = rows.filter(
    (row, index) =>
      rows.findIndex((item) => item.shape === row.shape) === index,
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
      }}
    >
      {definitions.map((row) => {
        let svg = '';
        try {
          svg = drawingSvg(row, {
            length: row.dimensions.lengths[0] ?? 120,
            width: row.dimensions.widths[0],
            radius: 25,
            returnHeight: 60,
            angle: 25,
          });
        } catch {
          /* A malformed definition still retains its label and dimension editor. */
        }
        return (
          <Pressable
            key={row.shape}
            accessibilityRole="radio"
            accessibilityLabel={`Drawing: ${shapeLabels[row.shape]}`}
            accessibilityState={{ checked: selected === row.shape }}
            onPress={() => onChange(row.shape)}
            style={{
              width: 145,
              padding: 9,
              borderWidth: selected === row.shape ? 2 : 1,
              borderColor: selected === row.shape ? c.red : c.line,
              borderRadius: 6,
            }}
          >
            {svg ? (
              <Image
                source={{
                  uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
                }}
                style={{ width: '100%', height: 100 }}
                contentFit="contain"
                accessibilityLabel={`${shapeLabels[row.shape]} example shape`}
              />
            ) : null}
            <Txt style={{ fontSize: 12 }}>{shapeLabels[row.shape]}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
