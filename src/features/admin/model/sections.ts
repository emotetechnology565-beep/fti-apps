import type { Identity } from '@features/auth';

export const staffSections = [
  {id: 'businesses', label: 'Business approvals', icon: 'briefcase', permissions: ['business.review']},
  {id: 'catalogue', label: 'FTI catalogue', icon: 'box', permissions: ['catalog.manage']},
  {id: 'pricing', label: 'Pricing', icon: 'trending-up', permissions: ['price.manage']},
  {id: 'sales', label: 'RFQs & quotations', icon: 'file-text', permissions: ['sales.manage']},
  {id: 'inventory', label: 'FTI inventory', icon: 'package', permissions: ['inventory.manage']},
  {id: 'tractor-orders', label: 'Tractor order confirmation', icon: 'shopping-cart', permissions: ['order.manage']},
  {id: 'payments', label: 'Payment review', icon: 'credit-card', permissions: ['payment.review']},
  {id: 'order-policy', label: 'Order settings', icon: 'settings', permissions: ['order.policy']},
  {id: 'reservations', label: 'Order reservations', icon: 'clock', permissions: ['order.manage']},
  {id: 'dispatch', label: 'Dispatch & delivery', icon: 'truck', permissions: ['operations.manage']},
  {id: 'support', label: 'Support tickets', icon: 'help-circle', permissions: ['support.manage']},
  {id: 'reports', label: 'Reports & audit', icon: 'bar-chart-2', permissions: ['operations.manage']},
  {id: 'jobs', label: 'Background jobs', icon: 'refresh-cw', permissions: ['operations.manage']},
  {id: 'announcements', label: 'Announcements', icon: 'volume-2', permissions: ['content.manage']},
  {id: 'business-stock', label: 'Business stock review', icon: 'layers', permissions: ['stock.review']},
] as const;
export type StaffSection = typeof staffSections[number];
export function availableStaffSections(identity: Identity | null | undefined): StaffSection[] {
  if (identity?.profile.account_status !== 'active' || !identity.permissions.includes('staff.access')) return [];
  return staffSections.filter(section => section.permissions.some(permission => identity.permissions.includes(permission)));
}
export function selectedStaffSection(identity: Identity | null | undefined, requested: unknown): StaffSection | undefined {
  const available = availableStaffSections(identity);
  return available.find(section => section.id === requested) ?? available[0];
}
