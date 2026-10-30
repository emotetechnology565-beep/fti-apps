import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export async function downloadPreviewDocument(title: string, content: string) {
  const file = await Print.printToFileAsync({ html: `<html><body><p>FTI CLIENT PREVIEW — SAMPLE, NOT A VALID COMMERCIAL DOCUMENT</p><h1>${escape(title)}</h1><pre>${escape(content)}</pre></body></html>` });
  if (!await Sharing.isAvailableAsync()) throw new Error('Document sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `Sample ${title}` });
}
