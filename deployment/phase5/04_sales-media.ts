// Versioned AES-256-GCM envelope. A public Bunny Pull Zone can serve these
// bytes, so the document key must exist only in Supabase Edge Function Secrets.
const marker = new Uint8Array([70, 84, 73, 53]); // FTI5
const nonceLength = 12;
const tagLength = 16;

export async function importDocumentKey(encoded: string): Promise<CryptoKey> {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Invalid document encryption key');
  const raw = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (raw.length !== 32) throw new Error('Invalid document encryption key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealDocument(plain: Uint8Array, objectKey: string, key: CryptoKey): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(nonceLength));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(objectKey), tagLength: 128,
  }, key, Uint8Array.from(plain)));
  const sealed = new Uint8Array(marker.length + nonceLength + ciphertext.length);
  sealed.set(marker);
  sealed.set(nonce, marker.length);
  sealed.set(ciphertext, marker.length + nonceLength);
  return sealed;
}

export async function openDocument(sealed: Uint8Array, objectKey: string, key: CryptoKey, maxPlainBytes: number): Promise<Uint8Array> {
  if (sealed.length < marker.length + nonceLength + tagLength ||
      sealed.length > maxPlainBytes + marker.length + nonceLength + tagLength ||
      !marker.every((byte, index) => sealed[index] === byte)) throw new Error('Invalid encrypted document');
  const nonce = sealed.slice(marker.length, marker.length + nonceLength);
  const ciphertext = sealed.slice(marker.length + nonceLength);
  return new Uint8Array(await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(objectKey), tagLength: 128,
  }, key, ciphertext));
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};
const maxBytes = 3 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const config = {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anon: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  service: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  zone: Deno.env.get('BUNNY_STORAGE_ZONE') ?? '',
  key: Deno.env.get('BUNNY_STORAGE_ACCESS_KEY') ?? '',
  endpoint: Deno.env.get('BUNNY_STORAGE_ENDPOINT') ?? '',
  encryptionKey: Deno.env.get('BUNNY_MEDIA_ENCRYPTION_KEY') ?? '',
};
function ready() {
  try {
    const endpoint = new URL(config.endpoint);
    return !!config.url && !!config.anon && !!config.service && !!config.key &&
      /^[a-z0-9-]{2,100}$/.test(config.zone) && /^[A-Za-z0-9+/]{43}=$/.test(config.encryptionKey) &&
      endpoint.protocol === 'https:' && /^(?:[a-z]{2,3}\.)?storage\.bunnycdn\.com$/.test(endpoint.hostname) &&
      !endpoint.search && !endpoint.hash && !endpoint.pathname.replaceAll('/', '');
  } catch { return false; }
}
function decode(base64: unknown): Uint8Array | null {
  if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(maxBytes * 4 / 3) + 4 ||
    base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  try { const raw = atob(base64); if (raw.length > maxBytes) return null;
    return Uint8Array.from(raw, char => char.charCodeAt(0)); }
  catch { return null; }
}
function encode(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8190)
    result += btoa(String.fromCharCode(...bytes.subarray(i, i + 8190)));
  return result;
}
function validSignature(bytes: Uint8Array, mime: string) {
  if (mime === 'application/pdf') return bytes.length > 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  if (mime === 'image/jpeg') return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).every((b, i) => b === [137,80,78,71,13,10,26,10][i]);
  return false;
}
const rpc = (operation: string, args: object, key: string, authorization: string) => fetch(`${config.url}/rest/v1/rpc/${operation}`, {
  method: 'POST', headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' },
  body: JSON.stringify(args), signal: AbortSignal.timeout(12000),
});
Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { ...cors, 'X-Request-Id': requestId } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', message: 'POST required' }, 405);
  if (!ready()) return json({ code: 'UNAVAILABLE', message: 'Private document service is not configured' }, 503);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ code: 'UNAUTHENTICATED', message: 'Sign in required' }, 401);
  try {
    const verified = await fetch(`${config.url}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: config.anon }, signal: AbortSignal.timeout(8000),
    });
    if (!verified.ok) return json({ code: 'UNAUTHENTICATED', message: 'Session expired; sign in again' }, 401);
    const raw = await request.text();
    if (raw.length > Math.ceil(maxBytes * 4 / 3) + 2048) return json({ code: 'INVALID_INPUT', message: 'Attachment is too large' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ code: 'INVALID_INPUT', message: 'Expected JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'INVALID_INPUT', message: 'Expected object' }, 400);
    if (body.operation === 'download') {
      if (typeof body.assetId !== 'string' || !uuid.test(body.assetId)) return json({ code: 'INVALID_INPUT', message: 'Invalid attachment ID' }, 400);
      const allowed = await rpc('fti_sales_media_access', { p_id: body.assetId }, config.anon, authorization);
      if (!allowed.ok) return json({ code: 'DENIED', message: 'Attachment unavailable' }, allowed.status === 403 ? 403 : 404);
      const asset = await allowed.json();
      if (asset.storage_zone !== config.zone || typeof asset.object_key !== 'string' ||
        !/^rfq-files\/[0-9a-f-]+\/[0-9a-f-]+\.(pdf|jpg|png)$/.test(asset.object_key))
        return json({ code: 'UNAVAILABLE', message: 'Attachment metadata is invalid' }, 502);
      const file = await fetch(`${config.endpoint}/${config.zone}/${asset.object_key}`, {
        headers: { AccessKey: config.key }, signal: AbortSignal.timeout(15000),
      });
      if (!file.ok) return json({ code: 'UNAVAILABLE', message: 'Attachment could not be retrieved' }, 502);
      const sealed = new Uint8Array(await file.arrayBuffer());
      let bytes: Uint8Array;
      try { bytes = await openDocument(sealed, asset.object_key, await importDocumentKey(config.encryptionKey), maxBytes); }
      catch { return json({ code: 'UNAVAILABLE', message: 'Attachment integrity check failed' }, 502); }
      if (bytes.length !== Number(asset.size_bytes) || !validSignature(bytes, asset.mime_type))
        return json({ code: 'UNAVAILABLE', message: 'Attachment integrity check failed' }, 502);
      return json({ data: { mimeType: asset.mime_type, base64: encode(bytes) }, requestId }, 200);
    }
    if (body.operation !== 'upload' || typeof body.rfqId !== 'string' || !uuid.test(body.rfqId) || typeof body.mimeType !== 'string')
      return json({ code: 'INVALID_INPUT', message: 'Invalid attachment request' }, 400);
    const bytes = decode(body.base64);
    if (!bytes || !validSignature(bytes, body.mimeType)) return json({ code: 'INVALID_INPUT', message: 'Only PDF, JPEG or PNG files up to 3 MB are supported' }, 400);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2,'0')).join('');
    const prepared = await rpc('fti_sales_media_prepare', {
      p_rfq: body.rfqId, p_size_bytes: bytes.length, p_mime: body.mimeType, p_sha256_hex: hash,
    }, config.anon, authorization);
    if (!prepared.ok) return json({ code: 'DENIED', message: 'Attachment is not allowed for this request' }, prepared.status === 403 ? 403 : 422);
    const asset = await prepared.json();
    if (!uuid.test(asset.id) || typeof asset.object_key !== 'string' ||
      !/^rfq-files\/[0-9a-f-]+\/[0-9a-f-]+\.(pdf|jpg|png)$/.test(asset.object_key))
      return json({ code: 'UNAVAILABLE', message: 'Attachment metadata is invalid' }, 502);
    const complete = (status: 'verified' | 'rejected') => rpc('fti_sales_media_complete', {
      p_id: asset.id, p_status: status, p_storage_zone: status === 'verified' ? config.zone : null,
    }, config.service, `Bearer ${config.service}`);
    const storageUrl = `${config.endpoint}/${config.zone}/${asset.object_key}`;
    const sealed = await sealDocument(bytes, asset.object_key, await importDocumentKey(config.encryptionKey));
    const storageHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', sealed))).map(b => b.toString(16).padStart(2,'0')).join('');
    let uploaded: Response;
    try { uploaded = await fetch(storageUrl, {
      method: 'PUT', headers: { AccessKey: config.key, 'Content-Type': 'application/octet-stream', Checksum: storageHash.toUpperCase() },
      body: sealed.slice(), signal: AbortSignal.timeout(15000),
    }); } catch { await complete('rejected').catch(() => undefined);
      return json({ code: 'UNAVAILABLE', message: 'Private storage did not respond' }, 503); }
    if (!uploaded.ok) { await complete('rejected').catch(() => undefined);
      return json({ code: 'UNAVAILABLE', message: 'Private storage rejected the attachment' }, 502); }
    const completed = await complete('verified').catch(() => null);
    if (!completed?.ok) {
      await fetch(storageUrl, { method: 'DELETE', headers: { AccessKey: config.key }, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      await complete('rejected').catch(() => undefined);
      return json({ code: 'UNAVAILABLE', message: 'Attachment metadata could not be saved' }, 502);
    }
    return json({ data: { id: asset.id }, requestId }, 200);
  } catch { return json({ code: 'UNAVAILABLE', message: 'Private document service is temporarily unavailable' }, 503); }
});

