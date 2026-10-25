export const orderConfirmationChargesNote =
  'GST and freight are excluded. Both will be added during order confirmation.';

export function hasOrderConfirmationCharges(attributes: Record<string, unknown>): boolean {
  return attributes.grade_list_gst_included === false &&
    attributes.grade_list_freight_excluded === true;
}
