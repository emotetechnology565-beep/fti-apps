// Native checkout is opened in the configured FTI website by SubscriptionCard.
export async function openCheckout(_order: {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}): Promise<{ order_id: string; payment_id: string; signature: string }> {
  throw new Error('Open the FTI website to complete payment.');
}
