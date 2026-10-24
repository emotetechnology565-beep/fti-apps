export function isSheetFlatCategory(value: string): boolean {
  return /^(sheet|flat)(-ms)?$/.test(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-'));
}

function paise(value: string): bigint | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
const decimal = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

// The supplied rate sheet adds 18% GST to base rate plus Vadha.
export function sheetFlatPricing(base: string, vadha: string) {
  const baseAmount = paise(base);
  const charge = paise(vadha);
  if (baseAmount === null || baseAmount <= 0n || charge === null) return null;
  const total = baseAmount + charge;
  const gst = (total * 18n + 50n) / 100n;
  return { base: decimal(baseAmount), vadha: decimal(charge), total: decimal(total), gst: decimal(gst), net: decimal(total + gst) };
}
