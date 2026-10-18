const voidOperations = new Set([
  'fti_operations_whatsapp_opt_in',
  'fti_operations_whatsapp_replay',
  'fti_operations_reply',
  'fti_operations_deliver',
  'fti_operations_read',
  'fti_operations_replay',
  'fti_operations_content_publish',
]);

export async function readOperationsResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    let message = response.status === 401
      ? 'Your session expired. Sign in again to update your preferences.'
      : 'Operations request failed. Refresh your updates before trying again.';
    try {
      const body = await response.json();
      if (typeof body?.message === 'string' && body.message) message = body.message;
    } catch { /* Gateways may return a non-JSON error. */ }
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  const text = await response.text();
  if (!text.trim() && voidOperations.has(operation)) return null as T;
  let body: unknown;
  try { body = JSON.parse(text); }
  catch {
    throw new Error('The operations service returned an unreadable response. Refresh your updates to check whether the change was saved.');
  }
  if (body === null && voidOperations.has(operation)) return null as T;
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as { data: T }).data;
  }
  throw new Error('The operations service returned an unexpected response. Refresh your updates before trying again.');
}
