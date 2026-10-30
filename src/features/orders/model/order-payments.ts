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
const cents = (value: string) => Math.round(Number(value) * 100);
export function paymentDraftError(
  draft: PaymentDraft,
  remaining?: string | null,
): string | null {
  const amount = draft.payment_amount.trim();
  if (!amount) return null;
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(amount) || cents(amount) <= 0)
    return 'Enter a positive payment amount with up to two decimals, or leave it blank.';
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
  if (remaining === null || remaining === undefined) return null;
  return ((cents(remaining) - cents(amount || '0')) / 100).toFixed(2);
}
