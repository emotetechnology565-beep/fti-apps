import { identityRpc } from '@features/auth';
import type { BusinessApplication } from '../model/identity-schema';
export const saveProfile = (full_name: string) =>
  identityRpc<void>('fti_save_profile', { p_full_name: full_name });
export const applyBusiness = (application: BusinessApplication) =>
  identityRpc<string>('fti_apply_business', { p_application: application });
export const requestDeletion = () =>
  identityRpc<void>('fti_request_account_deletion');
