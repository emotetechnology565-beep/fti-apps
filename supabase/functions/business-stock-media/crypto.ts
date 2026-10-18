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
