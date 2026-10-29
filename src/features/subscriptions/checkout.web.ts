type Order = {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
};
type Result = { order_id: string; payment_id: string; signature: string };
type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open: () => void;
};
const browser = () =>
  window as typeof window & { Razorpay?: RazorpayConstructor };
let scriptPromise: Promise<void> | undefined;
function loadCheckout() {
  if (browser().Razorpay) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error('Payment checkout timed out. Please retry.'));
      }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(
          new Error(
            'Could not load Razorpay. Check your connection and retry.',
          ),
        );
      };
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = undefined;
      throw error;
    });
  return scriptPromise;
}
export async function openCheckout(order: Order): Promise<Result> {
  await loadCheckout();
  const Razorpay = browser().Razorpay;
  if (!Razorpay) throw new Error('Razorpay is unavailable.');
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'FTI',
      description: 'Annual rate access · All categories · No automatic renewal',
      handler: (result: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) =>
        resolve({
          order_id: result.razorpay_order_id,
          payment_id: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        }),
      modal: {
        ondismiss: () =>
          reject(
            new Error(
              'Checkout closed. If money was deducted, refresh your subscription status before trying again.',
            ),
          ),
      },
    });
    checkout.open();
  });
}
