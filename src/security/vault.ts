/**
 * Cofre local (vault) — guarda o Client ID/Secret da Pluggy e a chave que cifra o cache financeiro.
 *
 * Modos:
 *  - 'passphrase': DEK aleatória embrulhada por uma KEK derivada da senha local (PBKDF2). Persistido no IndexedDB.
 *  - 'session'   : nada é persistido. Credenciais ficam cifradas em memória com uma chave efêmera e
 *                  desaparecem ao recarregar/fechar a aba.
 *
 * O Client Secret NUNCA é exposto ao resto do app: só existe decifrado dentro de `useCredentials()`,
 * pelo tempo de uma chamada a POST /auth.
 */
import { APP_CONFIG } from '../config/app.config';
import { idbDelete, idbGet, idbPut, isPersistent } from '../storage/db';
import {
  decryptJson,
  deriveKek,
  encryptJson,
  fromBase64,
  generateDek,
  randomBytes,
  toBase64,
  unwrapDek,
  wrapDek,
  type EncryptedBlob,
} from './crypto';

export interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
}

interface VaultMeta {
  id: 'vault';
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  wrappedDek: string;
  wrapIv: string;
  createdAt: string;
  [k: string]: unknown;
}

interface CredentialsRecord {
  id: 'credentials';
  blob: EncryptedBlob;
  savedAt: string;
  [k: string]: unknown;
}

export type VaultMode = 'passphrase' | 'session';

export class VaultError extends Error {
  constructor(
    public readonly code: 'locked' | 'wrong_passphrase' | 'no_vault' | 'no_credentials' | 'weak_passphrase' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

const CRED_AAD = 'pluggy_credentials:credentials';

let dek: CryptoKey | null = null;
let mode: VaultMode | null = null;
/** Credenciais do modo sessão (cifradas em memória com a DEK efêmera). */
let sessionCredentials: EncryptedBlob | null = null;
const listeners = new Set<(unlocked: boolean) => void>();

function emit(): void {
  for (const l of listeners) l(dek !== null);
}

export function onVaultChange(fn: (unlocked: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isUnlocked(): boolean {
  return dek !== null;
}

export function getVaultMode(): VaultMode | null {
  return mode;
}

/** true quando o cache pode ser persistido (modo senha + IndexedDB disponível). */
export function canPersistData(): boolean {
  return mode === 'passphrase' && isPersistent();
}

export async function vaultExists(): Promise<boolean> {
  return (await idbGet<VaultMeta>('pluggy_credentials', 'vault')) !== undefined;
}

export async function hasStoredCredentials(): Promise<boolean> {
  return (await idbGet<CredentialsRecord>('pluggy_credentials', 'credentials')) !== undefined;
}

export function hasSessionCredentials(): boolean {
  return mode === 'session' && sessionCredentials !== null;
}

function requireDek(): CryptoKey {
  if (!dek) throw new VaultError('locked', 'O cofre local está bloqueado.');
  return dek;
}

/** Cria o cofre com senha local (primeira configuração). */
export async function createVault(passphrase: string): Promise<void> {
  if (passphrase.length < APP_CONFIG.security.minPassphraseLength) {
    throw new VaultError('weak_passphrase', `A senha local precisa ter pelo menos ${APP_CONFIG.security.minPassphraseLength} caracteres.`);
  }
  const salt = randomBytes(16);
  const iterations = APP_CONFIG.security.pbkdf2Iterations;
  const kek = await deriveKek(passphrase, salt, iterations);
  const extractableDek = await generateDek(true);
  const { wrapped, iv } = await wrapDek(extractableDek, kek);
  const meta: VaultMeta = {
    id: 'vault',
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    wrappedDek: wrapped,
    wrapIv: iv,
    createdAt: new Date().toISOString(),
  };
  await idbPut('pluggy_credentials', meta);
  // A cópia usada em memória é NÃO extraível.
  dek = await unwrapDek(wrapped, iv, kek, false);
  mode = 'passphrase';
  sessionCredentials = null;
  emit();
}

/** Inicia uma sessão sem persistência (credenciais só em memória). */
export async function startEphemeralSession(): Promise<void> {
  dek = await generateDek(false);
  mode = 'session';
  sessionCredentials = null;
  emit();
}

export async function unlock(passphrase: string): Promise<void> {
  const meta = await idbGet<VaultMeta>('pluggy_credentials', 'vault');
  if (!meta) throw new VaultError('no_vault', 'Nenhum cofre local configurado neste navegador.');
  const kek = await deriveKek(passphrase, fromBase64(meta.kdf.salt), meta.kdf.iterations);
  try {
    dek = await unwrapDek(meta.wrappedDek, meta.wrapIv, kek, false);
  } catch {
    throw new VaultError('wrong_passphrase', 'Senha local incorreta.');
  }
  mode = 'passphrase';
  emit();
}

/** Descarta chaves e credenciais da memória. */
export function lock(): void {
  dek = null;
  sessionCredentials = null;
  mode = null;
  emit();
}

export async function changePassphrase(current: string, next: string): Promise<void> {
  if (next.length < APP_CONFIG.security.minPassphraseLength) {
    throw new VaultError('weak_passphrase', `A nova senha precisa ter pelo menos ${APP_CONFIG.security.minPassphraseLength} caracteres.`);
  }
  const meta = await idbGet<VaultMeta>('pluggy_credentials', 'vault');
  if (!meta) throw new VaultError('no_vault', 'Nenhum cofre local configurado.');
  const oldKek = await deriveKek(current, fromBase64(meta.kdf.salt), meta.kdf.iterations);
  let extractable: CryptoKey;
  try {
    extractable = await unwrapDek(meta.wrappedDek, meta.wrapIv, oldKek, true);
  } catch {
    throw new VaultError('wrong_passphrase', 'Senha atual incorreta.');
  }
  const salt = randomBytes(16);
  const newKek = await deriveKek(next, salt, APP_CONFIG.security.pbkdf2Iterations);
  const { wrapped, iv } = await wrapDek(extractable, newKek);
  await idbPut('pluggy_credentials', {
    ...meta,
    kdf: { ...meta.kdf, salt: toBase64(salt), iterations: APP_CONFIG.security.pbkdf2Iterations },
    wrappedDek: wrapped,
    wrapIv: iv,
  });
  dek = await unwrapDek(wrapped, iv, newKek, false);
}

export function validateCredentialFormat(c: PluggyCredentials): string | null {
  const id = c.clientId.trim();
  const secret = c.clientSecret.trim();
  if (!id) return 'Informe o Client ID.';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return 'O Client ID deve estar no formato UUID (ex.: 1a2b3c4d-....). Copie-o do Dashboard da Pluggy.';
  }
  if (!secret) return 'Informe o Client Secret.';
  if (secret.length < 16) return 'O Client Secret parece curto demais. Copie-o novamente do Dashboard da Pluggy.';
  if (/\s/.test(secret)) return 'O Client Secret não deve conter espaços.';
  return null;
}

/** Salva as credenciais cifradas (modo senha) ou em memória (modo sessão). */
export async function saveCredentials(c: PluggyCredentials): Promise<void> {
  const key = requireDek();
  const payload = { clientId: c.clientId.trim(), clientSecret: c.clientSecret.trim() };
  const blob = await encryptJson(key, payload, CRED_AAD);
  if (mode === 'session') {
    sessionCredentials = blob;
    return;
  }
  const record: CredentialsRecord = { id: 'credentials', blob, savedAt: new Date().toISOString() };
  await idbPut('pluggy_credentials', record);
}

/**
 * Executa `fn` com as credenciais decifradas. A referência não é guardada em lugar nenhum.
 * (Strings JS são imutáveis e não podem ser zeradas; minimizamos o tempo de vida.)
 */
export async function useCredentials<T>(fn: (c: PluggyCredentials) => Promise<T>): Promise<T> {
  const key = requireDek();
  let blob: EncryptedBlob | null = null;
  if (mode === 'session') {
    blob = sessionCredentials;
  } else {
    const rec = await idbGet<CredentialsRecord>('pluggy_credentials', 'credentials');
    blob = rec?.blob ?? null;
  }
  if (!blob) throw new VaultError('no_credentials', 'Credenciais da Pluggy não configuradas.');
  const creds = await decryptJson<PluggyCredentials>(key, blob, CRED_AAD);
  return fn(creds);
}

/** Dica mascarada do Client ID para exibição (o Secret nunca é exibido). */
export async function getClientIdHint(): Promise<string | null> {
  try {
    return await useCredentials(async (c) => `${c.clientId.slice(0, 8)}…${c.clientId.slice(-4)}`);
  } catch {
    return null;
  }
}

export async function removeCredentials(): Promise<void> {
  sessionCredentials = null;
  await idbDelete('pluggy_credentials', 'credentials');
}

/** Cifra/decifra registros do cache financeiro com a DEK da sessão. */
export async function sealRecord(aad: string, value: unknown): Promise<EncryptedBlob> {
  return encryptJson(requireDek(), value, aad);
}

export async function openRecord<T>(aad: string, blob: EncryptedBlob): Promise<T> {
  return decryptJson<T>(requireDek(), blob, aad);
}
