const publicOperations = new Set(['fti_pricing_markets', 'fti_pricing_rates', 'fti_pricing_history']);

type PricingConnection = { url: string; key: string; accessToken?: string };

export async function requestPricing<T>(
  connection: PricingConnection,
  operation: string,
  args: Record<string, unknown> = {},
  send: typeof fetch = fetch,
): Promise<T> {
  if (!publicOperations.has(operation) && !connection.accessToken) {
    throw new Error('Sign in and complete authenticator verification before managing pricing.');
  }
  let response: Response;
  try {
    response = await send(`${connection.url.replace(/\/$/, '')}/functions/v1/pricing`, {
      method: 'POST',
      headers: {
        apikey: connection.key,
        Authorization: `Bearer ${connection.accessToken ?? connection.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation, arguments: args }),
    });
  } catch {
    throw new Error('Could not reach pricing. Check your connection and refresh pricing before retrying to avoid creating a duplicate market.');
  }
  let body: unknown;
  try { body = JSON.parse(await response.text()); }
  catch { /* Report the HTTP status even for empty or non-JSON responses. */ }
  if (!response.ok) {
    let message = response.status === 401
      ? 'Your pricing session could not be verified. Sign in again and complete authenticator verification.'
      : response.status === 403
        ? 'Pricing access was denied. Check your pricing permissions and authenticator verification.'
        : response.status === 404
          ? 'The pricing service is not deployed at the configured endpoint.'
          : 'Pricing request failed. Refresh pricing before trying again.';
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && body.message) {
      message = body.message;
    }
    const reference = response.headers.get('x-request-id') ||
      (body && typeof body === 'object' && 'requestId' in body && typeof body.requestId === 'string' ? body.requestId : null);
    throw new Error(`${message} (HTTP ${response.status}${reference ? `; reference ${reference}` : ''})`);
  }
  if (body && typeof body === 'object' && 'data' in body && body.data != null) return body.data as T;
  throw new Error('Pricing returned an unexpected response. Refresh pricing to check whether your change was saved before trying again.');
}
