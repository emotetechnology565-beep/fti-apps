export type PaymentSummary = {
  total: string | null;
  paid: string;
  remaining: string | null;
  status: string;
  receipts: { id: string; amount: string; reference: string; at: string }[];
};
export type PaymentDraft = {
  payment_amount: string;
  payment_reference: string;
  payment_id: string;
};
export const newPaymentDraft = (): PaymentDraft => ({
  payment_amount: '',
  payment_reference: '',
  payment_id:
    globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const value = Math.floor(Math.random() * 16);
      return (ch === 'x' ? value : (value & 3) | 8).toString(16);
    }),
});
const validMoney = (value: string) => /^\d+(\.\d{1,2})?$/.test(value);
const cents = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
export function paymentDraftError(
  draft: PaymentDraft,
  remaining?: string | null,
): string | null {
  const amount = draft.payment_amount.trim();
  if (!amount) return null;
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(amount) || cents(amount) <= 0n)
    return 'Enter a positive payment amount with up to two decimals, or leave it blank.';
  if (remaining !== undefined && remaining !== null && !validMoney(remaining))
    return 'Enter a valid order total before recording payment.';
  if (
    remaining !== undefined &&
    remaining !== null &&
    cents(amount) > cents(remaining)
  )
    return 'Payment exceeds the remaining amount.';
  if (
    draft.payment_reference.trim().length < 5 ||
    draft.payment_reference.trim().length > 120
  )
    return 'Enter a payment reference of 5–120 characters.';
  return null;
}
export function remainingAfterPayment(
  remaining: string | null | undefined,
  amount: string,
): string | null {
  if (
    remaining === null ||
    remaining === undefined ||
    !validMoney(remaining) ||
    !validMoney(amount.trim() || '0')
  )
    return null;
  const difference = cents(remaining) - cents(amount.trim() || '0');
  if (difference < 0n) return null;
  return `${difference / 100n}.${(difference % 100n).toString().padStart(2, '0')}`;
}
