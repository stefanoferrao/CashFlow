/**
 * Camada fina sobre IndexedDB. Não conhece criptografia — ver storage/repository.ts.
 * Se o IndexedDB não estiver disponível (ex.: algumas janelas privadas), cai para memória
 * e sinaliza `isPersistent() === false` para a UI avisar o usuário.
 */

export const DB_NAME = 'cashflow';
export const DB_VERSION = 1;

export const STORES = [
  'pluggy_credentials',
  'pluggy_items',
  'accounts',
  'transactions',
  'credit_cards',
  'bills',
  'investments',
  'categories',
  'dashboard_layout',
  'user_preferences',
  'snapshots',
] as const;

export type StoreName = (typeof STORES)[number];

export interface StoredRecord {
  id: string;
  [k: string]: unknown;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryFallback: Map<StoreName, Map<string, StoredRecord>> | null = null;

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction error'));
  });
}

function useMemory(): Map<StoreName, Map<string, StoredRecord>> {
  if (!memoryFallback) {
    memoryFallback = new Map(STORES.map((s) => [s, new Map<string, StoredRecord>()]));
  }
  return memoryFallback;
}

export function isPersistent(): boolean {
  return memoryFallback === null;
}

export async function openDb(): Promise<IDBDatabase | null> {
  if (memoryFallback) return null;
  if (typeof indexedDB === 'undefined') {
    useMemory();
    return null;
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('Falha ao abrir IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
    });
  }
  try {
    return await dbPromise;
  } catch {
    dbPromise = null;
    useMemory();
    return null;
  }
}

export async function idbGet<T extends StoredRecord>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return useMemory().get(store)?.get(id) as T | undefined;
  const tx = db.transaction(store, 'readonly');
  return reqToPromise(tx.objectStore(store).get(id)) as Promise<T | undefined>;
}

export async function idbGetAll<T extends StoredRecord>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) return Array.from(useMemory().get(store)?.values() ?? []) as T[];
  const tx = db.transaction(store, 'readonly');
  return reqToPromise(tx.objectStore(store).getAll()) as Promise<T[]>;
}

export async function idbPut(store: StoreName, value: StoredRecord): Promise<void> {
  const db = await openDb();
  if (!db) {
    useMemory().get(store)?.set(value.id, structuredClone(value));
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function idbDelete(store: StoreName, id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    useMemory().get(store)?.delete(id);
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export async function idbClear(stores: readonly StoreName[]): Promise<void> {
  const db = await openDb();
  if (!db) {
    for (const s of stores) useMemory().get(s)?.clear();
    return;
  }
  const tx = db.transaction(stores as StoreName[], 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  await txDone(tx);
}

export async function idbCount(store: StoreName): Promise<number> {
  const db = await openDb();
  if (!db) return useMemory().get(store)?.size ?? 0;
  const tx = db.transaction(store, 'readonly');
  return reqToPromise(tx.objectStore(store).count());
}

/** Apaga o banco inteiro (usado em "Apagar todos os dados locais"). */
export async function deleteDatabase(): Promise<void> {
  memoryFallback = null;
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
  }
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Falha ao apagar banco local'));
    req.onblocked = () => resolve();
  });
}
