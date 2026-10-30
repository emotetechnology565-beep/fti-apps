import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchAdminOrders } from './admin-orders-api';
import { indiaDate, type OrderFilters } from '../model/admin-orders';

export async function exportOrders(filters: OrderFilters): Promise<number> {
  const result = await fetchAdminOrders(filters, 0, 10000);
  if (result.summary.total > 10000)
    throw new Error(
      'More than 10,000 orders match. Narrow the date range or filters before exporting.',
    );
  if (!result.orders.length) throw new Error('No matching orders to export.');
  if (result.orders.length !== result.summary.total)
    throw new Error('The order export is incomplete. Please retry.');
  const { ordersWorkbook } = await import('../model/orders-workbook');
  const bytes = ordersWorkbook(result, filters);
  const filename = `FTI-orders-${indiaDate()}-${Date.now()}.xlsx`;
  const mimeType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
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
      file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType,
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
        dialogTitle: 'Export FTI orders',
      });
    } finally {
      if (file.exists) file.delete();
    }
  }
  return result.orders.length;
}
