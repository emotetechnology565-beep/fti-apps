export const accountSections = [
  {id: 'profile', label: 'Personal profile'},
  {id: 'business', label: 'Business details'},
  {id: 'addresses', label: 'Business addresses'},
  {id: 'review', label: 'Review & submit'},
  {id: 'settings', label: 'Account settings'},
] as const;
export type AccountSection = typeof accountSections[number]['id'];
export function selectedAccountSection(value?: string): AccountSection {
  return accountSections.find(item => item.id === value)?.id ?? 'profile';
}
