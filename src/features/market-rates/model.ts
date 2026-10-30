export const categories = ['Ingot', 'Scrap', 'Billet', 'Old Scrap'] as const;
export type Category = (typeof categories)[number];
export type Location = {
  id: string;
  category: Category;
  state: string;
  district: string;
};
export type Rate = {
  id: string;
  location_id: string;
  base_price: string;
  increase_amount: string;
  sale_price: string;
  published_at: string;
  published_by: string;
};
export type MarketSettings = {
  revision: number;
  notes: string;
  support: string;
  sms: string;
  whatsapp: string;
};
export type MarketAdmin = { locations: Location[]; settings: MarketSettings };
export function priceTotal(base: string, increase: string): string | null {
  if (
    !/^\d{1,9}(\.\d{1,2})?$/.test(base) ||
    !/^-?\d{1,9}(\.\d{1,2})?$/.test(increase)
  )
    return null;
  const paise = (v: string) => {
    const [whole, decimals = ''] = v.replace('-', '').split('.');
    return (
      (Number(whole) * 100 + Number(decimals.padEnd(2, '0'))) *
      (v.startsWith('-') ? -1 : 1)
    );
  };
  const b = paise(base),
    total = b + paise(increase);
  return b > 0 && total > 0 ? (total / 100).toFixed(2) : null;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function historyRangeError(from: string, to: string): string | null {
  if ((from && !validDate(from)) || (to && !validDate(to)))
    return 'Enter valid dates as YYYY-MM-DD.';
  if (from && to && from > to)
    return 'The start date must be on or before the end date.';
  return null;
}
export function historyPreset(days: number, now = new Date()) {
  const indiaNow = new Date(now.getTime() + 330 * 60 * 1000);
  const to = indiaNow.toISOString().slice(0, 10);
  indiaNow.setUTCDate(indiaNow.getUTCDate() - days + 1);
  return { from: indiaNow.toISOString().slice(0, 10), to };
}
export function historyCsv(location: Location, rates: Rate[]): string {
  const cell = (value: string | number) => {
    const text =
      typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)
        ? `'${value}`
        : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows: (string | number)[][] = [
    [
      'Category',
      'State',
      'District',
      'Published (IST)',
      'Base price (INR/tonne)',
      'Increase (INR/tonne)',
      'Sale price (INR/tonne)',
      'Record ID',
      'Published by (staff ID)',
      'Published (UTC)',
    ],
  ];
  for (const rate of rates)
    rows.push([
      location.category,
      location.state,
      location.district,
      new Date(Date.parse(rate.published_at) + 330 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' '),
      Number(rate.base_price),
      Number(rate.increase_amount),
      Number(rate.sale_price),
      rate.id,
      rate.published_by,
      rate.published_at,
    ]);
  return (
    '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
  );
}
export const rateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
