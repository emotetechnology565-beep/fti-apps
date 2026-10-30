import { strToU8, zipSync } from 'fflate';
import {
  orderKindLabel,
  orderStateLabel,
  type AdminOrdersResult,
  type OrderFilters,
} from './admin-orders';

type Cell = string | number | null;
const xml = (value: string) =>
  value
    // XML 1.0 does not permit these control characters in user-supplied text.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .slice(0, 32767)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
function column(index: number): string {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
function worksheet(rows: Cell[][]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="18" width="24" customWidth="1"/></cols><sheetData>${rows
    .map(
      (cells, r) =>
        `<row r="${r + 1}">${cells
          .map((value, c) => {
            const ref = `${column(c)}${r + 1}`;
            return typeof value === 'number' && Number.isFinite(value)
              ? `<c r="${ref}" t="n"><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? ''))}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join(
      '',
    )}</sheetData><autoFilter ref="A1:${column(rows[0].length - 1)}${rows.length}"/></worksheet>`;
}
const moneyCell = (value: string | null): Cell =>
  value === null
    ? null
    : Number.isFinite(Number(value)) &&
        Math.abs(Number(value) * 100) <= Number.MAX_SAFE_INTEGER
      ? Number(value)
      : value;

export function ordersWorkbook(
  result: AdminOrdersResult,
  filters: OrderFilters,
  generatedAt = new Date(),
): Uint8Array {
  const rows: Cell[][] = [
    [
      'Reference',
      'Type',
      'Status',
      'Placed (IST)',
      'Customer',
      'Phone',
      'Business',
      'Delivery location',
      'Material / SKU',
      'Quantity',
      'Size',
      'Grade',
      'Order value (INR)',
      'Amount due (INR)',
      'Carrier',
      'LR / tracking',
      'Closure reason',
      'Internal ID',
      'Payment received (INR)',
      'Remaining amount (INR)',
    ],
  ];
  for (const order of result.orders)
    rows.push([
      order.reference,
      orderKindLabel(order.kind),
      orderStateLabel(order.status),
      new Date(new Date(order.created_at).getTime() + 330 * 60000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19),
      order.buyer_name,
      order.phone,
      order.business,
      order.location,
      order.material,
      order.quantity,
      order.size,
      order.grade,
      moneyCell(order.total),
      moneyCell(order.amount_due),
      order.fulfillment?.carrier ?? '',
      order.fulfillment?.tracking_number ?? '',
      order.closure_note,
      order.id,
      moneyCell(order.payment_summary?.paid ?? null),
      moneyCell(order.payment_summary?.remaining ?? order.amount_due),
    ]);
  const { summary: s } = result;
  const overview: Cell[][] = [
    ['Orders overview', 'Value'],
    ['Generated at (UTC)', generatedAt.toISOString()],
    ['Date timezone', 'Asia/Kolkata'],
    ['Search', filters.search],
    ['Type', orderKindLabel(filters.kind)],
    ['Status', orderStateLabel(filters.status)],
    ['From (inclusive)', filters.from || 'All dates'],
    ['To (inclusive)', filters.to || 'All dates'],
    ['Matching orders', s.total],
    ['Active', s.active],
    ['Awaiting confirmation / payment', s.awaiting],
    ['Processing', s.processing],
    ['Dispatched / part dispatched', s.shipped],
    ['Delivered', s.delivered],
    ['Cancelled', s.cancelled],
    ['Rejected', s.rejected],
    ['Confirmed order value (INR)', moneyCell(s.confirmed_value)],
    [
      'Value note',
      'Order values are not revenue or verified payment receipts.',
    ],
  ];
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Orders" sheetId="1" r:id="rId1"/><sheet name="Overview" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(worksheet(rows)),
    'xl/worksheets/sheet2.xml': strToU8(worksheet(overview)),
  };
  return zipSync(files, { level: 1 });
}
