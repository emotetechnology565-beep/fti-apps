import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { marketRatesApi } from './api';
import {
  historyCsv,
  historyRangeError,
  type Location,
  type Rate,
} from './model';

export async function exportMarketHistory(
  location: Location,
  from: string,
  to: string,
  single?: Rate,
): Promise<number> {
  const error = historyRangeError(from, to);
  if (error) throw new Error(error);
  // A single database statement returns a consistent snapshot, including all pages.
  const rates = single
    ? [single]
    : await marketRatesApi.history(location.id, from, to, 0, 10001);
  if (!rates.length) throw new Error('No matching prices to export.');
  if (rates.length > 10000)
    throw new Error(
      'More than 10,000 updates match. Choose a shorter date range.',
    );
  const content = historyCsv(location, rates);
  const filename = `FTI-market-history-${Date.now()}.csv`;
  const mimeType = 'text/csv';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    if (!(await Sharing.isAvailableAsync()))
      throw new Error('File sharing is unavailable on this device.');
    const file = new File(Paths.cache, filename);
    try {
      file.write(content);
      await Sharing.shareAsync(file.uri, {
        mimeType,
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Export market price history',
      });
    } finally {
      if (file.exists) file.delete();
    }
  }
  return rates.length;
}
