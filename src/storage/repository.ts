/**
 * Repositórios de dados locais.
 *
 * - secureRepo: dados financeiros e categorização — SEMPRE cifrados (AES-GCM, DEK do cofre).
 *   Em modo sessão (sem senha) os dados ficam apenas em memória e somem ao fechar a aba.
 * - plainRepo : somente dados não sensíveis (layout do dashboard e preferências de interface).
 */
import type { EncryptedBlob } from '../security/crypto';
import { canPersistData, openRecord, sealRecord } from '../security/vault';
import { idbClear, idbDelete, idbGet, idbGetAll, idbPut, type StoreName, type StoredRecord } from './db';

export type SecureStore = Extract<
  StoreName,
  'pluggy_items' | 'accounts' | 'transactions' | 'credit_cards' | 'bills' | 'investments' | 'categories' | 'snapshots'
>;
export type PlainStore = Extract<StoreName, 'dashboard_layout' | 'user_preferences'>;

export const SECURE_STORES: readonly SecureStore[] = [
  'pluggy_items',
  'accounts',
  'transactions',
  'credit_cards',
  'bills',
  'investments',
  'categories',
  'snapshots',
];

interface SealedRecord extends StoredRecord {
  id: string;
  blob: EncryptedBlob;
  updatedAt: string;
  expiresAt: string | null;
}

export interface Cached<T> {
  value: T;
  updatedAt: string;
  expiresAt: string | null;
  expired: boolean;
}

const memory = new Map<string, { value: unknown; updatedAt: string; expiresAt: string | null }>();
const mkey = (store: string, id: string) => `${store}::${id}`;

export const secureRepo = {
  async put<T>(store: SecureStore, id: string, value: T, ttlMs?: number): Promise<void> {
    const now = new Date();
    const expiresAt = ttlMs ? new Date(now.getTime() + ttlMs).toISOString() : null;
    if (!canPersistData()) {
      memory.set(mkey(store, id), { value: structuredClone(value), updatedAt: now.toISOString(), expiresAt });
      return;
    }
    const blob = await sealRecord(`${store}:${id}`, value);
    const rec: SealedRecord = { id, blob, updatedAt: now.toISOString(), expiresAt };
    await idbPut(store, rec);
  },

  async get<T>(store: SecureStore, id: string): Promise<Cached<T> | null> {
    if (!canPersistData()) {
      const m = memory.get(mkey(store, id));
      if (!m) return null;
      return { value: structuredClone(m.value) as T, updatedAt: m.updatedAt, expiresAt: m.expiresAt, expired: isExpired(m.expiresAt) };
    }
    const rec = await idbGet<SealedRecord>(store, id);
    if (!rec) return null;
    const value = await openRecord<T>(`${store}:${id}`, rec.blob);
    return { value, updatedAt: rec.updatedAt, expiresAt: rec.expiresAt, expired: isExpired(rec.expiresAt) };
  },

  async getAll<T>(store: SecureStore): Promise<Array<Cached<T> & { id: string }>> {
    if (!canPersistData()) {
      const out: Array<Cached<T> & { id: string }> = [];
      for (const [k, m] of memory) {
        if (k.startsWith(`${store}::`)) {
          out.push({ id: k.slice(store.length + 2), value: structuredClone(m.value) as T, updatedAt: m.updatedAt, expiresAt: m.expiresAt, expired: isExpired(m.expiresAt) });
        }
      }
      return out;
    }
    const recs = await idbGetAll<SealedRecord>(store);
    const out: Array<Cached<T> & { id: string }> = [];
    for (const rec of recs) {
      const value = await openRecord<T>(`${store}:${rec.id}`, rec.blob);
      out.push({ id: rec.id, value, updatedAt: rec.updatedAt, expiresAt: rec.expiresAt, expired: isExpired(rec.expiresAt) });
    }
    return out;
  },

  async delete(store: SecureStore, id: string): Promise<void> {
    memory.delete(mkey(store, id));
    if (canPersistData()) await idbDelete(store, id);
  },

  async clearAll(): Promise<void> {
    memory.clear();
    await idbClear(SECURE_STORES);
  },

  /** Limpa apenas a cópia em memória (usado ao bloquear/sair do modo sessão). */
  clearMemory(): void {
    memory.clear();
  },
};

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
}

export const plainRepo = {
  async get<T>(store: PlainStore, id: string): Promise<T | null> {
    const rec = await idbGet<StoredRecord & { value: T }>(store, id);
    return rec ? rec.value : null;
  },
  async put<T>(store: PlainStore, id: string, value: T): Promise<void> {
    await idbPut(store, { id, value: value as unknown, updatedAt: new Date().toISOString() });
  },
  async delete(store: PlainStore, id: string): Promise<void> {
    await idbDelete(store, id);
  },
};
