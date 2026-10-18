export async function identityErrorMessage(error: {
  name?: string;
  message?: string;
  context?: unknown;
}): Promise<string> {
  if (error.name === 'FunctionsFetchError') {
    return 'Could not reach the account service. Check your connection. Refresh the application list before trying the decision again.';
  }
  const response = error.context;
  if (!response || typeof response !== 'object' ||
      !('status' in response) || typeof response.status !== 'number' ||
      !('json' in response) || typeof response.json !== 'function' ||
      !('headers' in response) || !response.headers || typeof response.headers !== 'object' ||
      !('get' in response.headers) || typeof response.headers.get !== 'function') {
    if (error.name === 'SyntaxError') {
      return 'The account service returned an unreadable response. Refresh the application list to check whether your decision was saved before trying again.';
    }
    return 'Account service is unavailable. Refresh the application list before trying again.';
  }
  let message = response.status === 401
    ? 'Your session could not be verified. Sign in again and complete staff verification.'
    : response.status === 403
      ? 'Business review access was denied. Check your staff permissions and authenticator verification.'
      : 'Account request failed. Refresh the application list before trying again.';
  let requestId = response.headers.get('x-request-id');
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      if ('message' in body && typeof body.message === 'string' && body.message) {
        message = body.message;
      }
      if ('requestId' in body && typeof body.requestId === 'string') {
        requestId = body.requestId;
      }
    }
  } catch {
    // Gateways can return a non-JSON error page.
  }
  return `${message} (HTTP ${response.status}${requestId ? `; reference ${requestId}` : ''})`;
}
