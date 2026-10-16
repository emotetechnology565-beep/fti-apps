export type Address = {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
};
export type Business = {
  id: string;
  legal_name: string;
  gstin: string | null;
  pan: string | null;
  customer_type:
    'retailer' | 'dealer' | 'distributor' | 'manufacturer' | 'industrial_buyer';
  submitted_by: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  revision: number;
  review_note: string | null;
  addresses: Address[];
};
export type Identity = {
  profile: {
    id: string;
    full_name: string;
    phone: string;
    account_status: string;
  };
  roles: string[];
  permissions: string[];
  businesses: Business[];
  deletion_requested: boolean;
};
export function hasPermission(
  identity: Identity | null | undefined,
  permission: string,
) {
  return (
    identity?.profile.account_status === 'active' &&
    identity.permissions.includes(permission)
  );
}
