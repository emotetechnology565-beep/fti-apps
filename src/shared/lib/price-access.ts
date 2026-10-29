// In-memory display guard only. Every price API independently checks entitlement.
let accessUntil = 0;
const listeners = new Set<() => void>();
export function setPriceAccess(expiresAt: string | null) {
  accessUntil = expiresAt ? Date.parse(expiresAt) : 0;
  listeners.forEach((listener) => listener());
}
export function subscribePriceAccess(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function canViewPublicPrices(): boolean {
  return Number.isFinite(accessUntil) && accessUntil > Date.now();
}

export const priceSubscriptionMessage =
  'Unlock current rates across all categories with an annual FTI subscription. Quotations remain available without a subscription.';

// Defense in depth for older servers and locally cached catalogue responses.
export function redactPublicPrices<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactPublicPrices) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(^|_)(price|prate|rate|rates|amount|cost|discount|profit|rolling|loading|freight|gst|tax)(_|$)/i.test(
              key,
            ),
        )
        .map(([key, item]) => [key, redactPublicPrices(item)]),
    ) as T;
  }
  return value;
}
