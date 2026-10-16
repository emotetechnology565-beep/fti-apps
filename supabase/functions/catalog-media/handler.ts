export type CatalogMediaConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  storageZone: string;
  storageAccessKey: string;
  storageEndpoint: string;
  cdnBaseUrl: string;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBytes = 3 * 1024 * 1024;
const maxBody = Math.ceil(maxBytes * 4 / 3) + 1024;
const result = (body: unknown, status: number, requestId: string) => Response.json(body, { status, headers: { ...cors, 'X-Request-Id': requestId } });

function validConfig(config: CatalogMediaConfig) {
  try {
    const storage = new URL(config.storageEndpoint);
    const cdn = new URL(config.cdnBaseUrl);
    return !!config.supabaseUrl && !!config.anonKey && !!config.serviceKey &&
      !!config.storageAccessKey && /^[a-z0-9-]{2,100}$/.test(config.storageZone) &&
      storage.protocol === 'https:' && /^(?:[a-z]{2}\.)?storage\.bunnycdn\.com$/.test(storage.hostname) &&
      cdn.protocol === 'https:' && !cdn.search && !cdn.hash && !cdn.pathname.replaceAll('/', '');
  } catch { return false; }
}

function decodeJpeg(encoded: unknown): Uint8Array | null {
  if (typeof encoded !== 'string' || encoded.length < 8 || encoded.length > Math.ceil(maxBytes * 4 / 3) ||
    encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  try {
    const raw = atob(encoded);
    if (raw.length < 4 || raw.length > maxBytes || raw.charCodeAt(0) !== 0xff ||
      raw.charCodeAt(1) !== 0xd8 || raw.charCodeAt(2) !== 0xff ||
      raw.charCodeAt(raw.length - 2) !== 0xff || raw.charCodeAt(raw.length - 1) !== 0xd9) return null;
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

export async function handleCatalogMedia(request: Request, config: CatalogMediaConfig, send: typeof fetch = fetch): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return result({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405, requestId);
  if (!validConfig(config)) return result({ code: 'UNAVAILABLE', message: 'Image service is not configured' }, 503, requestId);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return result({ code: 'UNAUTHENTICATED', message: 'Sign in required' }, 401, requestId);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > maxBody) return result({ code: 'INVALID_INPUT', message: 'Image is too large' }, 413, requestId);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
  } catch { return result({ code: 'INVALID_INPUT', message: 'Invalid image request' }, 400, requestId); }
  if (body.operation !== 'upload' && body.operation !== 'remove') return result({ code: 'INVALID_INPUT', message: 'Unsupported image operation' }, 400, requestId);
  if (body.operation === 'upload' && (typeof body.productId !== 'string' || !uuid.test(body.productId)))
    return result({ code: 'INVALID_INPUT', message: 'Select a product' }, 400, requestId);
  if (body.operation === 'remove' && (typeof body.assetId !== 'string' || !uuid.test(body.assetId)))
    return result({ code: 'INVALID_INPUT', message: 'Select an image' }, 400, requestId);
  const bytes = body.operation === 'upload' ? decodeJpeg(body.base64) : null;
  if (body.operation === 'upload' && !bytes) return result({ code: 'INVALID_INPUT', message: 'Select a JPEG image up to 3 MB' }, 400, requestId);

  const supabaseBase = config.supabaseUrl.replace(/\/$/, '');
  const rpc = async (operation: string, args: unknown, key: string, bearer: string) => send(`${supabaseBase}/rest/v1/rpc/${operation}`, {
    method: 'POST', headers: { apikey: key, Authorization: bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });
  try {
    const verified = await send(`${supabaseBase}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: authorization }, signal: AbortSignal.timeout(8000),
    });
    if (!verified.ok) return result({ code: 'UNAUTHENTICATED', message: 'Session expired; sign in again' }, 401, requestId);
    if (body.operation === 'remove') {
      const removed = await rpc('fti_catalog_media_remove', { p_id: body.assetId }, config.anonKey, authorization);
      if (!removed.ok) return result({ code: 'DENIED', message: 'Could not remove this product image' }, removed.status === 403 ? 403 : 422, requestId);
      const objectKey = await removed.json();
      if (typeof objectKey === 'string' && /^product-images\/[0-9a-f-]+\/[0-9a-f-]+\.jpg$/.test(objectKey)) {
        // Removal from the catalogue is committed first; cached CDN copies may remain until expiry.
        await send(`${config.storageEndpoint.replace(/\/$/, '')}/${config.storageZone}/${objectKey}`, {
          method: 'DELETE', headers: { AccessKey: config.storageAccessKey }, signal: AbortSignal.timeout(10000),
        }).catch(() => undefined);
      }
      return result({ data: { removed: true }, requestId }, 200, requestId);
    }
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes!))))
      .map(value => value.toString(16).padStart(2, '0')).join('');
    const prepared = await rpc('fti_catalog_media_prepare', {
      p_product_id: body.productId, p_size_bytes: bytes!.byteLength, p_sha256_hex: checksum,
    }, config.anonKey, authorization);
    if (!prepared.ok) {
      const error = await prepared.json().catch(() => ({}));
      const message = error.code === '22023' || error.code === 'P0002' ? error.message : 'Image upload is not allowed';
      return result({ code: error.code ?? 'DENIED', message }, prepared.status === 403 ? 403 : 422, requestId);
    }
    const asset = await prepared.json();
    if (!uuid.test(asset.id) || !/^product-images\/[0-9a-f-]+\/[0-9a-f-]+\.jpg$/.test(asset.object_key))
      return result({ code: 'UNAVAILABLE', message: 'Image service returned invalid metadata' }, 502, requestId);
    const storageUrl = `${config.storageEndpoint.replace(/\/$/, '')}/${config.storageZone}/${asset.object_key}`;
    const cdnUrl = `${config.cdnBaseUrl.replace(/\/$/, '')}/${asset.object_key}`;
    const complete = (status: 'verified' | 'rejected') => rpc('fti_catalog_media_complete', {
      p_id: asset.id, p_status: status, p_cdn_url: status === 'verified' ? cdnUrl : null,
      p_storage_zone: status === 'verified' ? config.storageZone : null,
    }, config.serviceKey, `Bearer ${config.serviceKey}`);
    let uploaded: Response;
    try {
      uploaded = await send(storageUrl, {
        method: 'PUT', headers: { AccessKey: config.storageAccessKey, 'Content-Type': 'image/jpeg', Checksum: checksum.toUpperCase() },
        body: bytes!.slice(), signal: AbortSignal.timeout(15000),
      });
    } catch {
      await complete('rejected').catch(() => undefined);
      return result({ code: 'STORAGE_ERROR', message: 'Image storage did not respond' }, 503, requestId);
    }
    if (!uploaded.ok) {
      await complete('rejected').catch(() => undefined);
      return result({ code: 'STORAGE_ERROR', message: 'Image storage rejected the upload' }, 502, requestId);
    }
    let completed: Response;
    try { completed = await complete('verified'); }
    catch {
      await send(storageUrl, { method: 'DELETE', headers: { AccessKey: config.storageAccessKey }, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      await complete('rejected').catch(() => undefined);
      return result({ code: 'UNAVAILABLE', message: 'Image metadata could not be saved' }, 502, requestId);
    }
    if (!completed.ok) {
      await send(storageUrl, { method: 'DELETE', headers: { AccessKey: config.storageAccessKey }, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      await complete('rejected').catch(() => undefined);
      return result({ code: 'UNAVAILABLE', message: 'Image metadata could not be saved' }, 502, requestId);
    }
    return result({ data: { id: asset.id, product_id: body.productId, url: cdnUrl, mime_type: 'image/jpeg' }, requestId }, 200, requestId);
  } catch {
    return result({ code: 'UNAVAILABLE', message: 'Image service is temporarily unavailable' }, 503, requestId);
  }
}
