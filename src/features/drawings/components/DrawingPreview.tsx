import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Button, Card, Txt, s } from '@shared/ui';
import { drawingSvg } from '../model/render';
import { downloadDrawing } from '../services/download-drawing';
import {
  isNutShape,
  type DrawingDefinition,
  type DrawingInput,
} from '../model/types';

export function DrawingPreview({
  definition,
  input,
}: {
  definition: DrawingDefinition;
  input: DrawingInput;
}) {
  const [failed, setFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const result = useMemo(() => {
    try {
      return { svg: drawingSvg(definition, input), error: '' };
    } catch (error) {
      return { svg: '', error: (error as Error).message };
    }
  }, [definition, input]);
  async function download() {
    if (downloading || !result.svg) return;
    setDownloading(true);
    setDownloadError('');
    const filename =
      `FTI-${definition.standard}-${definition.edition}-${definition.shape}-${definition.size}-L${input.length}`
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 120);
    try {
      await downloadDrawing(result.svg, filename);
    } catch (error) {
      setDownloadError((error as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  const drawing = (
    <Image
      key={result.svg}
      source={{
        uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`,
      }}
      contentFit="contain"
      style={{ width: '100%', height: '100%' }}
      onError={() => setFailed(true)}
      onLoad={() => setFailed(false)}
      accessibilityLabel={`${definition.standard}:${definition.edition}, ${definition.size}. ${isNutShape(definition.shape) ? 'Thickness' : 'Length'} ${input.length} mm. Schematic drawing.`}
    />
  );
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Drawing preview</Txt>
      {result.error ? (
        <Txt accessibilityRole="alert">{result.error}</Txt>
      ) : (
        <>
          {enlarged ? (
            <ScrollView horizontal>
              <View style={{ width: 720, height: 448 }}>{drawing}</View>
            </ScrollView>
          ) : (
            <View
              style={{
                width: '100%',
                maxWidth: 720,
                aspectRatio: 720 / 448,
                alignSelf: 'center',
              }}
            >
              {drawing}
            </View>
          )}
          <Button secondary onPress={() => setEnlarged(!enlarged)}>
            {enlarged ? 'Fit drawing to screen' : 'Enlarge drawing'}
          </Button>
          <Button
            icon="download"
            disabled={downloading}
            onPress={() => void download()}
          >
            {downloading ? 'Preparing image...' : 'Download drawing'}
          </Button>
          {downloadError ? (
            <Txt accessibilityRole="alert">{downloadError}</Txt>
          ) : null}
        </>
      )}
      {failed ? (
        <Txt accessibilityRole="alert">
          Drawing image could not be displayed. Dimension values remain
          available below.
        </Txt>
      ) : null}
      <Txt style={s.muted}>
        {enlarged
          ? 'Swipe across the enlarged drawing to inspect dimensions. '
          : 'The complete drawing fits the screen. Enlarge to read dimensions. '}
        Dimensions in mm. Nuts and threads are illustrative; this is a selection
        preview.
      </Txt>
    </Card>
  );
}
