/**
 * Primitivas criptográficas (Web Crypto API). Nada aqui persiste dados — apenas transforma.
 *
 * Esquema:
 *   KEK = PBKDF2-SHA256(senha local, salt aleatório de 16 bytes, 600.000 iterações) → AES-GCM-256
 *   DEK = chave AES-GCM-256 aleatória, "embrulhada" (wrapKey) pela KEK
 *   Registros = AES-GCM-256(DEK, IV aleatório de 12 bytes, AAD = "<store>:<id>")
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface EncryptedBlob {
  v: 1;
  iv: string; // base64
  ct: string; // base64
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    bin += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';
}

/** Deriva a KEK a partir da senha local. */
export async function deriveKek(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Gera uma DEK (extraível apenas para poder ser embrulhada; a cópia de uso é importada como não-extraível). */
export async function generateDek(extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<{ wrapped: string; iv: string }> {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { wrapped: toBase64(wrapped), iv: toBase64(iv) };
}

/** Desembrulha a DEK. Falha (OperationError) se a senha estiver errada — o GCM autentica o conteúdo. */
export async function unwrapDek(wrapped: string, iv: string, kek: CryptoKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrapped),
    kek,
    { name: 'AES-GCM', iv: fromBase64(iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, plaintext);
  plaintext.fill(0);
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob, aad: string): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv), additionalData: encoder.encode(aad) },
    key,
    fromBase64(blob.ct),
  );
  const bytes = new Uint8Array(pt);
  const text = decoder.decode(bytes);
  bytes.fill(0);
  return JSON.parse(text) as T;
}

/** Avaliação simples de força da senha local (orientação na UI, não é política). */
export function passphraseStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const;
  return { score: s, label: labels[s] };
}
