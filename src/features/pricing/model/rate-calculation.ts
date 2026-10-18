export type PriceComponents = {
  base_price: string;
  increased_price: string;
  rolling_price: string;
  profit_percent: string;
};
export const emptyPriceComponents: PriceComponents = {
  base_price: '', increased_price: '0', rolling_price: '0', profit_percent: '0',
};
export function materialGrade(value: unknown): 'MS' | 'EN8' | null {
  if (typeof value !== 'string') return null;
  const grade = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return grade === 'MS' || grade === 'MILDSTEEL' ? 'MS' : grade === 'EN8' ? 'EN8' : null;
}
const limit = 100000000000000000000n;
function scaled(value: string) {
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(value)) return null;
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(decimal.padEnd(4, '0'));
}
function decimal(value: bigint) {
  return `${value / 10000n}.${String(value % 10000n).padStart(4, '0')}`;
}
export function calculateRate(parts: PriceComponents) {
  const base = scaled(parts.base_price.trim());
  const increase = scaled(parts.increased_price.trim() || '0');
  const rolling = scaled(parts.rolling_price.trim() || '0');
  const percent = scaled(parts.profit_percent.trim() || '0');
  if (base === null || base <= 0n || increase === null || rolling === null || percent === null) return null;
  const subtotal = base + increase + rolling;
  // Match Postgres round(..., 4), without binary floating-point money errors.
  const profit = (subtotal * percent + 500000n) / 1000000n;
  const amount = subtotal + profit;
  if (amount >= limit) return null;
  return { subtotal: decimal(subtotal), profit_amount: decimal(profit), amount: decimal(amount) };
}
export function priceComponents(item: Partial<PriceComponents> & { amount: string }): PriceComponents {
  return {
    base_price: item.base_price ?? item.amount,
    increased_price: item.increased_price ?? '0',
    rolling_price: item.rolling_price ?? '0',
    profit_percent: item.profit_percent ?? '0',
  };
}
export function pricingUpdateTime(value: string) {
  return `${new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })} IST`;
}
