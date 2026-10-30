export type OrderKind = 'commerce' | 'material' | 'fastener';

export const canCancelOrder = (status: string) =>
  ['pending_confirmation', 'pending_payment', 'confirmed'].includes(status);

export const canRejectOrder = (status: string) =>
  canCancelOrder(status) || status === 'processing';

export const isClosedOrder = (status: string) =>
  ['cancelled', 'rejected', 'expired', 'refunded', 'delivered'].includes(
    status,
  );
