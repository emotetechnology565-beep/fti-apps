import { canViewPublicPrices, priceSubscriptionMessage } from '@shared/lib/price-access';
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Product } from '@features/catalog';
import { money } from '@shared/lib/money';
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export async function exportRates(
  market: string,
  products: readonly Product[],
) {
  if (!canViewPublicPrices()) throw new Error(priceSubscriptionMessage);
  if (!products.length || products.some((product) => product.rate === undefined))
    throw new Error('No published rates to export.');
  const rows = products
    .map(
      (p) =>
        '<tr><td>' +
        escapeHtml(p.name) +
        '</td><td>' +
        escapeHtml(p.grade) +
        '</td><td>' +
        escapeHtml(money(p.rate ?? 0)) +
        ' / ' +
        escapeHtml(p.unit) +
        '</td></tr>',
    )
    .join('');
  const html =
    '<html><head><meta charset="utf-8"><title>FTI rate sheet</title></head><body><h1>FTI material rates</h1><p>' +
    escapeHtml(market) +
    '</p><table><tr><th>Material</th><th>Grade</th><th>Rate</th></tr>' +
    rows +
    '</table><p>Tax and freight subject to confirmation. This is not a tax invoice.</p></body></html>';
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}
