import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function downloadDrawing(svg: string, filename: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Image saving and sharing are unavailable on this device.');
  const source = await Image.loadAsync(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
  try {
    const key = `fti-drawing-${filename}`;
    await Image.writeToCacheAsync(source, key);
    const path = await Image.getCachePathAsync(key);
    if (!path) throw new Error('Drawing image could not be prepared.');
    const cached = new File(path.startsWith('file:') ? path : `file://${path}`);
    const bytes = new Uint8Array(await cached.arrayBuffer());
    const png =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg)
      throw new Error(
        'Drawing could not be converted to a downloadable image.',
      );
    const file = new File(Paths.cache, filename + (png ? '.png' : '.jpg'));
    await file.write(bytes);
    await Sharing.shareAsync(file.uri, {
      mimeType: png ? 'image/png' : 'image/jpeg',
      UTI: png ? 'public.png' : 'public.jpeg',
      dialogTitle: 'Save or share drawing',
    });
  } finally {
    source.release();
  }
}
