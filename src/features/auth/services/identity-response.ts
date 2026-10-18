import { identityErrorMessage } from './identity-error';

const voidOperations = new Set([
  'fti_review_business',
  'fti_save_profile',
  'fti_request_account_deletion',
]);

export async function readIdentityResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await identityErrorMessage({ context: response }));
  }
  const text = await response.text();
  // Account writes return void. Some deployments send an empty JSON body.
  if (!text.trim() && voidOperations.has(operation)) return null as T;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(await identityErrorMessage({ name: 'SyntaxError' }));
  }
  if (body === null && voidOperations.has(operation)) return null as T;
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as { data: T }).data;
  }
  throw new Error('The account service returned an unexpected response. Refresh the application list before trying again.');
}
